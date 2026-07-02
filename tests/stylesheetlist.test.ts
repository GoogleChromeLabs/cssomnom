/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
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
