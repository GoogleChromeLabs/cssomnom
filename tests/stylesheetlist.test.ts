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
import test from 'node:test';
import assert from 'node:assert';
import * as CSSOM from '../src/index.ts';
import type { StyleSheetList } from '../src/types.ts';

test('StyleSheetList.item() returns CSSStyleSheet', () => {
  const sheetList = new CSSOM.StyleSheetList([new CSSOM.CSSStyleSheet()]) as unknown as StyleSheetList;
  const sheet = sheetList.item(0);
  
  // This should fail type checking if item() returns StyleSheet
  // because StyleSheet does not have cssRules.
  if (sheet) {
    const rules = sheet.cssRules;
    assert.ok(rules);
  } else {
    assert.fail('Sheet should not be null');
  }
});
