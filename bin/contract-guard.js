#!/usr/bin/env node
/**
 * contract-guard.js — keep red/green honest when backend and frontend aren't built together (MBI-101).
 *
 * A frontend slice built against a mock for an API that doesn't exist yet can go "green" while the real
 * end-to-end behavior isn't proven. This decides whether a slice can be honestly green: a slice that depends
 * on an unbuilt API must EITHER be blocked by the API slice OR carry a contract test (shared by both sides)
 * / an integration test at the seam — never quietly green on a stub.
 *
 * Pure `assessSliceContract` is unit-tested. Signals come from the slice's declared dependencies at /to-issues.
 */
'use strict';

/**
 * Pure: can this slice be honestly green?
 * @param {{dependsOnUnbuiltApi?:boolean, hasContractTest?:boolean, hasIntegrationTest?:boolean}} slice
 * @returns {{honest:boolean, action:'ok'|'block-or-contract', reasons:string[]}}
 */
function assessSliceContract(slice) {
  const s = slice || {};
  if (s.dependsOnUnbuiltApi && !s.hasContractTest && !s.hasIntegrationTest) {
    return {
      honest: false,
      action: 'block-or-contract',
      reasons: ['slice depends on an API that isn’t built yet and has no contract/integration test — a green here is a MOCK standing in for the unbuilt layer, not real end-to-end behavior. Block this slice on the API slice, OR add a contract test both sides share (or an integration test at the seam).'],
    };
  }
  return { honest: true, action: 'ok', reasons: [] };
}

module.exports = { assessSliceContract };

// CLI: `contract-guard.js [--depends] [--contract] [--integration]` → the assessment (JSON); exit 1 if not honest.
if (require.main === module) {
  const a = process.argv.slice(2);
  const r = assessSliceContract({
    dependsOnUnbuiltApi: a.includes('--depends'),
    hasContractTest: a.includes('--contract'),
    hasIntegrationTest: a.includes('--integration'),
  });
  process.stdout.write(JSON.stringify(r));
  process.exit(r.honest ? 0 : 1);
}
