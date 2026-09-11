#!/usr/bin/env node
/**
 * issue-refs.js — pull the issue keys a human EXPLICITLY referenced out of free text (MBI-156).
 *
 * The bug this fixes: `/align` fetched only the target ticket, so naming related stories — in the
 * invocation ("align MBI-123, see also MBI-100") or inside the ticket body ("depends on MBI-90") — had no
 * effect. The keys were recorded as link metadata but their CONTENT never reached the alignment, so the
 * design concept was formed without context the human had pointed straight at.
 *
 * The hard part is not matching `KEY-123`, it's NOT matching the many things shaped like it. In this repo
 * `AC-1` (acceptance-criteria ids) appears in almost every ticket body, and standards (`UTF-8`, `RFC-2606`,
 * `SHA-256`) are everywhere in the source. Passing the repo's own project key removes the ambiguity
 * entirely; the noise list is the fallback when no project key is known.
 */
'use strict';

// Token prefixes that are key-shaped but never an issue key.
const NOISE_PREFIXES = [
  'AC',                                            // acceptance-criteria ids — the most common false hit
  'UTF', 'ISO', 'RFC', 'SHA', 'MD', 'AES', 'RSA', 'BASE', 'ASCII', // encodings / standards / crypto
  'CVE', 'HTTP', 'HTTPS', 'TLS', 'SSL', 'IPV', 'ES', 'ECMA',
  'UTC', 'GMT', 'SLA', 'API', 'CI', 'PDF', 'JSON', 'HTML', 'CSS', 'SQL', 'UUID', 'COVID', 'X', 'Y', 'Z',
];

const KEY_RE = /\b([A-Za-z][A-Za-z0-9]{0,9})-(\d{1,6})\b/g;
const DEFAULT_MAX = 10; // keep the alignment context inside the smart zone

/**
 * Pure: every issue key referenced in `text`, in first-appearance order, deduped.
 * opts = {
 *   projectKeys?: string|string[]  // when known, ONLY these projects match (kills the noise problem)
 *   exclude?: string|string[]      // keys to drop (the target being aligned)
 *   max?: number                   // cap (default 10)
 * }
 */
function extractIssueKeys(text, opts) {
  const o = opts || {};
  const projects = (Array.isArray(o.projectKeys) ? o.projectKeys : (o.projectKeys ? [o.projectKeys] : []))
    .map((p) => String(p).toUpperCase());
  const excluded = new Set((Array.isArray(o.exclude) ? o.exclude : (o.exclude ? [o.exclude] : []))
    .map((k) => String(k).toUpperCase()));
  const max = o.max === undefined ? DEFAULT_MAX : o.max;

  const seen = new Set();
  const out = [];
  let m;
  KEY_RE.lastIndex = 0;
  while ((m = KEY_RE.exec(String(text || '')))) {
    const prefix = m[1].toUpperCase();
    const key = `${prefix}-${parseInt(m[2], 10)}`;
    if (projects.length ? !projects.includes(prefix) : NOISE_PREFIXES.includes(prefix)) continue;
    if (excluded.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= max) break;
  }
  return out;
}

module.exports = { extractIssueKeys, NOISE_PREFIXES, DEFAULT_MAX };

// ── CLI ─────────────────────────────────────────────────────────────────────
//   issue-refs.js "<text>" [--project MBI] [--exclude MBI-1] [--max 10]
if (require.main === module) {
  const argv = process.argv.slice(2);
  const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const text = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--'))).join(' ');
  const max = flag('max');
  process.stdout.write(JSON.stringify({
    keys: extractIssueKeys(text, {
      projectKeys: flag('project') ? flag('project').split(',') : undefined,
      exclude: flag('exclude') ? flag('exclude').split(',') : undefined,
      max: max ? parseInt(max, 10) : undefined,
    }),
  }) + '\n');
}
