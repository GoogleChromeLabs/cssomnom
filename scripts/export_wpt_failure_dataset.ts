/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFilePromise = promisify(execFile);

interface FailureSample {
  file: string;
  testName: string;
  errorMessage: string;
}

interface FailureClusterItem {
  clusterId: string;
  spec: string;
  category: string;
  pattern: string;
  totalFailures: number;
  affectedFileCount: number;
  affectedFiles: string[];
  samples: FailureSample[];
}

function crawlDirectory(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'resources' && file !== 'crashtests') {
        crawlDirectory(filePath, fileList);
      }
    } else if (file.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function classifyError(raw: string): { clusterId: string; category: string; cleanMessage: string } {
  const line = raw.split('\n')[0].trim();

  if (line.includes('getComputedStyle is not supported in the linkedom sandbox')) {
    return {
      clusterId: 'getcomputedstyle-requires-layout',
      category: 'VISUAL_LAYOUT_CASCADE',
      cleanMessage: 'getComputedStyle requires visual layout engine / font metrics',
    };
  }
  if (line.includes('caretPositionFromPoint') || line.includes('caretRangeFromPoint')) {
    return {
      clusterId: 'caret-screen-point-hit-testing',
      category: 'VIEWPORT_HIT_TESTING',
      cleanMessage: 'caretPositionFromPoint / caretRangeFromPoint screen coordinate hit-testing',
    };
  }
  if (line.includes('getClientRects') || line.includes('getBoundingClientRect')) {
    return {
      clusterId: 'dom-geometry-client-rects',
      category: 'VIEWPORT_HIT_TESTING',
      cleanMessage: 'element.getClientRects / getBoundingClientRect layout geometry',
    };
  }
  if (line.includes('element.focus') || line.includes(':focus-visible') || line.includes('focus-visible')) {
    return {
      clusterId: 'focus-visible-heuristics',
      category: 'USER_INTERACTION_STATE',
      cleanMessage: 'Interactive :focus-visible / user focus event heuristics',
    };
  }
  if (line.includes('Unknown pseudo-class :heading')) {
    return {
      clusterId: 'pseudo-class-heading',
      category: 'SELECTOR_AST_MATCHING',
      cleanMessage: 'HTML heading level pseudo-class (:heading)',
    };
  }
  if (line.includes('Unknown pseudo-class :dir')) {
    return {
      clusterId: 'pseudo-class-dir',
      category: 'SELECTOR_AST_MATCHING',
      cleanMessage: 'Directionality pseudo-class (:dir)',
    };
  }
  if (line.includes('Unknown pseudo-class :has-slotted')) {
    return {
      clusterId: 'pseudo-class-has-slotted',
      category: 'SELECTOR_AST_MATCHING',
      cleanMessage: 'Shadow DOM pseudo-class (:has-slotted)',
    };
  }
  if (line.includes('Pseudo-elements are not supported by css-select')) {
    return {
      clusterId: 'pseudo-elements-in-is-where',
      category: 'SELECTOR_AST_MATCHING',
      cleanMessage: 'Pseudo-elements in argument selector lists (:is(::before), :where(::after))',
    };
  }
  if (line.includes('CSS.escape is not a function')) {
    return {
      clusterId: 'css-escape-missing',
      category: 'CSSOM_SPEC_API',
      cleanMessage: 'CSS.escape() string escaping algorithm',
    };
  }
  if (line.includes('setHTMLUnsafe is not a function')) {
    return {
      clusterId: 'set-html-unsafe-missing',
      category: 'DOM_SPEC_API',
      cleanMessage: 'container.setHTMLUnsafe HTML sanitizer helper',
    };
  }
  if (line.includes('assert_idl_attribute is not defined')) {
    return {
      clusterId: 'idl-harness-attribute',
      category: 'WPT_TEST_HARNESS',
      cleanMessage: 'assert_idl_attribute reflection helper in WPT shim',
    };
  }
  if (line.includes('document.implementation.createDocument is not a function')) {
    return {
      clusterId: 'dom-create-document-missing',
      category: 'DOM_SPEC_API',
      cleanMessage: 'document.implementation.createDocument XML/HTML factory',
    };
  }
  if (line.includes('NoModificationAllowedError')) {
    return {
      clusterId: 'computed-style-readonly-exception',
      category: 'CSSOM_SPEC_API',
      cleanMessage: 'Computed style mutation throws NoModificationAllowedError',
    };
  }
  if (line.includes('assert_equals: expected') || line.includes('Expected values to be strictly equal:')) {
    return {
      clusterId: 'value-mismatch-assertion',
      category: 'PARSER_AST_SERIALIZATION',
      cleanMessage: line.length > 120 ? line.slice(0, 120) + '...' : line,
    };
  }
  if (line.includes('Timed out') || line.includes('CRASH / TIMEOUT')) {
    return {
      clusterId: 'timeout-or-crash',
      category: 'EXECUTION_TIMEOUT_CRASH',
      cleanMessage: 'Process execution timed out or crashed',
    };
  }
  if (line.includes('TypeError')) {
    return {
      clusterId: 'type-error-exception',
      category: 'TYPE_ERROR_EXCEPTION',
      cleanMessage: line.length > 120 ? line.slice(0, 120) + '...' : line,
    };
  }
  if (line.includes('SyntaxError')) {
    return {
      clusterId: 'syntax-error-exception',
      category: 'SYNTAX_ERROR_EXCEPTION',
      cleanMessage: line.length > 120 ? line.slice(0, 120) + '...' : line,
    };
  }

  return {
    clusterId: 'other-assertion-failure',
    category: 'GENERAL_ASSERTION_FAILURE',
    cleanMessage: line.length > 120 ? line.slice(0, 120) + '...' : line,
  };
}

async function runTestFile(specName: string, filePath: string): Promise<FailureSample[]> {
  const relFile = path.relative(process.cwd(), filePath);
  const failures: FailureSample[] = [];

  try {
    const { stdout, stderr } = await execFilePromise(process.execPath, ['scripts/run_wpt_node.ts', filePath], {
      timeout: 4000,
    });
    const merged = stdout + '\n' + stderr;
    const lines = merged.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('✖ ')) {
        const testName = lines[i].replace(/.*✖\s*/, '').trim();
        const errSnippet = (lines[i + 1] || 'Assertion failure').trim();
        failures.push({
          file: relFile,
          testName,
          errorMessage: errSnippet,
        });
      }
    }
  } catch (err: unknown) {
    const errObj = err as Record<string, unknown>;
    const stdout = typeof errObj.stdout === 'string' ? errObj.stdout : '';
    const stderr = typeof errObj.stderr === 'string' ? errObj.stderr : '';
    const merged = stdout + '\n' + stderr;
    const lines = merged.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('✖ ')) {
        const testName = lines[i].replace(/.*✖\s*/, '').trim();
        const errSnippet = (lines[i + 1] || 'Assertion failure').trim();
        failures.push({
          file: relFile,
          testName,
          errorMessage: errSnippet,
        });
      }
    }

    if (failures.length === 0) {
      failures.push({
        file: relFile,
        testName: '[FILE INIT CRASH / TIMEOUT]',
        errorMessage: stderr.slice(0, 200) || (err instanceof Error ? err.message : 'Timed out'),
      });
    }
  }

  return failures;
}

