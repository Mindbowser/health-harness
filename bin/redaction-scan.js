#!/usr/bin/env node
/**
 * redaction-scan.js — the deterministic scanner behind the `phi-redaction-check` skill.
 *
 * Scans files/dirs for regulated data and FAILS (exit 1) on any hit. Profile-driven:
 * it reads `.mb-harness/compliance.json` (see the `compliance-profile` skill) to decide
 * which classes to enforce. Default profile = `hipaa` (the MB fail-safe).
 *
 * Classes:
 *   secrets   — API keys, AWS keys, private-key blocks, JWTs, tokens, user:pass@ URLs   (ALWAYS)
 *   pii       — emails, phone numbers, US SSNs                                            (hipaa/pci/gdpr)
 *   phi       — MRN / DOB labels (+ pii)                                                  (hipaa)
 *   pan       — payment card numbers (Luhn-valid)                                         (pci)
 *   commercial— deal $ / stage / sentiment / denylisted names  (Studio-only, OPT-IN)
 *
 * Names/free-text PII can't be regex'd reliably — supply known strings via config.deny
 * (e.g. a patient name in a fixture). config.allow exempts confirmed false positives.
 *
 * API (pure, unit-tested):
 *   classesForProfile(profile)            -> string[]
 *   scanText(text, opts?, file?)          -> hit[]      hit = {file,line,class,snippet}
 *   validate(paths, opts?)                -> { ok, hits }
 *   loadConfig(cwd?)                       -> { profile, classes, allow, deny }
 * CLI:
 *   node bin/redaction-scan.js --path <dir|file> [--profile hipaa] [--config <json>]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PROFILE_CLASSES = {
  hipaa: ['phi', 'pii', 'secrets'],
  pci: ['pan', 'pii', 'secrets'],
  gdpr: ['pii', 'secrets'],
  none: ['secrets'],
};
const DEFAULT_PROFILE = 'hipaa';

const SNIPPET_MAX = 160;
const SCAN_EXTS = new Set([
  '.md', '.markdown', '.json', '.txt', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs',
  '.html', '.htm', '.css', '.scss', '.yml', '.yaml', '.env', '.py', '.go', '.rb', '.java', '.cs', '.php',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.husky', '.github', '.vscode', '.idea']);

// ── pattern primitives ─────────────────────────────────────────────────────────
const RE = {
  // secrets
  awsKey: /\bAKIA[0-9A-Z]{16}\b/,
  privateKey: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  jwt: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  githubToken: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  slackToken: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  // generic `secret = "longish-value"` assignments
  secretAssign: /\b(?:api[_-]?key|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd|pwd)\b\s*[:=]\s*['"]?[A-Za-z0-9_\-/+.=]{12,}['"]?/i,
  // user:pass@host connection strings
  credUrl: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s:@]+@[^/\s]+/i,
  // pii
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/,
  phone: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/,
  // phi labels
  mrn: /\b(?:MRN|medical[\s_-]?record[\s_-]?(?:number|no|#)?)\b\s*[:#]?\s*\w+/i,
  dob: /\b(?:DOB|date[\s_-]?of[\s_-]?birth)\b\s*[:=]?\s*\d/i,
  // commercial (Studio-only, opt-in)
  currencySigil: /\$\s?\d[\d,]*(?:\.\d+)?/,
  currencyWord: /\b\d[\d,]*(?:\.\d+)?\s?(?:USD|dollars?)\b/i,
  stageClosed: /\bClosed[\s\-.]?(?:Won|Lost)\b/i,
  sentiment: /\b(?:sentiment\s*[:=]|win[_\s-]?probability|close[_\s-]?probability|churn\s+risk|BATNA)\b/i,
};

function luhnValid(digits) {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}

// Detect a Luhn-valid 13–19 digit run (card-like), ignoring spaces/dashes.
function hasPan(line) {
  const m = line.match(/\b(?:\d[ -]?){13,19}\b/g);
  if (!m) return false;
  return m.some((cand) => {
    const digits = cand.replace(/[ -]/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
  });
}

function classesForProfile(profile) {
  return PROFILE_CLASSES[profile] || PROFILE_CLASSES[DEFAULT_PROFILE];
}

function snippet(line) {
  const t = line.trim();
  return t.length > SNIPPET_MAX ? t.slice(0, SNIPPET_MAX) + '…' : t;
}
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Scan a string. Pure. opts = { classes?, allow?, deny? }. Defaults to hipaa classes.
 * @returns {Array<{file,line,class,snippet}>}
 */
