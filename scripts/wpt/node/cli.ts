/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { parseArgs } from 'node:util';
import { VALID_SPECS } from './core/config.ts';
import { runCommand } from './commands/run.ts';
import { clusterCommand } from './commands/cluster.ts';
import { diffCommand } from './commands/diff.ts';
import { parityCommand } from './commands/parity.ts';

const RUN_OPTS = {
  'filter-by-spec': { type: 'string', short: 's' },
  'filter-by-path': { type: 'string', short: 'p' },
  'verify-exact-baseline': { type: 'boolean' },
  'show-failure-clusters': { type: 'boolean' },
  'show-expectation-diff': { type: 'boolean' },
  'write-progress-markdown': { type: 'boolean' },
  'write-passing-set-baseline': { type: 'boolean' },
  'json': { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  'limit': { type: 'string' },
  'concurrency': { type: 'string', short: 'c' },
  'help': { type: 'boolean', short: 'h' },
} as const;

const CLUSTER_OPTS = {
  'filter-by-spec': { type: 'string', short: 's' },
  'limit': { type: 'string', short: 'l' },
  'live': { type: 'boolean' },
  'concurrency': { type: 'string', short: 'c' },
  'help': { type: 'boolean', short: 'h' },
} as const;

const DIFF_OPTS = {
  'filter-by-spec': { type: 'string', short: 's' },
  'filter-by-path': { type: 'string', short: 'p' },
  'limit': { type: 'string', short: 'l' },
  'live': { type: 'boolean' },
  'concurrency': { type: 'string', short: 'c' },
  'help': { type: 'boolean', short: 'h' },
} as const;

const PARITY_OPTS = {
  'filter-by-spec': { type: 'string', short: 's' },
  'browser-report': { type: 'string', short: 'b' },
  'node-cache': { type: 'string', short: 'n' },
  'limit': { type: 'string', short: 'l' },
  'json': { type: 'boolean' },
  'help': { type: 'boolean', short: 'h' },
} as const;

function printHelp(command?: string) {
  if (command === 'cluster') {
    console.log(`\nUsage: node scripts/wpt/node/cli.ts cluster [options]\n\nOptions:\n  -s, --filter-by-spec <name>  Filter failures to a specific spec suite\n  -l, --limit <N>              Max clusters to display (default: 20)\n  --live                       Run live WPT tests instead of using cache\n  -c, --concurrency <N>        Worker pool concurrency limit\n  -h, --help                   Show this help message\n\nValid Specs: ${VALID_SPECS.join(', ')}\n`);
    return;
  }
  if (command === 'diff') {
    console.log(`\nUsage: node scripts/wpt/node/cli.ts diff [options]\n\nOptions:\n  -s, --filter-by-spec <name>  Filter diffs to a specific spec suite\n  -p, --filter-by-path <path>  Filter diffs by file path substring\n  -l, --limit <N>              Max diff rows to display (default: 20)\n  --live                       Run live WPT tests instead of using cache\n  -c, --concurrency <N>        Worker pool concurrency limit\n  -h, --help                   Show this help message\n\nValid Specs: ${VALID_SPECS.join(', ')}\n`);
    return;
  }
  if (command === 'parity') {
    console.log(`\nUsage: node scripts/wpt/node/cli.ts parity [options]\n\nOptions:\n  -s, --filter-by-spec <name>  Filter parity comparison to a specific spec suite\n  -b, --browser-report <path>  Path to browser report JSON (default: dist/report-chrome.json)\n  -n, --node-cache <path>      Path to Node dataset JSON (default: .wpt-cache/last-run.json)\n  -l, --limit <N>              Max sample discrepancies to display (default: 15)\n  --json                       Emit structured JSON parity matrix\n  -h, --help                   Show this help message\n\nValid Specs: ${VALID_SPECS.join(', ')}\n`);
    return;
  }
  console.log(`\ncssomnom Agent-Native WPT Test CLI\n\nUsage:\n  node scripts/wpt/node/cli.ts [command] [options]\n  pnpm run wpt [command] [options]\n\nCommands:\n  run (default)  Execute single-pass WPT test runner across suites\n  cluster        Analyze failure pattern clusters (cached/live)\n  diff           Analyze near-miss expectation diffs (cached/live)\n  parity         Cross-browser differential parity matrix (Node.js vs Headless Chrome)\n\nRun Options:\n  -s, --filter-by-spec <name>      Filter to a specific spec suite\n  -p, --filter-by-path <path>      Filter by file path / substring\n  --verify-exact-baseline          Verify 0 regressions against baseline (exits 1 on regression)\n  --show-failure-clusters          Group error signatures and output cluster table\n  --show-expectation-diff          Diff results against expected values (+/-)\n  --write-progress-markdown        Generate and update wpt-progress.md\n  --write-passing-set-baseline     Update passing set baseline with monotonicity check\n  --json                           Emit structured JSON output\n  --dry-run                        Preview file changes without writing to disk\n  --limit <N>                      Max rows for clusters/diffs (default: 20)\n  -c, --concurrency <N>            Worker pool concurrency limit\n  -h, --help                       Show this help message\n\nValid Specs:\n  ${VALID_SPECS.join(', ')}\n\nExamples:\n  pnpm run wpt\n  pnpm run wpt --filter-by-spec=selectors\n  pnpm run wpt --verify-exact-baseline\n  pnpm run wpt cluster --filter-by-spec=css-typed-om\n  pnpm run wpt diff --filter-by-spec=selectors\n  pnpm run wpt parity --filter-by-spec=css-typed-om\n`);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const firstArg = rawArgs[0];

  let subcommand = 'run';
  let subArgs = rawArgs;

  if (firstArg === 'run' || firstArg === 'cluster' || firstArg === 'diff' || firstArg === 'parity') {
    subcommand = firstArg;
    subArgs = rawArgs.slice(1);
  } else if (firstArg === '-h' || firstArg === '--help' || firstArg === 'help') {
    printHelp();
    process.exit(0);
  } else if (firstArg && !firstArg.startsWith('-')) {
    console.error(`\x1b[31mError: Unknown subcommand "${firstArg}". Valid subcommands: run, cluster, diff, parity\x1b[0m\n`);
    printHelp();
    process.exit(1);
  }

  try {
    if (subcommand === 'cluster') {
      const { values } = parseArgs({ args: subArgs, options: CLUSTER_OPTS, strict: true });
      if (values.help) { printHelp('cluster'); return; }
      await clusterCommand({
        filterBySpec: values['filter-by-spec'],
        limit: values.limit ? parseInt(values.limit, 10) : undefined,
        live: values.live,
        concurrency: values.concurrency ? parseInt(values.concurrency, 10) : undefined,
      });
    } else if (subcommand === 'diff') {
      const { values } = parseArgs({ args: subArgs, options: DIFF_OPTS, strict: true });
      if (values.help) { printHelp('diff'); return; }
      await diffCommand({
        filterBySpec: values['filter-by-spec'],
        filterByPath: values['filter-by-path'],
        limit: values.limit ? parseInt(values.limit, 10) : undefined,
        live: values.live,
        concurrency: values.concurrency ? parseInt(values.concurrency, 10) : undefined,
      });
    } else if (subcommand === 'parity') {
      const { values } = parseArgs({ args: subArgs, options: PARITY_OPTS, strict: true });
      if (values.help) { printHelp('parity'); return; }
      await parityCommand({
        filterBySpec: values['filter-by-spec'],
        browserReport: values['browser-report'],
        nodeCache: values['node-cache'],
        limit: values.limit ? parseInt(values.limit, 10) : undefined,
        json: values.json,
      });
    } else {
      const { values } = parseArgs({ args: subArgs, options: RUN_OPTS, strict: true });
      if (values.help) { printHelp('run'); return; }
      await runCommand({
        filterBySpec: values['filter-by-spec'],
        filterByPath: values['filter-by-path'],
        verifyExactBaseline: values['verify-exact-baseline'],
        showFailureClusters: values['show-failure-clusters'],
        showExpectationDiff: values['show-expectation-diff'],
        writeProgressMarkdown: values['write-progress-markdown'],
        writePassingSetBaseline: values['write-passing-set-baseline'],
        json: values.json,
        dryRun: values['dry-run'],
        limit: values.limit ? parseInt(values.limit, 10) : undefined,
        concurrency: values.concurrency ? parseInt(values.concurrency, 10) : undefined,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\x1b[31mError: ${msg}\x1b[0m\n`);
    console.error(`Valid spec names (--filter-by-spec): ${VALID_SPECS.join(', ')}`);
    console.error(`Run "pnpm run wpt ${subcommand} --help" for detailed usage.\n`);
    process.exit(1);
  }
}

if (process.argv[1] && (process.argv[1] === import.meta.filename || process.argv[1].endsWith('cli.ts'))) {
  main().catch(err => {
    console.error('Fatal CLI execution error:', err);
    process.exit(1);
  });
}
