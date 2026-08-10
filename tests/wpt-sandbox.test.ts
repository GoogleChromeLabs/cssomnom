/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test, describe, it, after } from 'node:test';
import assert from 'node:assert';

// Silence unhandled rejections from async test cleanups/actions inside the simulated WPT sandboxes
process.on('unhandledRejection', () => {});
import { parseHTML } from 'linkedom';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { CSSStyleRule } from '../src/CSSOM.ts';
import { StylePropertyMap, StylePropertyMapReadOnly } from '../src/typed-om.ts';
import { patchWindowForTypedOM } from './wpt-shim.ts';
import { runWptFile } from '../scripts/run_wpt_node.ts';

interface StyleElementMock {
  textContent?: string | null;
  sheet: {
    cssRules: { selectorText: string }[];
    insertRule(text: string, idx?: number): number;
    deleteRule(idx: number): void;
  };
}

interface ElementMock {
  attributeStyleMap: StylePropertyMap;
  computedStyleMap(): StylePropertyMapReadOnly;
}

// 1. Prototype/Setup Unit Tests
describe('WPT Sandbox setup unit tests', () => {
  test('HTMLStyleElement.prototype.sheet', () => {
    const { window, document } = parseHTML('<html><head><style>div { color: red; }</style></head><body></body></html>');
    patchWindowForTypedOM(window);

    const styleEl = document.querySelector('style') as unknown as StyleElementMock;
    assert.ok(styleEl);
    const sheet = styleEl.sheet;
    assert.ok(sheet, 'sheet should exist');
    assert.strictEqual(sheet.cssRules.length, 1);
    assert.strictEqual(sheet.cssRules[0].selectorText, 'div');
    
    assert.ok(sheet.cssRules[0] instanceof CSSStyleRule, 'should use our parsed CSSStyleRule');

    // Test insertRule
    const idx = sheet.insertRule('span { color: blue; }', 1);
    assert.strictEqual(idx, 1);
    assert.strictEqual(sheet.cssRules.length, 2);
    assert.strictEqual(sheet.cssRules[1].selectorText, 'span');

    // Test deleteRule
    sheet.deleteRule(0);
    assert.strictEqual(sheet.cssRules.length, 1);
    assert.strictEqual(sheet.cssRules[0].selectorText, 'span');

    // Test textContent mutation invalidates cache (regression test)
    styleEl.textContent = 'p { color: green; }';
    const updatedSheet = styleEl.sheet;
    assert.ok(updatedSheet, 'updated sheet should exist');
    assert.strictEqual(updatedSheet.cssRules.length, 1);
    assert.strictEqual(updatedSheet.cssRules[0].selectorText, 'p');
  });

  test('HTMLElement.prototype.attributeStyleMap', () => {
    const { window, document } = parseHTML('<html><body><div style="color: red; margin: 10px;"></div></body></html>');
    patchWindowForTypedOM(window);

    const div = document.querySelector('div') as unknown as ElementMock;
    assert.ok(div);
    const map = div.attributeStyleMap;
    assert.ok(map, 'attributeStyleMap should exist');
    assert.strictEqual(map.get('color')?.toString(), 'red');
    assert.strictEqual(map.get('margin')?.toString(), '10px');
  });

  test('Element.prototype.computedStyleMap()', () => {
    const { window, document } = parseHTML('<html><body><div style="color: red;"></div></body></html>');
    patchWindowForTypedOM(window);

    const div = document.querySelector('div') as unknown as ElementMock;
    assert.ok(div);
    const map = div.computedStyleMap();
    assert.ok(map, 'computedStyleMap should exist');
    assert.strictEqual(map.get('color')?.toString(), 'rgb(255, 0, 0)');
  });
});

// 2. Dynamic WPT Sandbox Runner Suite
interface SandboxConfig {
  exclude: string[];
  knownFailures: Record<string, string[]>;
}

function crawlDirectory(dir: string, fileList: string[] = []): string[] {
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

const failuresPath = path.resolve(process.cwd(), 'tests/fixtures/baselines/wpt-sandbox-known-failures.json');
const sandboxConfigPath = path.resolve(process.cwd(), 'tests/wpt-node-config.json');

if (process.env.RUN_SANDBOX_WPT === 'true' && fs.existsSync(failuresPath) && fs.existsSync(sandboxConfigPath)) {
  const failureConfig = JSON.parse(fs.readFileSync(failuresPath, 'utf-8')) as SandboxConfig;
  const specConfig = JSON.parse(fs.readFileSync(sandboxConfigPath, 'utf-8')) as {
    specs: Record<string, { path: string; exclude: string[] }>;
  };

  describe('WPT Sandbox Runner', () => {
    for (const [specName, specInfo] of Object.entries(specConfig.specs)) {
      describe(`Spec: ${specName}`, () => {
        const targetDir = path.resolve(process.cwd(), specInfo.path);
        if (!fs.existsSync(targetDir)) {
          return;
        }
        const allFiles = crawlDirectory(targetDir).sort();

        for (const filePath of allFiles) {
          const relativePath = path.relative(process.cwd(), filePath);
          
          const isExcluded = specInfo.exclude.includes(relativePath) ||
                             failureConfig.exclude.includes(relativePath) ||
                             specInfo.exclude.some(excl => relativePath.includes(excl)) ||
                             failureConfig.exclude.some(excl => relativePath.includes(excl));

          if (isExcluded) {
            continue;
          }

          describe(relativePath, () => {
            let fileResult: ReturnType<typeof runWptFile>;
            try {
              fileResult = runWptFile(filePath);
            } catch (err) {
              it('Failed to initialize/parse sandbox HTML', () => {
                throw err;
              });
              return;
            }

            after(() => {
              fileResult.cleanup();
            });

            const fileFailures = failureConfig.knownFailures[relativePath] || [];

            for (const testItem of fileResult.tests) {
              const isKnownFailure = fileFailures.includes(testItem.name) || fileFailures.includes(testItem.name.replace(/\n/g, '\\n'));
              
              if (isKnownFailure) {
                it.skip(`[KNOWN FAILURE] ${testItem.name}`, async () => {
                  await testItem.fn();
                });
              } else {
                it(testItem.name, async () => {
                  await testItem.fn();
                });
              }
            }
          });
        }
      });
    }
  });
}
