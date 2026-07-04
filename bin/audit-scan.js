#!/usr/bin/env node
/**
 * audit-scan.js — verify locally that ePHI access/mutation sites emit an audit entry (MBI-100).
 *
 * The HIPAA audit trail (who accessed/changed ePHI) was a judgement call, not a check. This heuristically
 * finds PHI data operations (a read/write/delete on a patient/record/chart/… entity) and flags any that
 * has no audit emission within a small window — the gaps a dev must close. Distinct from safe-logging
 * (that's about NOT leaking PHI into logs; this is about PRODUCING the required audit trail).
 *
 * It's the checkable form of the `audit` cross-cutting concern (bin/concerns.js). Heuristic + advisory —
 * it can't prove intent, so it reports gaps for a human/agent to resolve, never hard-blocks. Pure
 * `findAuditGaps` is unit-tested.
 */
'use strict';

// A data operation on a PHI/ePHI entity — two common shapes: `Entity.op(...)` and `opEntity(...)`.
const ENTITY = 'patient|record|medical(record)?|chart|ephi|phi|encounter|prescription|diagnos\\w*|labresult|immunization';
const DATA_OP = 'find\\w*|get\\w*|select|query|read|fetch|list|update|insert|create|delete|remove|save|patch|put|write';
const PHI_ENTITY_OP_RE = new RegExp(`\\b(${ENTITY})\\w*\\s*\\.\\s*(${DATA_OP})\\b`, 'i');           // Patient.findById(...)
const PHI_OP_ENTITY_RE = new RegExp(`\\b(get|find|fetch|read|update|create|delete|save|remove|list)\\s*(${ENTITY})\\w*\\s*\\(`, 'i'); // getPatient(...)
// Default audit-emission markers (override with opts.auditRe from the recorded convention).
const DEFAULT_AUDIT_RE = /\b(audit\w*|record[_ ]?audit|audit[_ ]?log|log[_ ]?access|record[_ ]?access|access[_ ]?log|audit[_ ]?trail)\b/i;

const WINDOW = 6; // lines around a PHI op within which an audit call counts as covering it

/** Pure: is this line a PHI data operation (a call, not a declaration)? */
function isPhiOp(line) {
  const s = String(line || '');
  if (PHI_ENTITY_OP_RE.test(s)) return true;
  // op+entity call shape (getPatient(...)), but NOT a function/def DECLARATION of that name.
  return PHI_OP_ENTITY_RE.test(s) && !/\b(function|def)\b/.test(s);
}

/** Pure: PHI access/mutation sites with no audit emission within WINDOW lines → [{line, text}]. */
function findAuditGaps(code, opts) {
  const auditRe = (opts && opts.auditRe) || DEFAULT_AUDIT_RE;
  const lines = String(code || '').split(/\r?\n/);
  const auditLines = new Set();
  lines.forEach((l, i) => { if (auditRe.test(l)) auditLines.add(i); });
  const gaps = [];
  lines.forEach((l, i) => {
    if (!isPhiOp(l)) return;
    let covered = false;
    for (let j = Math.max(0, i - WINDOW); j <= Math.min(lines.length - 1, i + WINDOW); j++) {
      if (auditLines.has(j)) { covered = true; break; }
    }
    if (!covered) gaps.push({ line: i + 1, text: l.trim().slice(0, 120) });
  });
  return gaps;
}

/** Pure: the fields a compliant audit entry must carry (no PHI values). */
function auditEntryFields() {
  return [
    { field: 'actor', note: 'who — the acting user/service id (not a name)' },
    { field: 'action', note: 'what — read | write | update | delete | denied' },
    { field: 'subject', note: 'which record — the recordId/resource id, NOT the PHI itself' },
    { field: 'timestamp', note: 'when — server time (store UTC)' },
    { field: 'outcome', note: 'result — success | failure | denied' },
  ];
}

module.exports = { findAuditGaps, auditEntryFields, isPhiOp, DEFAULT_AUDIT_RE };

// CLI: `audit-scan.js <file...>` → gaps per file (JSON); exit 1 if any (advisory check for /tdd/onboard).
if (require.main === module) {
  const fs = require('fs');
  const results = [];
  for (const f of process.argv.slice(2)) {
    try { const gaps = findAuditGaps(fs.readFileSync(f, 'utf8')); if (gaps.length) results.push({ file: f, gaps }); }
    catch { /* skip */ }
  }
  process.stdout.write(JSON.stringify({ ok: results.length === 0, results, requiredFields: auditEntryFields() }));
  process.exit(results.length ? 1 : 0);
}