async function pool<T, R>(limit: number, items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      results[currentIndex] = await fn(item);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

async function main() {
  const configPath = path.resolve(process.cwd(), 'tests/wpt-node-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const clustersMap = new Map<string, FailureClusterItem>();
  const concurrency = Math.min(16, Math.max(1, os.availableParallelism() - 1));

  console.log(`Starting detailed failure extraction across all 7 WPT specs (concurrency: ${concurrency})...`);

  for (const [specName, specInfo] of Object.entries<{ path: string; exclude: string[] }>(config.specs)) {
    const specFiles = crawlDirectory(path.resolve(process.cwd(), specInfo.path))
      .filter(f => !specInfo.exclude.includes(f));

    console.log(`- Extracting ${specName} (${specFiles.length} files)...`);

    const fileResults = await pool(concurrency, specFiles, f => runTestFile(specName, f));

    for (const failures of fileResults) {
      for (const fail of failures) {
        const { clusterId, category, cleanMessage } = classifyError(fail.errorMessage);
        const fullKey = `${specName}::${clusterId}`;

        let cluster = clustersMap.get(fullKey);
        if (!cluster) {
          cluster = {
            clusterId,
            spec: specName,
            category,
            pattern: cleanMessage,
            totalFailures: 0,
            affectedFileCount: 0,
            affectedFiles: [],
            samples: [],
          };
          clustersMap.set(fullKey, cluster);
        }

        cluster.totalFailures++;
        if (!cluster.affectedFiles.includes(fail.file)) {
          cluster.affectedFiles.push(fail.file);
          cluster.affectedFileCount = cluster.affectedFiles.length;
        }
        if (cluster.samples.length < 5) {
          cluster.samples.push(fail);
        }
      }
    }
  }

  const dataset = Array.from(clustersMap.values()).sort((a, b) => b.totalFailures - a.totalFailures);
  const outDir = path.resolve(process.cwd(), 'scratch');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'wpt_failure_dataset.json');
  fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2));

  console.log(`\nDetailed failure dataset created: ${outPath}`);
  console.log(`Total categorized clusters: ${dataset.length}`);
  console.log(`Total failure instances: ${dataset.reduce((sum, c) => sum + c.totalFailures, 0)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
