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
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CSSRule } from '../src/index.ts';

describe('CSSRule static constants', () => {
  it('exposes all 13 legacy CSSOM rule type constants on CSSRule constructor', () => {
    assert.equal(CSSRule.STYLE_RULE, 1);
    assert.equal(CSSRule.CHARSET_RULE, 2);
    assert.equal(CSSRule.IMPORT_RULE, 3);
    assert.equal(CSSRule.MEDIA_RULE, 4);
    assert.equal(CSSRule.FONT_FACE_RULE, 5);
    assert.equal(CSSRule.PAGE_RULE, 6);
    assert.equal(CSSRule.KEYFRAMES_RULE, 7);
    assert.equal(CSSRule.KEYFRAME_RULE, 8);
    assert.equal(CSSRule.MARGIN_RULE, 9);
    assert.equal(CSSRule.NAMESPACE_RULE, 10);
    assert.equal(CSSRule.COUNTER_STYLE_RULE, 11);
    assert.equal(CSSRule.SUPPORTS_RULE, 12);
    assert.equal(CSSRule.FONT_FEATURE_VALUES_RULE, 14);
  });
});
