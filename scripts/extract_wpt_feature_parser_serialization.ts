/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const WPT_ROOT = path.join(REPO_ROOT, 'submodules/web-platform-tests');

interface TestFixture {
  property: string;
  value: string;
  expected: string;
}

const allFixtures: Record<string, TestFixture[]> = {};

const TARGET_DIRS = [
  { name: 'anchor_position', dir: 'css/css-anchor-position' },
  { name: 'view_transitions', dir: 'css/css-view-transitions' },
  { name: 'transitions', dir: 'css/css-transitions' },
  { name: 'selectors', dir: 'css/selectors' }
];

function extractTestsFromDir(name: string, relativeDir: string) {
  const dirPath = path.join(WPT_ROOT, relativeDir);
  if (!fs.existsSync(dirPath)) {
    console.warn(`Directory not found: ${dirPath}`);
    return;
  }

  const fixtures: TestFixture[] = [];
  const files = fs.readdirSync(dirPath, { recursive: true }) as string[];
  
  const htmlFiles = files.filter(f => typeof f === 'string' && f.endsWith('.html'));
  
  // Regex to match test_valid_value('property', 'value', 'expected')
  // Supports optional third argument
  const regex = /test_valid_value\s*\(\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3\s*(?:,\s*(['"])(.*?)\5)?\s*\)/g;

  for (const file of htmlFiles) {
    const filePath = path.join(dirPath, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const matches = content.matchAll(regex);
    for (const match of matches) {
      const property = match[2];
      const value = match[4];
      const expected = match[6] !== undefined ? match[6] : value;
      
      fixtures.push({
        property,
        value,
        expected
      });
    }
  }

  if (fixtures.length > 0) {
    allFixtures[name] = fixtures;
    console.log(`Extracted ${fixtures.length} tests from ${relativeDir}`);
  }
}

// Run extraction for all target directories
for (const target of TARGET_DIRS) {
  extractTestsFromDir(target.name, target.dir);
}

const outputPath = path.join(REPO_ROOT, 'tests/fixtures/wpt-feature-parser-serialization.json');
fs.writeFileSync(outputPath, JSON.stringify(allFixtures, null, 2));
console.log(`\nSuccessfully saved all fixtures to ${outputPath}`);