function scanText(text, opts, file) {
  const o = opts || {};
  const classes = new Set(o.classes || classesForProfile(DEFAULT_PROFILE));
  const allow = new Set((o.allow || []).map((s) => String(s).toLowerCase()));
  const denyRe = (o.deny && o.deny.length)
    ? new RegExp('\\b(?:' + o.deny.map(escapeRe).join('|') + ')\\b', 'i') : null;

  const hits = [];
  // Neutralize base64 data-URIs (inline images/fonts) to avoid coincidental matches.
  const scannable = String(text).replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi, 'data:[embedded]');
  scannable.split(/\r?\n/).forEach((line, i) => {
    const ln = i + 1;
    const allowed = (m) => m && allow.has(m[0].toLowerCase());
    const push = (cls) => hits.push({ file: file || null, line: ln, class: cls, snippet: snippet(line) });

    if (classes.has('secrets')) {
      if (RE.awsKey.test(line) || RE.privateKey.test(line) || RE.jwt.test(line) ||
          RE.githubToken.test(line) || RE.slackToken.test(line) || RE.secretAssign.test(line) ||
          RE.credUrl.test(line)) push('secrets');
    }
    if (classes.has('pii')) {
      const em = line.match(RE.email);
      if (em && !allowed(em)) push('pii');
      else if (RE.ssn.test(line) || RE.phone.test(line)) push('pii');
    }
    if (classes.has('phi')) {
      if (RE.mrn.test(line) || RE.dob.test(line)) push('phi');
    }
    if (classes.has('pan') && hasPan(line)) push('pan');
    if (classes.has('commercial')) {
      if (RE.currencySigil.test(line) || RE.currencyWord.test(line) || RE.stageClosed.test(line) ||
          RE.sentiment.test(line)) push('commercial');
    }
    if (denyRe) {
      const m = line.match(denyRe);
      if (m && !allowed(m)) push('deny');
    }
  });
  return hits;
}

function loadConfig(cwd) {
  const root = cwd || process.cwd();
  const p = path.join(root, '.mb-harness', 'compliance.json');
  let profile = DEFAULT_PROFILE, allow = [], deny = [], classes = null;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    profile = j.profile || DEFAULT_PROFILE;
    allow = j.allow || [];
    deny = j.deny || [];
    classes = j.dataClasses || null;
  } catch { /* absent ⇒ default hipaa */ }
  if (!classes) classes = classesForProfile(profile);
  if (!classes.includes('secrets')) classes = classes.concat('secrets'); // secrets always on
  return { profile, classes, allow, deny };
}

function isTextFile(p) {
  if (SCAN_EXTS.has(path.extname(p).toLowerCase())) return true;
  if (path.extname(p) === '') {
    try { return !fs.readFileSync(p).slice(0, 1024).includes(0); } catch { return false; }
  }
  return false;
}
function walk(target, out) {
  const st = fs.statSync(target);
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(target))) return;
    for (const e of fs.readdirSync(target)) walk(path.join(target, e), out);
  } else if (st.isFile() && isTextFile(target)) out.push(target);
}

/** Walk paths, scan text files. opts as scanText. @returns {{ok, hits}} */
function validate(paths, opts) {
  const list = Array.isArray(paths) ? paths : [paths];
  const files = [];
  for (const p of list) { if (fs.existsSync(p)) walk(p, files); }
  const hits = [];
  for (const f of files) {
    let text; try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const h of scanText(text, opts, f)) hits.push(h);
  }
  return { ok: hits.length === 0, hits };
}

module.exports = { classesForProfile, scanText, validate, loadConfig, luhnValid, PROFILE_CLASSES, DEFAULT_PROFILE };

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const target = get('--path') || get('--file');
  if (!target) { process.stderr.write('usage: redaction-scan.js --path <dir|file> [--profile <p>] [--config <json>]\n'); process.exit(2); }
  const cfg = loadConfig();
  const profile = get('--profile');
  if (profile) { cfg.profile = profile; cfg.classes = classesForProfile(profile); if (!cfg.classes.includes('secrets')) cfg.classes = cfg.classes.concat('secrets'); }
  const cfgPath = get('--config');
  if (cfgPath) { try { Object.assign(cfg, JSON.parse(fs.readFileSync(cfgPath, 'utf8'))); } catch (e) { process.stderr.write(`bad --config: ${e.message}\n`); process.exit(2); } }
  const { ok, hits } = validate(target, { classes: cfg.classes, allow: cfg.allow, deny: cfg.deny });
  if (ok) { process.stdout.write(`redaction: clean (profile=${cfg.profile}, classes=${cfg.classes.join(',')})\n`); process.exit(0); }
  process.stderr.write(JSON.stringify(hits, null, 2) + '\n');
  process.stderr.write(`redaction: ${hits.length} hit(s) [profile=${cfg.profile}]\n`);
  process.exit(1);
}
