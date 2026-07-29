#!/usr/bin/env node
/**
 * open-questions.js — the "I don't know yet" ledger (MBI-129, Slice 1 / MBI-134).
 *
 * During /tdd, when the agent hits a decision the acceptance criteria don't determine, it logs a structured
 * question here instead of silently guessing — proceeding on its recommendation and leaving the entry `open`
 * = a guess awaiting human ratification. A DETERMINISTIC push gate blocks shipping while any entry is open
 * (the human answers → resolved → ships). Determinism lives in the GATE + the schema, never in the detection
 * (what to log is LLM judgment; the TOOL owns the shape so the file is always consistent).
 *
 * Ledger: .health-harness/open-questions/<KEY>.json — resolved off the branch's ticket key, like the criteria
 * manifest. Opt-in: no file → dormant (the gate no-ops). One entry:
 *   { id, ac, question, options[], recommendation, status: open|resolved, answer, resolvedBy, builtFiles[] }
 *
 * Pure (unit-tested): emptyLedger, addQuestion, resolveQuestion, openCount, gateDecision.
 * Impure: readLedger, addToFile, resolveInFile, branchKey, currentLedger + add/resolve/list/count CLI.
 */
'use strict';

function emptyLedger(issueKey) { return { issueKey: issueKey || null, questions: [] }; }

/** Pure: append a question. The tool assigns the id + normalizes the shape — the caller only supplies content. */
function addQuestion(ledger, q) {
  const led = ledger && Array.isArray(ledger.questions) ? ledger : emptyLedger((ledger || {}).issueKey);
  const n = led.questions.length + 1;
  const entry = {
    id: `Q-${n}`,
    ac: (q && q.ac) || null,
    question: String((q && q.question) || '').trim(),
    options: Array.isArray(q && q.options) ? q.options.map(String) : [],
    recommendation: (q && q.recommendation != null) ? String(q.recommendation) : null,
    status: 'open',
    answer: null,
    resolvedBy: null,
    builtFiles: Array.isArray(q && q.builtFiles) ? q.builtFiles.map(String) : [],
  };
  return { ...led, questions: [...led.questions, entry] };
}

/** Pure: resolve one entry by id (records the human's answer). Unknown id → unchanged. */
function resolveQuestion(ledger, id, res) {
  const led = ledger && Array.isArray(ledger.questions) ? ledger : emptyLedger((ledger || {}).issueKey);
  return {
    ...led,
    questions: led.questions.map((q) => (q.id === id
      ? { ...q, status: 'resolved', answer: (res && res.answer != null) ? String(res.answer) : q.answer, resolvedBy: (res && res.resolvedBy) || q.resolvedBy }
      : q)),
  };
}

/** Pure: number of still-open questions. */
function openCount(ledger) {
  if (!ledger || !Array.isArray(ledger.questions)) return 0;
  return ledger.questions.filter((q) => q.status === 'open').length;
}

/** Pure: the deterministic gate decision. Any open question → ASK (conscious ratification), listing them.
 * gate id 'openQuestions' (auto-approvable via wall.autoApprove.openQuestions). Empty/null → null (dormant). */
function gateDecision(ledger) {
  if (!ledger || !Array.isArray(ledger.questions)) return null;
  const open = ledger.questions.filter((q) => q.status === 'open');
  if (open.length === 0) return null;
  const list = open.map((q) => `  • [${q.ac || '?'}] ${q.question}${q.recommendation ? ` (rec: ${q.recommendation})` : ''}`).join('\n');
  return {
    action: 'ask', why: 'open_questions', gate: 'openQuestions',
    reason: `health-harness wall: ${open.length} unresolved question(s) on ${ledger.issueKey || 'this ticket'} — `
      + `ratify each answer before shipping (they're guesses the build made and left open):\n${list}\n`
      + `Resolve with \`open-questions.js resolve <id> --answer …\`, or approve to ship on the recommendations. `
      + `Set wall.autoApprove.openQuestions=true to stop asking.`,
  };
}

// ── impure: file + branch resolution ──────────────────────────────────────────
function ledgerPath(root, key) { return require('path').join(root || process.cwd(), '.health-harness', 'open-questions', `${key}.json`); }

function readLedger(root, key) {
  try { return JSON.parse(require('fs').readFileSync(ledgerPath(root, key), 'utf8')); }
  catch { return emptyLedger(key); }
}
function writeLedger(root, key, ledger) {
  const fs = require('fs'), path = require('path');
  const p = ledgerPath(root, key);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(ledger, null, 2) + '\n');
  return p;
}
function addToFile(root, key, q) { return writeLedger(root, key, addQuestion(readLedger(root, key), q)); }
function resolveInFile(root, key, id, res) { return writeLedger(root, key, resolveQuestion(readLedger(root, key), id, res)); }

/** The Jira key on the current branch (feature/MBI-134-… → MBI-134), or null. */
function branchKey(cwd) {
  try {
    const b = require('child_process').execSync('git rev-parse --abbrev-ref HEAD',
      { cwd: cwd || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    const m = b.match(/[A-Z][A-Z0-9]+-\d+/);
    return m ? m[0] : null;
  } catch { return null; }
}
/** The ledger for the current branch's ticket ({ key, ledger }); ledger empty when none/dormant. */
function currentLedger(cwd) {
  const key = branchKey(cwd);
  return { key, ledger: key ? readLedger(cwd || process.cwd(), key) : emptyLedger(null) };
}

module.exports = {
  emptyLedger, addQuestion, resolveQuestion, openCount, gateDecision,
  ledgerPath, readLedger, writeLedger, addToFile, resolveInFile, branchKey, currentLedger,
};

// ── CLI: add / resolve / list / count ─────────────────────────────────────────
if (require.main === module) {
  const [mode, ...rest] = process.argv.slice(2);
  const arg = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  const root = process.cwd();
  if (mode === 'add') {
    const key = rest[0] && !rest[0].startsWith('--') ? rest[0] : branchKey(root);
    if (!key) { console.error('open-questions: no ticket (pass a key or use a feature/<KEY>-… branch)'); process.exit(1); }
    addToFile(root, key, {
      ac: arg('ac'), question: arg('q') || arg('question'),
      options: (arg('options') || '').split('|').map((s) => s.trim()).filter(Boolean),
      recommendation: arg('rec') || arg('recommendation'),
      builtFiles: (arg('files') || '').split(',').map((s) => s.trim()).filter(Boolean),
    });
    console.log(`logged an open question on ${key}.`);
  } else if (mode === 'resolve') {
    const id = rest[0];
    const { key } = currentLedger(root);
    if (!key || !id) { console.error('usage: open-questions resolve <Q-id> --answer "…"'); process.exit(1); }
    resolveInFile(root, key, id, { answer: arg('answer'), resolvedBy: arg('by') });
    console.log(`resolved ${id} on ${key}.`);
  } else if (mode === 'list') {
    const { key, ledger } = currentLedger(root);
    if (!key) { console.log('No ticket on this branch.'); process.exit(0); }
    const open = ledger.questions.filter((q) => q.status === 'open');
    console.log(open.length ? open.map((q) => `${q.id} [${q.ac || '?'}] ${q.question}${q.recommendation ? `  (rec: ${q.recommendation})` : ''}`).join('\n')
      : `No open questions on ${key}.`);
  } else if (mode === 'count') {
    console.log(String(openCount(currentLedger(root).ledger)));
  } else {
    console.log('usage: open-questions add <KEY> --ac AC-1 --q "…" [--options "a|b"] [--rec "…"] [--files "f1,f2"] | resolve <Q-id> --answer "…" [--by email] | list | count');
  }
}
