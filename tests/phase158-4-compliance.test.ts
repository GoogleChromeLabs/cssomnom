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
import { MediaParser } from '../src/MediaParser.ts';
import type { MediaEnvironment, MediaFeature } from '../src/types.ts';
import { CSSStyleDeclaration } from '../src/index.ts';
import { parseStyleSheet } from '../src/parser.ts';
import { CSS } from '../src/parser-api.ts';
import { CSSSupportsRule } from '../src/rules/at-rules.ts';
import { ALL_SHORTHAND_LONGHANDS, LONGHAND_TO_SHORTHAND } from '../src/shorthands.ts';
import { resolveLogicalProperty } from '../src/data/gen/LogicalMapping.ts';

const baseEnv: MediaEnvironment = {
  mediaType: 'screen',
  width: 1024,
  height: 768,
  deviceWidth: 1024,
  deviceHeight: 768,
  resolution: 96,
  color: 8,
  colorIndex: 0,
  monochrome: 0,
  aspectRatio: [4, 3],
  deviceAspectRatio: [4, 3],
  orientation: 'landscape',
  scan: 'progressive',
  grid: 0,
  update: 'fast',
  overflowBlock: 'scroll',
  overflowInline: 'scroll',
  colorGamut: 'srgb',
  videoColorGamut: 'srgb',
  pointer: 'fine',
  hover: 'hover',
  anyPointer: 'fine',
  anyHover: 'hover',
  prefersColorScheme: 'light',
  uaColorScheme: 'light',
  prefersReducedMotion: 'no-preference',
  prefersReducedTransparency: 'no-preference',
  prefersContrast: 'no-preference',
  prefersReducedData: 'no-preference',
  forcedColors: 'none',
  invertedColors: 'none',
  scripting: 'enabled',
  dynamicRange: 'high',
  videoDynamicRange: 'high',
  displayMode: 'browser',
  displayState: 'normal',
  environmentBlending: 'opaque',
  navControls: 'none',
  resizable: true,
};

