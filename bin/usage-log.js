#!/usr/bin/env node
/**
 * usage-log.js — metadata-only usage events for the coaching feature (PRD: docs/usage-coaching-prd.md).
 *
 * Appends one JSON line per event to ~/.health-harness/usage/<YYYY-MM-DD>.jsonl. **Metadata ONLY** — a
 * per-event field allowlist drops everything else, so code/prompts/file-contents/PHI can never land here.
 * Fire-and-forget: never throws, always exits 0.
 *
 * Used two ways:
 *   - in-process: require() it and call appendEvent(event, data) (from session-context.js, outward-guard.js)
 *   - as a hook: `node usage-log.js <hookType>` reads the hook's stdin JSON → events → append
 */
'use strict';

// Per-event field allowlist. Anything not listed is dropped — the privacy guarantee, enforced in code.
const ALLOW = {
  session_start: ['issueKey'],   // the ticket the session opened on (branch-derived) → per-ticket attribution
  tool: ['tool', 'ok'],
  edit: ['ext'],
  gate_run: ['result', 'issueKey'],
  // per-slice quality signals (emitted on push, attributed to the ticket) — the data that matters most with
  // agents: did the slice actually add tests, and did it ship with a verified gate?
  test_change: ['hasTests', 'hasSource', 'issueKey', 'sha'],  // hasSource && !hasTests = behavior change, no tests; sha = commit to inspect on dispute
  gate_evidence: ['state', 'issueKey', 'sha'],               // verified | unverified | no-gate at push
  criteria_coverage: ['covered', 'total', 'uncovered', 'issueKey', 'sha'], // per-ticket: how many authored criteria are pinned by a test (counts only, never criterion text/code)
  command: ['name', 'issueKey'],
  wall: ['action', 'why'],
  user_reject: [], interrupt: [], revert: [], correction: [],
  prompt: ['lenBucket', 'hasContext', 'issueKey'],
  prompt_quality: ['score', 'flags'],
  commit: ['sizeBucket', 'branchKind', 'issueKey', 'fp', 'fpConf'],   // branch-derived ticket → commits attributable per ticket; fp = hashed dominant-unit fingerprint (rework signal)
  // ticket_transition (MBI-44): one raw Jira status change. status LABELS + coarse category per side + when.
  // Dashboard segments dev-time vs QA-wait from the stream. Labels are workflow names (not sensitive); never
  // summary/description/assignee/comment. →done = ship boundary; done→indeterminate = reopen.
  ticket_transition: ['issueKey', 'fromStatus', 'toStatus', 'fromCat', 'toCat', 'at'],
  redaction: ['hits'],
  // best-practice / hygiene signals (emitted by skills via the `emit` CLI; metadata only)
  breaking_change: ['kind', 'confirmed', 'issueKey'],
  migration: ['pattern', 'issueKey'],
  migration_gap: ['reason'],
  test_strength: ['kind', 'score'],   // kind=mutation|property; score = mutation %, cheap/CI-ingested
  coverage_drop: ['delta'],           // coverage points dropped
  dep_hygiene: ['kind', 'count'],     // kind=stale|unpinned|major|vuln
  compaction: [], subagent: [],
  // issue-switch nudge (bin/issue-switch-nudge.js): the user referenced a DIFFERENT issue key than the one
  // this session started on. The signal we care about = did they pile new work onto a heavy session?
  // RAW inputs (newKey/relatedTo/thresholdK/contextBucket) are stored alongside the DERIVED verdict
  // (tier/nudged) so the relatedness rule or the size threshold can be re-decided over history later.
  issue_switch: ['contextBucket', 'nudged', 'tier', 'newKey', 'relatedTo', 'thresholdK'],
  // issue_meta: a point-in-time snapshot of an issue's graph edges (as they were when the work happened),
  // shipped once per new key per session. This is the ONLY place the parent/epic/links relation reaches the
  // backend — issue-graph.json is local + mutable, so without this the relation is unrecoverable later.
  // clusterKey (epic ?? parent ?? key) is a rebuildable cache; parent/epic/links are the immutable facts.
  // type/priority are captured at /align (the engineer's own Jira — Atlas can't reach it) for the dashboard filter.
  issue_meta: ['key', 'parent', 'epic', 'links', 'clusterKey', 'type', 'priority'],
};

