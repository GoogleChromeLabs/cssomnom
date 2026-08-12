/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface EvaluatorVote {
  clusterId: string;
  spec: string;
  verdict: 'IN_SCOPE' | 'OUT_OF_SCOPE' | 'BORDERLINE' | 'INSUFFICIENT_DATA';
  rationale: string;
  missing_info?: string;
  estimated_infeasible_instances?: number;
  estimated_infeasible_tests?: number;
}

interface FailureClusterItem {
  clusterId: string;
  spec: string;
  category: string;
  pattern: string;
  totalFailures: number;
  affectedFileCount: number;
  affectedFiles: string[];
  samples: { file: string; testName: string; errorMessage: string }[];
}

const rawDataset: FailureClusterItem[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'scratch/wpt_failure_dataset.json'), 'utf8')
);

const scrutineerVotes: EvaluatorVote[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'scratch/feasibility_scrutineer.json'), 'utf8')
);
const grizzVotes: EvaluatorVote[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'scratch/feasibility_grizz.json'), 'utf8')
);
const architectVotes: EvaluatorVote[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'scratch/feasibility_architect.json'), 'utf8')
);

function makeKey(spec: string, clusterId: string): string {
  return `${spec}::${clusterId}`;
}

const scrutineerMap = new Map(scrutineerVotes.map(v => [makeKey(v.spec, v.clusterId), v]));
const grizzMap = new Map(grizzVotes.map(v => [makeKey(v.spec, v.clusterId), v]));
const architectMap = new Map(architectVotes.map(v => [makeKey(v.spec, v.clusterId), v]));

console.log('================================================================================');
console.log('📊 3-WAY DELPHI FEASIBILITY CONSENSUS & DIVERGENCE REPORT (38 CLUSTERS)');
console.log('================================================================================\n');

const unanimousInScope: { cluster: FailureClusterItem; reason: string }[] = [];
const unanimousOutOfScope: { cluster: FailureClusterItem; reason: string }[] = [];
const contested: {
  cluster: FailureClusterItem;
  votes: { scrutineer: string; grizz: string; architect: string };
  rationales: { scrutineer: string; grizz: string; architect: string };
}[] = [];
const insufficientData: { cluster: FailureClusterItem; notes: string[] }[] = [];

for (const c of rawDataset) {
  const key = makeKey(c.spec, c.clusterId);
  const sv = scrutineerMap.get(key);
  const gv = grizzMap.get(key);
  const av = architectMap.get(key);

  const sVerdict = sv?.verdict ?? 'INSUFFICIENT_DATA';
  const gVerdict = gv?.verdict ?? 'INSUFFICIENT_DATA';
  const aVerdict = av?.verdict ?? 'INSUFFICIENT_DATA';

  if (sVerdict === 'INSUFFICIENT_DATA' || gVerdict === 'INSUFFICIENT_DATA' || aVerdict === 'INSUFFICIENT_DATA') {
    insufficientData.push({
      cluster: c,
      notes: [
        sv?.missing_info ? `Scrutineer: ${sv.missing_info}` : '',
        gv?.missing_info ? `Grizz: ${gv.missing_info}` : '',
        av?.missing_info ? `Architect: ${av.missing_info}` : '',
      ].filter(Boolean),
    });
    continue;
  }

  if (sVerdict === 'IN_SCOPE' && gVerdict === 'IN_SCOPE' && aVerdict === 'IN_SCOPE') {
    unanimousInScope.push({ cluster: c, reason: sv?.rationale || gv?.rationale || av?.rationale || '' });
  } else if (sVerdict === 'OUT_OF_SCOPE' && gVerdict === 'OUT_OF_SCOPE' && aVerdict === 'OUT_OF_SCOPE') {
    unanimousOutOfScope.push({ cluster: c, reason: sv?.rationale || gv?.rationale || av?.rationale || '' });
  } else {
    contested.push({
      cluster: c,
      votes: { scrutineer: sVerdict, grizz: gVerdict, architect: aVerdict },
      rationales: {
        scrutineer: sv?.rationale || '',
        grizz: gv?.rationale || '',
        architect: av?.rationale || '',
      },
    });
  }
}

console.log(`### 1. UNANIMOUS IN-SCOPE CLUSTERS (${unanimousInScope.length} Clusters)`);
console.log('--------------------------------------------------------------------------------');
let totalInScopeCount = 0;
for (const item of unanimousInScope) {
  totalInScopeCount += item.cluster.totalFailures;
  console.log(`• [${item.cluster.spec.padEnd(14)}] ${item.cluster.clusterId.padEnd(34)}: ${item.cluster.totalFailures.toString().padStart(5)} failures (${item.cluster.affectedFileCount} files)`);
}
console.log(`  Total Unanimous In-Scope Failures: ${totalInScopeCount}\n`);

console.log(`### 2. UNANIMOUS OUT-OF-SCOPE CLUSTERS (${unanimousOutOfScope.length} Clusters)`);
console.log('--------------------------------------------------------------------------------');
let totalOutOfScopeCount = 0;
for (const item of unanimousOutOfScope) {
  totalOutOfScopeCount += item.cluster.totalFailures;
  console.log(`• [${item.cluster.spec.padEnd(14)}] ${item.cluster.clusterId.padEnd(34)}: ${item.cluster.totalFailures.toString().padStart(5)} failures (${item.cluster.affectedFileCount} files)`);
  console.log(`  ↳ Reason: ${item.reason}`);
}
console.log(`  Total Unanimous Out-of-Scope Failures: ${totalOutOfScopeCount}\n`);

console.log(`### 3. CONTESTED / DIVERGENT CLUSTERS (${contested.length} Clusters)`);
console.log('--------------------------------------------------------------------------------');
let totalContestedCount = 0;
for (const item of contested) {
  totalContestedCount += item.cluster.totalFailures;
  console.log(`• [${item.cluster.spec.padEnd(14)}] ${item.cluster.clusterId.padEnd(34)}: ${item.cluster.totalFailures.toString().padStart(5)} failures (${item.cluster.affectedFileCount} files)`);
  console.log(`  ↳ Votes: Scrutineer: [${item.votes.scrutineer}] | Grizz: [${item.votes.grizz}] | Architect: [${item.votes.architect}]`);
  console.log(`    - Scrutineer: ${item.rationales.scrutineer}`);
  console.log(`    - Grizz:       ${item.rationales.grizz}`);
  console.log(`    - Architect:   ${item.rationales.architect}`);
}
console.log(`  Total Contested Failures: ${totalContestedCount}\n`);

console.log(`### 4. INSUFFICIENT DATA (${insufficientData.length} Clusters)`);
console.log('--------------------------------------------------------------------------------');
if (insufficientData.length === 0) {
  console.log('  Zero clusters had insufficient data. All 38 clusters were fully classified by test source analysis.');
} else {
  for (const item of insufficientData) {
    console.log(`• [${item.cluster.spec}] ${item.cluster.clusterId}: ${item.notes.join('; ')}`);
  }
}
console.log('\n================================================================================\n');