describe('Phase 158.4 Compliance Verification', () => {
  describe('BC-34: Range <mf-range> operator inversion on (resolution < infinite)', () => {
    it('does not invert operator when range feature is on the left', () => {
      const q = MediaParser.parse('(resolution < infinite)');
      assert.equal(q.length, 1);
      assert.ok(!q[0].invalid);
      const feature = (q[0].condition as MediaFeature);
      assert.equal(feature.operator, '<');
      assert.equal(feature.name, 'resolution');
    });

    it('inverts operator when range feature is on the right', () => {
      const q = MediaParser.parse('(infinite > resolution)');
      assert.equal(q.length, 1);
      assert.ok(!q[0].invalid);
      const feature = (q[0].condition as MediaFeature);
      assert.equal(feature.operator, '<');
      assert.equal(feature.name, 'resolution');
    });
  });

  describe('BC-35: Validate syntax before stripping "all and"', () => {
    it('discards invalid query "all and screen"', () => {
      const q = MediaParser.parse('all and screen');
      assert.equal(q.length, 1);
      assert.equal(q[0].invalid, true);
    });

    it('accepts valid query "all and (min-width: 100px)"', () => {
      const q = MediaParser.parse('all and (min-width: 100px)');
      assert.equal(q.length, 1);
      assert.ok(!q[0].invalid);
    });
  });

  describe('BC-36: (dynamic-range: standard) matches when environment is "high"', () => {
    it('evaluates dynamic-range: standard to true when env dynamicRange is high', () => {
      const envHigh = { ...baseEnv, dynamicRange: 'high' as const, videoDynamicRange: 'high' as const };
      assert.equal(MediaParser.evaluate('(dynamic-range: standard)', envHigh), true);
      assert.equal(MediaParser.evaluate('(video-dynamic-range: standard)', envHigh), true);
      assert.equal(MediaParser.evaluate('(dynamic-range: high)', envHigh), true);
      assert.equal(MediaParser.evaluate('(video-dynamic-range: high)', envHigh), true);
    });

    it('evaluates dynamic-range: high to false when env dynamicRange is standard', () => {
      const envStd = { ...baseEnv, dynamicRange: 'standard' as const, videoDynamicRange: 'standard' as const };
      assert.equal(MediaParser.evaluate('(dynamic-range: standard)', envStd), true);
      assert.equal(MediaParser.evaluate('(dynamic-range: high)', envStd), false);
    });
  });

  describe('BC-37: Boolean features evaluate to false when environment is "none"', () => {
    it('evaluates (update), (color-gamut), (video-color-gamut) to false when value is none', () => {
      const envNone = {
        ...baseEnv,
        update: 'none' as const,
        colorGamut: 'none' as const,
        videoColorGamut: 'none' as const,
      };
      assert.equal(MediaParser.evaluate('(update)', envNone), false);
      assert.equal(MediaParser.evaluate('(color-gamut)', envNone), false);
      assert.equal(MediaParser.evaluate('(video-color-gamut)', envNone), false);
    });
  });

  describe('BC-38: Grammatically invalid @supports preludes discarded during parsing', () => {
    it('discards unparenthesized @supports prelude', () => {
      const rules = parseStyleSheet('@supports display: flex { body { color: red; } }');
      assert.equal(rules.length, 0);
    });

    it('discards malformed operator sequences in @supports', () => {
      const rules = parseStyleSheet('@supports (a: b) and or (c: d) { body { color: red; } }');
      assert.equal(rules.length, 0);
    });

    it('accepts valid @supports rule', () => {
      const rules = parseStyleSheet('@supports (display: flex) { body { color: red; } }');
      assert.equal(rules.length, 1);
      assert.ok(rules[0] instanceof CSSSupportsRule);
    });
  });

  describe('BC-39: 2-arg CSS.supports(property, value) does not trim property', () => {
    it('returns false when property has leading or trailing whitespace', () => {
      assert.equal(CSS.supports(' width', '5px'), false);
      assert.equal(CSS.supports('width ', '5px'), false);
      assert.equal(CSS.supports('width', '5px'), true);
    });
  });

  describe('BC-40: Trailing !important in <supports-decl>', () => {
    it('accepts trailing !important in 1-arg and 2-arg supports', () => {
      assert.equal(CSS.supports('(display: flex !important)'), true);
      assert.equal(CSS.supports('display', 'flex !important'), true);
    });

    it('parses @supports with !important in declaration', () => {
      const rules = parseStyleSheet('@supports (display: flex !important) { body { color: red; } }');
      assert.equal(rules.length, 1);
    });
  });

  describe('BC-41: All condition operands must match <supports-in-parens>', () => {
    it('rejects bare identifiers and invalid chains', () => {
      assert.equal(CSS.supports('not foo'), false);
      assert.equal(CSS.supports('foo or bar'), false);
      assert.equal(CSS.supports('not (display: flex)'), false);
      assert.equal(CSS.supports('not (display: unsupported-xyz-foo)'), true);
    });
  });

  describe('BC-42: 1-arg CSS.supports normative 2-step parenthesization fallback', () => {
    it('evaluates unparenthesized declaration via 2-step fallback', () => {
      assert.equal(CSS.supports('display: flex'), true);
      assert.equal(CSS.supports('display: unsupported-xyz-foo'), false);
      assert.equal(CSS.supports('(display: flex)'), true);
    });
  });

  describe('BC-43: Undeclared namespaces in CSS.supports("selector(...)") are rejected', () => {
    it('rejects namespace prefixes when declaredNamespaces is empty', () => {
      assert.equal(CSS.supports('selector(a|b)'), false);
      assert.equal(CSS.supports('selector(div > p)'), true);
    });
  });

  describe('BC-44: CSSSupportsRule.prototype.matches boolean getter', () => {
    it('returns matches boolean based on conditionText', () => {
      const rulesTrue = parseStyleSheet('@supports (display: flex) { body { color: red; } }');
      const ruleTrue = rulesTrue[0] as CSSSupportsRule;
      assert.equal(ruleTrue.matches, true);

      const rulesFalse = parseStyleSheet('@supports (display: unsupported-xyz-foo) { body { color: red; } }');
      const ruleFalse = rulesFalse[0] as CSSSupportsRule;
      assert.equal(ruleFalse.matches, false);
    });
  });

  describe('BC-45: Logical keyword serialization', () => {
    it('does not prepend "logical " to CSS-wide keywords', () => {
      const decl = new CSSStyleDeclaration();
      decl.setProperty('margin-block-start', 'inherit');
      decl.setProperty('margin-block-end', 'inherit');
      decl.setProperty('margin-inline-start', 'inherit');
      decl.setProperty('margin-inline-end', 'inherit');
      assert.equal(decl.getPropertyValue('margin'), 'inherit');
    });

    it('includes border-width in logical shorthand serialization', () => {
      const decl = new CSSStyleDeclaration();
      decl.setProperty('border-block-start-width', '1px');
      decl.setProperty('border-block-end-width', '1px');
      decl.setProperty('border-inline-start-width', '2px');
      decl.setProperty('border-inline-end-width', '2px');
      assert.equal(decl.getPropertyValue('border-width'), 'logical 1px 2px');
    });
  });

  describe('BC-46: ALL_SHORTHAND_LONGHANDS and flow-relative overriding', () => {
    it('orders flow-relative properties in ALL_SHORTHAND_LONGHANDS before physical counterparts', () => {
      const inlineStartIdx = ALL_SHORTHAND_LONGHANDS.indexOf('margin-inline-start');
      const topIdx = ALL_SHORTHAND_LONGHANDS.indexOf('margin-top');
      assert.ok(inlineStartIdx !== -1, 'margin-inline-start should be in ALL_SHORTHAND_LONGHANDS');
      assert.ok(topIdx !== -1, 'margin-top should be in ALL_SHORTHAND_LONGHANDS');
      assert.ok(inlineStartIdx < topIdx, 'flow-relative longhands must precede physical longhands');
    });

    it('recognizes flow-relative overriding longhands in shorthand serialization', () => {
      const decl = new CSSStyleDeclaration();
      decl.setProperty('margin', '10px');
      decl.setProperty('margin-inline-start', '20px');
      assert.equal(decl.getPropertyValue('margin'), '');
    });

    it('indexes physicalLonghands in LONGHAND_TO_SHORTHAND', () => {
      const shorthandsForTop = LONGHAND_TO_SHORTHAND['margin-top'] || [];
      assert.ok(shorthandsForTop.includes('margin-block'), 'margin-top should map to margin-block');
    });
  });

  describe('BC-47: sideways-rl and sideways-lr writing modes in logical mappings', () => {
    it('maps abstract properties for sideways-rl', () => {
      assert.equal(resolveLogicalProperty('inline-size', 'sideways-rl', 'ltr'), 'height');
      assert.equal(resolveLogicalProperty('block-size', 'sideways-rl', 'ltr'), 'width');
      assert.equal(resolveLogicalProperty('margin-block-start', 'sideways-rl', 'ltr'), 'margin-right');
      assert.equal(resolveLogicalProperty('margin-inline-start', 'sideways-rl', 'ltr'), 'margin-top');
    });

    it('maps abstract properties for sideways-lr with ltr and rtl', () => {
      assert.equal(resolveLogicalProperty('inline-size', 'sideways-lr', 'ltr'), 'height');
      assert.equal(resolveLogicalProperty('block-size', 'sideways-lr', 'ltr'), 'width');
      assert.equal(resolveLogicalProperty('margin-block-start', 'sideways-lr', 'ltr'), 'margin-left');
      assert.equal(resolveLogicalProperty('margin-inline-start', 'sideways-lr', 'ltr'), 'margin-bottom');
      assert.equal(resolveLogicalProperty('margin-inline-start', 'sideways-lr', 'rtl'), 'margin-top');
    });
  });
});
