/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import type { CSSRule, CSSRuleConstructor } from '../src/types.ts';

// This should fail in Red phase because CSSRuleConstructor does not exist.
const ctor: CSSRuleConstructor = {
  prototype: {} as unknown as CSSRule,
  STYLE_RULE: 1,
  CHARSET_RULE: 2,
  IMPORT_RULE: 3,
  MEDIA_RULE: 4,
  FONT_FACE_RULE: 5,
  PAGE_RULE: 6,
  KEYFRAMES_RULE: 7,
  KEYFRAME_RULE: 8,
  MARGIN_RULE: 9,
  NAMESPACE_RULE: 10,
};

console.log(ctor);