// keep only allowlisted, scalar fields (no nested objects/content)
function sanitize(event, data) {
  const allow = ALLOW[event];
  if (!allow) return null; // unknown event → drop entirely
  const out = {};
  for (const k of allow) {
    const v = (data || {})[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') continue; // never store structured content
    out[k] = typeof v === 'string' ? v.slice(0, 40) : v; // cap string length defensively
  }
  return out;
}

const GATE_RE = /\b(npm (run )?(test|lint|build|typecheck)|yarn (test|lint)|pnpm (test|lint)|jest|vitest|pytest|go test|gradle|mvn|tsc|eslint|make( test| ci)?)\b/i;
// committing AI work (small-steps signal) vs reverting it (an "objecting" / hard-harnessing signal)
const COMMIT_RE = /\bgit\s+commit\b/i;
const REVERT_RE = /\bgit\s+(revert\b|reset\s+--hard\b|checkout\s+(--?|HEAD|[0-9a-f]{7,})|restore\b|clean\s+-[a-z]*f)/i;

/** Pure: parse a slash-command name from raw prompt/command text. Strips the leading '/' and any plugin
 * namespace ("health-harness:align" → "align"). Never returns the args. '' if not a command. */
function commandName(text) {
  const t = String(text || '').trim();
  if (!t.startsWith('/')) return '';
  const first = t.replace(/^\//, '').split(/\s+/)[0] || '';
  return first.split(':').pop();
}
/** Pure: extract a Jira/Linear issue key (e.g. ACME-258) from text — a non-sensitive identifier used to
 * group work by ticket (Atlas joins it to Jira for type/priority/severity). '' if none. */
const ISSUE_RE = /\b[A-Z][A-Z0-9]+-\d+\b/;
function issueKey(text) { const m = String(text || '').match(ISSUE_RE); return m ? m[0] : ''; }
/** Pure: bucket a prompt's length without storing it. */
function lenBucket(len) { return len < 80 ? 's' : len < 400 ? 'm' : 'l'; }
/** Pure: does the prompt carry intent-sharpening context (a file ref, a ticket id, or an @mention)? */
function hasContextMarkers(text) {
  const t = String(text || '');
  return /[\w./-]+\.[a-z]{1,8}\b/i.test(t) || /\b[A-Z]{2,}-\d+\b/.test(t) || /(^|\s)@[\w./-]+/.test(t);
}

/** Pure: map a hook's stdin payload to zero+ {event,data} records. */
function eventsFromHook(hookType, input) {
  const inp = input || {};
  const out = [];
  if (hookType === 'posttooluse' || hookType === 'posttoolfail') {
    const ok = hookType === 'posttooluse';
    const tool = String(inp.tool_name || '');
    out.push({ event: 'tool', data: { tool, ok } });
    if (/^(Edit|Write|MultiEdit)$/.test(tool)) {
      const fp = String((inp.tool_input || {}).file_path || '');
      const ext = fp.includes('.') ? fp.split('.').pop().slice(0, 8) : '';
      if (ext) out.push({ event: 'edit', data: { ext } });
    }
    if (tool === 'Bash') {
      const cmd = String((inp.tool_input || {}).command || '');
      if (GATE_RE.test(cmd)) out.push({ event: 'gate_run', data: { result: ok ? 'pass' : 'fail' } });
      if (ok && COMMIT_RE.test(cmd)) out.push({ event: 'commit', data: {} }); // branchKind/sizeBucket enriched in entry
      if (ok && REVERT_RE.test(cmd)) out.push({ event: 'revert', data: {} });
    }
  } else if (hookType === 'userpromptsubmit') {
    // The raw user turn. Metadata only: length bucket + a context flag, never the text. A leading '/'
    // also yields a command event (align/tdd adoption — feeds the "align before code" dimension).
    const text = String(inp.prompt || inp.user_prompt || '');
    const name = commandName(text);
    const key = issueKey(text); // the Jira ticket the work is on (for per-issue / by-type slicing)
    if (name) out.push({ event: 'command', data: { name, ...(key ? { issueKey: key } : {}) } });
    out.push({ event: 'prompt', data: { lenBucket: lenBucket(text.length), hasContext: hasContextMarkers(text), ...(key ? { issueKey: key } : {}) } });
  } else if (hookType === 'command') {
    // legacy/explicit command hook (kept for back-compat). Never store the args.
    const name = commandName(String(inp.command || inp.name || ''));
    if (name) out.push({ event: 'command', data: { name } });
  } else if (hookType === 'precompact') {
    out.push({ event: 'compaction', data: {} });
  } else if (hookType === 'subagentstop') {
    out.push({ event: 'subagent', data: {} });
  }
  return out;
}

/** Impure: enrich a commit event with branchKind + sizeBucket from git (PostToolUse fires after the
 * commit succeeded, so HEAD is the new commit). Best-effort — returns data unchanged on any failure. */
function enrichCommit(data) {
  try {
    const { execSync } = require('child_process');
    const run = (c) => execSync(c, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    const branch = run('git rev-parse --abbrev-ref HEAD');
    const out = { ...data };
    if (branch) {
      out.branchKind = /^(main|master|develop|release.*)$/i.test(branch) ? 'base' : 'feature';
      const ik = issueKey(branch);
      if (ik) out.issueKey = ik; // attribute the commit to its ticket
    }
    const n = parseInt(run('git show --stat --format="" HEAD | tail -1 | grep -oE "[0-9]+ insertion" | grep -oE "[0-9]+"') || '0', 10) || 0;
    out.sizeBucket = n < 25 ? 's' : n < 150 ? 'm' : 'l';
    // fingerprint the dominant changed unit (symbol/function) so rework = "the same logical unit came
    // back", not "someone touched that file again". Best-effort in its OWN try so a fp failure never
    // costs us branchKind/sizeBucket. Only the HASH is stored — see commitFingerprint.
    try {
      const f = commitFingerprint(run('git show --format= --unified=0 HEAD'));
      if (f) { out.fp = f.fp; out.fpConf = f.fpConf; }
    } catch { /* fp is best-effort */ }
    return out;
  } catch { return data; }
}

/** Pure: short one-way hash (path/symbol never stored in the clear). */
function hash16(s) {
  return require('crypto').createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
}

/** Pure: parse a unified diff (git show patch) into changed units — one per hunk. git already names the
 * enclosing function/section in the hunk header (`@@ -a,b +c,d @@ <section>`) via its own funcname
 * heuristics, so there's NO language parser here. confidence='symbol' when git named a section, else
 * 'range' (line position). `changed` counts +/- lines so the caller can pick the dominant unit. */
function fingerprintUnits(patch) {
  const units = [];
  let path = null;
  for (const line of String(patch || '').split('\n')) {
    let m;
    if ((m = /^\+\+\+ (?:b\/)?(.+)$/.exec(line))) { const p = m[1].trim(); if (p && p !== '/dev/null') path = p; continue; }
    if ((m = /^diff --git a\/.+ b\/(.+)$/.exec(line))) { path = m[1].trim(); continue; }
    if ((m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line))) {
      const symbol = (m[2] || '').trim();
      units.push({ path: path || null, symbol: symbol || null, startLine: parseInt(m[1], 10) || 0, changed: 0,
        confidence: symbol ? 'symbol' : 'range' });
      continue;
    }
    if (units.length && (line[0] === '+' || line[0] === '-')) units[units.length - 1].changed++;
  }
  return units;
}

/** Pure: one fingerprint per commit = the hashed identity of its DOMINANT changed unit (most changed
 * lines). Prefers a named symbol; falls back to the hunk's line-range, then to file-level when git names
 * no hunk at all. Only the hash + a confidence enum (`symbol|range|file`) are returned — raw path/symbol
 * never leave. Returns null when the patch names no file at all. */
function commitFingerprint(patch) {
  const units = fingerprintUnits(patch).filter((u) => u.path);
  if (units.length) {
    const u = units.reduce((a, b) => (b.changed > a.changed ? b : a), units[0]);
    const key = u.confidence === 'symbol' ? `${u.path}#${u.symbol}` : `${u.path}@${u.startLine}`;
    return { fp: hash16(key), fpConf: u.confidence };
  }
  // no hunk parsed — file-level fallback if the patch still names a file
  const fm = /^\+\+\+ (?:b\/)?(.+)$/m.exec(String(patch || '')) || /^diff --git a\/.+ b\/(.+)$/m.exec(String(patch || ''));
  const file = fm && fm[1].trim() && fm[1].trim() !== '/dev/null' ? fm[1].trim() : null;
  return file ? { fp: hash16(file), fpConf: 'file' } : null;
}

/** Pure-ish: the point-in-time graph snapshot for a key from the local issue-graph cache, shaped for an
 * `issue_meta` event. parent/epic/links are the immutable facts; clusterKey (epic ?? parent ?? key) is a
 * rebuildable cache so the backend can group without re-implementing relatedness. Returns null if no key. */
function graphMetaFor(key, graph) {
  if (!key) return null;
  let g = graph;
  if (!g) { try { g = require('./issue-graph.js').loadGraph() || {}; } catch { g = {}; } }
  const n = g[key] || {};
  const parent = n.parent || null, epic = n.epic || null;
  const links = Array.isArray(n.links) && n.links.length ? n.links.join(',') : null; // scalar string of Jira keys
  const out = { key, parent, epic, links, clusterKey: epic || parent || key };
  // type/priority are captured at /align (Atlas can't reach Jira) — include them when known so the dashboard
  // can slice by Bug/Story/Task/Epic + priority without any Jira call of its own.
  if (n.type) out.type = String(n.type);
  if (n.priority) out.priority = String(n.priority);
  return out;
}

/** Impure: emit one issue_meta for `key`, de-duped per (session-day, key) via a tiny marker file so a long
 * session doesn't re-ship the same snapshot every turn. Best-effort — never throws into the hook path. */
function emitIssueMeta(key) {
  if (!key) return;
  try {
    const fs = require('fs'), path = require('path');
    const seenPath = path.join(usageDir(), '.issue-meta-seen.json');
    let seen = {};
    try { seen = JSON.parse(fs.readFileSync(seenPath, 'utf8')); } catch { /* none */ }
    const day = new Date().toISOString().slice(0, 10);
    if (seen.day !== day) seen = { day, keys: [] }; // reset daily so a re-parent re-snapshots next day
    if (seen.keys.includes(key)) return; // already shipped this key today
    const meta = graphMetaFor(key);
    if (!meta) return;
    appendEvent('issue_meta', meta);
    seen.keys.push(key);
    fs.writeFileSync(seenPath, JSON.stringify(seen));
  } catch { /* best-effort */ }
}

/** Pure: walk a Jira changelog → one raw `ticket_transition` per status change. Each carries the workflow
 * status LABELS (fromStatus/toStatus — workflow names, not sensitive) AND Jira's coarse category for each
 * side (via the supplied id→category map), plus the timestamp. The dashboard segments dev-time vs QA-wait
 * downstream — the producer stays raw. Custom-status-safe: an unmapped id → category 'unknown' but the
 * status NAME is still captured, so a custom status is never lost. Never throws. */
function ticketTransitions(issueKey, changelog, statusCatById) {
  if (!issueKey) return [];
  const map = statusCatById || {};
  const histories = (changelog && (changelog.histories || changelog.values)) || (Array.isArray(changelog) ? changelog : []);
  const out = [];
  for (const h of histories) {
    for (const it of (h && h.items) || []) {
      if (!it || it.field !== 'status') continue;
      out.push({
        issueKey,
        fromStatus: it.fromString || null,
        toStatus: it.toString || null,
        fromCat: map[it.from] || 'unknown',
        toCat: map[it.to] || 'unknown',
        at: (h && h.created) || null,
      });
    }
  }
  return out;
}

/** Pure: harvest a `{statusId: categoryKey}` map from the Jira data the agent already fetches. The changelog
 * itself carries NO category — only the current status (`getJiraIssue`) and transition targets
 * (`getTransitions`) do — so we learn categories from those and accumulate them across reads. Never throws. */
function statusCatFromJira(issueResp, transitionsResp) {
  const map = {};
  const cur = issueResp && issueResp.fields && issueResp.fields.status;
  if (cur && cur.id && cur.statusCategory && cur.statusCategory.key) map[String(cur.id)] = cur.statusCategory.key;
  for (const t of (transitionsResp && transitionsResp.transitions) || []) {
    const to = t && t.to;
    if (to && to.id && to.statusCategory && to.statusCategory.key) map[String(to.id)] = to.statusCategory.key;
  }
  return map;
}

/** Pure: merge category maps across reads — fresh wins, so the map fills as more statuses are seen. */
function mergeStatusCategories(existing, fresh) {
  return { ...(existing || {}), ...(fresh || {}) };
}

/** Pure: derive ticket_transition events straight from a `getJiraIssue(expand=changelog)` response + an
 * id→category map. Pulls issueKey + changelog from the response so the agent just hands over the raw API
 * payload. Never throws. */
function transitionsFromIssue(issueResp, statusCatById) {
  if (!issueResp) return [];
  return ticketTransitions(issueResp.key, issueResp.changelog, statusCatById || {});
}

/** Pure: drop transitions already seen on a prior read. Identity = `issueKey|at` (a status change is the
 * one event at that instant). Returns the fresh events + the updated key set to persist (issue_meta marker
 * pattern), so re-reading the same changelog never double-counts. */
function dedupeTransitions(events, seenKeys) {
  const seen = new Set(seenKeys || []);
  const fresh = [];
  for (const e of events || []) {
    const k = `${e.issueKey}|${e.at}`;
    if (seen.has(k)) continue;
    seen.add(k);
    fresh.push(e);
  }
  return { fresh, keys: [...seen] };
}

/** Pure: propose a status→stage-role map from each status's Jira category + name. `new`→todo,
 * `done`→ship; an `indeterminate` status is classified by name (review / qa / active). When a custom
 * indeterminate status matches no heuristic it gets the safe `active` default AND sets `needsConfirm` —
 * the signal for the agent to confirm the mapping ONCE (custom workflows) and persist it to project.json.
 * Stage roles let the dashboard segment dev-time vs QA-wait; the coarse category alone can't. */
function inferStageRoles(statuses) {
  const roles = {};
  let needsConfirm = false;
  for (const s of statuses || []) {
    const name = String((s && s.name) || ''); const cat = String((s && s.category) || '');
    if (cat === 'new') { roles[name] = 'todo'; continue; }
    if (cat === 'done') { roles[name] = 'ship'; continue; }
    // indeterminate (or unknown) → classify by name
    if (/review/i.test(name)) roles[name] = 'review';
    else if (/\b(qa|uat|test|verif)/i.test(name)) roles[name] = 'qa';
    else if (/progress|develop|doing|wip|build|implement/i.test(name)) roles[name] = 'active';
    else { roles[name] = 'active'; needsConfirm = true; } // custom/ambiguous → default + flag to confirm
  }
  return { roles, needsConfirm };
}

/** Impure: derive + record the ticket_transition stream for one issue, de-duped across reads via a marker
 * file (issue_meta pattern) so re-reading the same changelog never double-counts. Best-effort; returns the
 * number of fresh events appended. */
function emitTicketTransitions(issueKey, changelog, statusCatById) {
  try {
    const fs = require('fs'), path = require('path');
    const all = ticketTransitions(issueKey, changelog, statusCatById);
    if (!all.length) return 0;
    const seenPath = path.join(usageDir(), '.ticket-transition-seen.json');
    let prior = [];
    try { prior = (JSON.parse(fs.readFileSync(seenPath, 'utf8')).keys) || []; } catch { /* none */ }
    const { fresh, keys } = dedupeTransitions(all, prior);
    for (const e of fresh) appendEvent('ticket_transition', e);
    try { fs.mkdirSync(usageDir(), { recursive: true }); fs.writeFileSync(seenPath, JSON.stringify({ keys: keys.slice(-2000) })); } catch { /* ignore */ }
    return fresh.length;
  } catch { return 0; }
}

/** Impure: the learned id→category map — a LOCAL accumulating cache (not committed project config, so it
 * never churns git). Lives next to the dedup marker. */
function loadStatusCats() {
  try { return JSON.parse(require('fs').readFileSync(require('path').join(usageDir(), '.status-cats.json'), 'utf8')) || {}; } catch { return {}; }
}
function saveStatusCats(map) {
  try { const fs = require('fs'), path = require('path'); fs.mkdirSync(usageDir(), { recursive: true }); fs.writeFileSync(path.join(usageDir(), '.status-cats.json'), JSON.stringify(map)); } catch { /* best-effort */ }
}

/** Impure: the wiring entry point — given the RAW Jira responses the agent already fetches (a
 * getJiraIssue(expand=changelog) response + an optional getTransitions response), learn any new
 * id→category mappings, persist the accumulated map locally, then emit the deduped ticket_transition
 * stream. Returns the number of fresh events. Never throws. */
function emitTransitionsFromJira(issueResp, transitionsResp) {
  try {
    const merged = mergeStatusCategories(loadStatusCats(), statusCatFromJira(issueResp, transitionsResp));
    saveStatusCats(merged);
    return emitTicketTransitions(issueResp && issueResp.key, issueResp && issueResp.changelog, merged);
  } catch { return 0; }
}

module.exports = { eventsFromHook, sanitize, ALLOW, GATE_RE, appendEvent, gitEmail, usageDir,
  commandName, lenBucket, hasContextMarkers, enrichCommit, harnessVersion, issueKey, parseKv,
  graphMetaFor, emitIssueMeta, fingerprintUnits, commitFingerprint, hash16,
  ticketTransitions, dedupeTransitions, inferStageRoles, emitTicketTransitions,
  statusCatFromJira, mergeStatusCategories, transitionsFromIssue, emitTransitionsFromJira };

// ── writer ────────────────────────────────────────────────────────────────────
function usageDir() {
  const os = require('os'), path = require('path');
  return path.join(os.homedir(), '.health-harness', 'usage');
}
let _email; // memoize
function gitEmail() {
  if (_email !== undefined) return _email;
  try {
    _email = require('child_process').execSync('git config user.email', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim() || null;
  } catch { _email = null; }
  return _email;
}
let _ver; // memoize the installed harness version (stamped on every record for cohort/version analysis)
function harnessVersion() {
  if (_ver !== undefined) return _ver;
  try {
    _ver = require('../.claude-plugin/plugin.json').version || null;
  } catch { _ver = null; }
  return _ver;
}
function appendEvent(event, data) {
  try {
    const fs = require('fs'), path = require('path');
    const clean = sanitize(event, data);
    if (!clean) return;
    const now = new Date();
    const dir = usageDir();
    fs.mkdirSync(dir, { recursive: true });
    // `id` is a stable per-record dedup key: written ONCE here, so an at-least-once re-send (a slice that
    // POSTed but whose offset wasn't recorded before a crash) carries the SAME id → the server drops the
    // duplicate. Without it, retries would over-count. See bin/usage-upload.js + the Atlas ingest route.
    const rec = { v: 1, id: require('crypto').randomUUID(), ts: now.toISOString(), userId: gitEmail(), repoId: repoId(), hv: harnessVersion(), event, ...clean };
    fs.appendFileSync(path.join(dir, `${now.toISOString().slice(0, 10)}.jsonl`), JSON.stringify(rec) + '\n');
  } catch { /* fire-and-forget */ }
}
function repoId() {
  try {
    const top = require('child_process').execSync('git rev-parse --show-toplevel', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    return top ? require('path').basename(top) : null;
  } catch { return null; }
}

/** Pure: parse `k=v` CLI args into a data object, coercing true/false and plain numbers. */
function parseKv(args) {
  const out = {};
  for (const a of args || []) {
    const i = String(a).indexOf('=');
    if (i <= 0) continue;
    const k = a.slice(0, i), v = a.slice(i + 1);
    out[k] = v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }
  return out;
}

// ── hook entry ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const hookType = process.argv[2] || '';
  // `emit` subcommand — skills record a metadata-only signal: usage-log.js emit <event> k=v …
  // (allowlist still applies via appendEvent→sanitize, so non-allowed fields are dropped.)
  if (hookType === 'emit') {
    try { appendEvent(process.argv[3] || '', parseKv(process.argv.slice(4))); } catch { /* ignore */ }
    process.exit(0);
  }
  // `ticket-transitions` (MBI-44) — the agent feeds RAW Jira JSON so the DETERMINISTIC parser (not the LLM)
  // derives + dedups the status-transition stream: usage-log.js ticket-transitions <KEY> <changelog.json> <statusCatMap.json>
  if (hookType === 'ticket-transitions') {
    try {
      const fs = require('fs');
      const changelog = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
      const statusMap = JSON.parse(fs.readFileSync(process.argv[5], 'utf8'));
      const n = emitTicketTransitions(process.argv[3] || '', changelog, statusMap);
      process.stdout.write(JSON.stringify({ ok: true, fresh: n }));
    } catch (e) { process.stdout.write(JSON.stringify({ ok: false, error: String((e && e.message) || e) })); }
    process.exit(0);
  }
  // `emit-transitions` (MBI-46) — the wiring entry: the agent dumps the RAW getJiraIssue(expand=changelog)
  // response (+ optional getTransitions response) and the code derives the category map, accumulates it, and
  // emits the deduped stream: usage-log.js emit-transitions <issue.json> [transitions.json]
  if (hookType === 'emit-transitions') {
    try {
      const fs = require('fs');
      const issueResp = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
      const transitionsResp = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : null;
      const n = emitTransitionsFromJira(issueResp, transitionsResp);
      process.stdout.write(JSON.stringify({ ok: true, fresh: n }));
    } catch (e) { process.stdout.write(JSON.stringify({ ok: false, error: String((e && e.message) || e) })); }
    process.exit(0);
  }
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  const go = () => {
    try {
      const input = raw ? JSON.parse(raw) : {};
      let _branch; // memoize the branch lookup (one git call) → ticket attribution for the signals below
      const ikBranch = () => { if (_branch === undefined) { try { _branch = require('child_process').execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim(); } catch { _branch = ''; } } return issueKey(_branch); };
      for (const e of eventsFromHook(hookType, input)) {
        let data = e.data;
        if (e.event === 'commit') data = enrichCommit(e.data);
        else if (e.event === 'gate_run') { const ik = ikBranch(); if (ik) data = { ...e.data, issueKey: ik }; } // per-ticket pass/fail
        appendEvent(e.event, data);
        // Record DETERMINISTIC gate evidence keyed to the current commit — the wall/ship read this so a
        // hallucinated "tests pass" can't get past publish (only a real passing run leaves the fingerprint).
        if (e.event === 'gate_run') { try { const ge = require('./gate-evidence.js'); ge.record(process.cwd(), ge.headSha(), e.data.result); } catch { /* best-effort */ } }
      }
      // On `git push`, emit the per-slice quality signals (deterministic, hook-driven — NOT agent narration),
      // attributed to the ticket: did this slice add tests, and did it ship gate-verified?
      if (hookType === 'posttooluse' && /\bgit\s+push\b/.test(String((input.tool_input || {}).command || ''))) {
        try {
          const slice = require('./slice-tests.js'), ge = require('./gate-evidence.js'), ik = ikBranch();
          const cls = slice.classifyDiff(slice.diffPaths(slice.baseBranch()), { extraTestRe: slice.projectTestRe() });
          // short HEAD sha → the dashboard can name the exact commit to inspect; the dev reproduces the flag
          // locally with `node slice-tests.js --explain` at that sha (deterministic, no server detail needed).
          let sha = ''; try { sha = ge.headSha() ? String(ge.headSha()).slice(0, 7) : ''; } catch { /* none */ }
          appendEvent('test_change', { hasTests: cls.hasTests, hasSource: cls.hasSource, ...(sha ? { sha } : {}), ...(ik ? { issueKey: ik } : {}) });
          appendEvent('gate_evidence', { state: ge.currentState().state, ...(sha ? { sha } : {}), ...(ik ? { issueKey: ik } : {}) });
          // criterion-coverage: counts only (how many authored acceptance criteria are pinned by a test)
          try {
            const cc = require('./criteria-coverage.js').currentCoverage();
            if (cc && cc.hasManifest && cc.cov) {
              const total = cc.cov.covered.length + cc.cov.uncovered.length + cc.cov.deferred.length;
              appendEvent('criteria_coverage', { covered: cc.cov.covered.length, total, uncovered: cc.cov.uncovered.length, ...(sha ? { sha } : {}), ...(ik ? { issueKey: ik } : {}) });
            }
          } catch { /* best-effort */ }
        } catch { /* best-effort */ }
      }
      // Ticketless-work nudge — on the FIRST code mutation in a session with no linked ticket, surface a
      // soft one-line reminder (once per session, passive, non-blocking). Q&A-only turns never reach here
      // (no Edit/Write). maybeNudge short-circuits cheaply when a ticket is resolvable or already warned.
      if (hookType === 'posttooluse' && /^(Edit|Write|MultiEdit)$/.test(String(input.tool_name || ''))) {
        try {
          const msg = require('./ticketless-nudge.js').maybeNudge({ sessionId: input.session_id, cwd: process.cwd() });
          if (msg) process.stdout.write(JSON.stringify({ systemMessage: msg }));
        } catch { /* best-effort — never block a turn */ }
      }
      // Issue-switch nudge — folded into THIS already-running hook (no extra process per turn). evaluate()
      // short-circuits unless the prompt names a NEW ticket different from the session's anchor, so the
      // common turn costs only a regex. A returned string is surfaced to the user as a systemMessage.
      if (hookType === 'userpromptsubmit') {
        const msg = require('./issue-switch-nudge.js').evaluate({
          prompt: String(input.prompt || input.user_prompt || ''),
          sessionId: input.session_id,
          transcriptPath: input.transcript_path,
        });
        if (msg) process.stdout.write(JSON.stringify({ systemMessage: msg }));
      }
    } catch { /* defer */ }
    process.exit(0);
  };
  process.stdin.on('end', go);
  setTimeout(go, 300); // don't hang if no stdin
}
