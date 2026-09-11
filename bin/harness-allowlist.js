#!/usr/bin/env node
/**
 * harness-allowlist.js — clear a CONFIRMED false positive from the secret/PHI scan (MBI-152), with an
 * audit trail, without hand-editing JSON. This is the ONLY escape from the locked scan: there is no
 * command to disable scanning. Each entry records value + reason (required) + author + timestamp and is
 * appended to `.health-harness/compliance.json` `allow`, which redaction-scan.js reads.
 *
 *   harness-allowlist add "<value>" --reason "<why>"   # append an audited allow entry (reason required)
 *   harness-allowlist list                             # show the current allow-list with reasons
 *
 * addAllowEntry() is pure (exported for tests); the CLI does the git-author lookup + file I/O.
 */
'use strict';

/** Pure: append a { value, reason, by, at } record to an existing allow array (strings or records),
 * deduped by value (re-adding updates the record). Refuses a missing value or reason.
 * @returns {{ok:true, allow:Array}|{ok:false, error:string}} */
function addAllowEntry(existingAllow, value, reason, meta) {
  if (!value) return { ok: false, error: 'a value is required' };
  if (!reason || !String(reason).trim()) return { ok: false, error: 'a --reason is required (allow-listing is audited)' };
  const rec = { value: String(value), reason: String(reason).trim(), by: (meta && meta.by) || 'unknown', at: (meta && meta.at) || new Date().toISOString() };
  const kept = (existingAllow || []).filter((a) => (typeof a === 'string' ? a : (a && a.value)) !== rec.value);
  return { ok: true, allow: [...kept, rec] };
}

module.exports = { addAllowEntry };

// ── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs'), path = require('path');
  const file = path.join(process.cwd(), '.health-harness', 'compliance.json');
  const readCfg = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { profile: 'hipaa' }; } };
  const gitAuthor = () => {
    try { return require('child_process').execSync('git config user.email || git config user.name', { encoding: 'utf8' }).trim(); }
    catch { return 'unknown'; }
  };
  const done = (o, code = 0) => { process.stdout.write(JSON.stringify(o, null, 2) + '\n'); process.exit(code); };
  const sub = process.argv[2];

  if (sub === 'add') {
    const value = process.argv[3];
    const ri = process.argv.indexOf('--reason');
    const reason = ri >= 0 ? process.argv.slice(ri + 1).join(' ') : '';
    const cfg = readCfg();
    const r = addAllowEntry(cfg.allow, value, reason, { by: gitAuthor() });
    if (!r.ok) done(r, 2);
    cfg.allow = r.allow;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
    done({ ok: true, added: r.allow[r.allow.length - 1], file });
  } else if (sub === 'list') {
    done({ allow: readCfg().allow || [] });
  } else {
    process.stdout.write('usage: harness-allowlist add "<value>" --reason "<why>" | list\n');
    process.exit(0);
  }
}
