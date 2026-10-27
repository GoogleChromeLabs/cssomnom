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
import fs from 'node:fs';
import path from 'node:path';

import * as RootExports from '../src/index.ts';
import * as ParseExports from '../src/parse-entry.ts';
import * as ParserApiExports from '../src/parser-api.ts';
import {
  parse,
  CSS,
  CSSStyleSheet,
  CSSStyleDeclaration,
  CSSKeyframesRule,
  CSSKeyframeRule,
} from '../src/index.ts';

describe('Phase 160: Public API Lockdown, ./parse Bundle Diet & Code Quality', () => {

  describe('160.1: 3-Cupboard Package Entrypoint Separation', () => {
    it('Cupboard 1 (.) exports pure CSS namespace without WICG or resolveNestedSelector', () => {
      assert.equal(typeof CSS, 'object');
      assert.equal(CSS[Symbol.toStringTag], 'CSS');
      assert.equal(typeof CSS.escape, 'function');
      assert.equal(typeof CSS.supports, 'function');
      assert.equal(typeof CSS.registerProperty, 'function');
      assert.equal(typeof CSS.px, 'function');

      // Must NOT attach tooling extensions or WICG parser API to CSS
      assert.equal('resolveNestedSelector' in CSS, false, 'resolveNestedSelector must not be on CSS');
      assert.equal('parseStylesheet' in CSS, false, 'parseStylesheet must not be on CSS');
      assert.equal('parseRule' in CSS, false, 'parseRule must not be on CSS');

      // Cupboard 1 top-level exports
      assert.equal(typeof RootExports.resolveNestedSelector, 'function');
      assert.equal(typeof RootExports.calculateSpecificity, 'function');
      assert.equal(typeof RootExports.getCascadedStyle, 'function');
      assert.equal(typeof RootExports.resolveVariables, 'function');
      assert.equal(typeof RootExports.supports, 'function');

      // Parser must NOT be exported from .
      assert.equal('Parser' in RootExports, false, 'Parser must not be exported from .');

      // WICG Parser API must NOT be in .
      assert.equal('CSSParserValue' in RootExports, false, 'CSSParserValue must not be in .');
      assert.equal('CSSParserToken' in RootExports, false, 'CSSParserToken must not be in .');
      assert.equal('CSSParserRule' in RootExports, false, 'CSSParserRule must not be in .');
    });

    it('Cupboard 2 (./parse) is a strict subset of . with identical signatures', () => {
      const rootKeys = new Set(Object.keys(RootExports));
      const parseKeys = Object.keys(ParseExports);

      for (const key of parseKeys) {
        assert.ok(
          rootKeys.has(key),
          `Export "${key}" from src/parse-entry.ts must also exist in src/index.ts`
        );
      }

      // Parser and low-level internal helpers must NOT be in parse-entry
      assert.equal('Parser' in ParseExports, false, 'Parser must not be in parse-entry');
      assert.equal('parseRule' in ParseExports, false, 'parseRule must not be in parse-entry');
      assert.equal('parseStyleSheet' in ParseExports, false, 'parseStyleSheet must not be in parse-entry');
      assert.equal('parseRuleInBlock' in ParseExports, false, 'parseRuleInBlock must not be in parse-entry');
      assert.equal('parseRuleInScopeBlock' in ParseExports, false, 'parseRuleInScopeBlock must not be in parse-entry');

      // calculateSpecificity must be exported
      assert.equal(typeof ParseExports.calculateSpecificity, 'function');
    });

    it('Cupboard 3 (./parser-api) exports canonical WICG parser API without *Sync duplicates', () => {
      assert.equal(typeof ParserApiExports.parseStylesheet, 'function');
      assert.equal(typeof ParserApiExports.parseRuleList, 'function');
      assert.equal(typeof ParserApiExports.parseRule, 'function');
      assert.equal(typeof ParserApiExports.parseDeclarationList, 'function');
      assert.equal(typeof ParserApiExports.parseDeclaration, 'function');
      assert.equal(typeof ParserApiExports.parseComponentValue, 'function');
      assert.equal(typeof ParserApiExports.parseValue, 'function');
      assert.equal(typeof ParserApiExports.parseValueList, 'function');
      assert.equal(typeof ParserApiExports.parseCommaValueList, 'function');

      // Redundant *Sync aliases must be dropped
      assert.equal('parseStylesheetSync' in ParserApiExports, false);
      assert.equal('parseRuleListSync' in ParserApiExports, false);
      assert.equal('parseRuleSync' in ParserApiExports, false);
      assert.equal('parseDeclarationListSync' in ParserApiExports, false);
      assert.equal('parseDeclarationSync' in ParserApiExports, false);
      assert.equal('parseComponentValueSync' in ParserApiExports, false);
      assert.equal('parseValueSync' in ParserApiExports, false);
      assert.equal('parseValueListSync' in ParserApiExports, false);
      assert.equal('parseCommaValueListSync' in ParserApiExports, false);
    });
  });

  describe('160.2: Pure Tree-Shakeable Functions & Retire Parser.* Static Grab-Bag', () => {
    it('Parser class in parser.ts does not leak retired static helpers', async () => {
      const { Parser } = await import('../src/parser.ts');
      assert.equal('isValidDashedIdent' in Parser, false);
      assert.equal('isCustomPropertyDeclaration' in Parser, false);
      assert.equal('validateCustomPropertyValue' in Parser, false);
      assert.equal('parseRuleInBlockText' in Parser, false);
      assert.equal('parseRuleInScopeBlockText' in Parser, false);
      assert.equal('getCascadedStyle' in Parser, false);
      assert.equal('resolveVariables' in Parser, false);
      assert.equal('calculateSpecificity' in Parser, false);
    });
  });

  describe('160.3: Runtime #private Encapsulation & Object.keys() Hygiene', () => {
    it('Object.keys(sheet) is []', () => {
      const sheet = new CSSStyleSheet();
      assert.deepEqual(Object.keys(sheet), []);

      const parsedSheet = parse('body { color: blue; }');
      assert.deepEqual(Object.keys(parsedSheet), []);
    });

    it('Object.keys(rule) is [] for all CSSRule instances', () => {
      const sheet = parse(`
        @media screen { div { color: red; } }
        @layer base { p { margin: 0; } }
        @keyframes slide { from { left: 0; } to { left: 100px; } }
        @property --accent { syntax: "<color>"; inherits: false; initial-value: red; }
        @supports (display: flex) { main { display: flex; } }
        a { text-decoration: none; }
      `);

      for (let i = 0; i < sheet.cssRules.length; i++) {
        const rule = sheet.cssRules[i];
        assert.deepEqual(
          Object.keys(rule),
          [],
          `Object.keys(rule) must be [] for ${rule.constructor.name}`
        );
      }
    });

    it('Object.keys(style) only returns indexed property names and no internal _ fields', () => {
      const style = new CSSStyleDeclaration();
      assert.deepEqual(Object.keys(style), []);

      style.setProperty('color', 'red');
      style.setProperty('margin-top', '10px');
      assert.deepEqual(Object.keys(style), ['0', '1']);

      // Ensure no internal _ properties leak
      for (const key of Object.getOwnPropertyNames(style)) {
        assert.equal(key.startsWith('_'), false, `Found internal property "${key}" on style`);
      }
    });

    it('CSSStyleDeclaration proxy method identity is preserved', () => {
      const style = new CSSStyleDeclaration();
      assert.equal(style.setProperty === style.setProperty, true, 'style.setProperty method identity must be stable');
      assert.equal(style.getPropertyValue === style.getPropertyValue, true, 'style.getPropertyValue method identity must be stable');
      assert.equal(style.removeProperty === style.removeProperty, true, 'style.removeProperty method identity must be stable');
    });

    it('style.setProperty(prop, undefined) behavior adheres to custom-ident & custom property rules', () => {
      const style = new CSSStyleDeclaration();

      // Standard non-custom-ident property: undefined is ignored
      style.setProperty('font-size', undefined as unknown as string);
      assert.equal(style.getPropertyValue('font-size'), '');

      // Custom-ident property (animation-name): undefined is coerced to 'undefined'
      style.setProperty('animation-name', undefined as unknown as string);
      assert.equal(style.getPropertyValue('animation-name'), 'undefined');

      // Custom property (--foo): undefined is coerced to 'undefined'
      style.setProperty('--foo', undefined as unknown as string);
      assert.equal(style.getPropertyValue('--foo'), 'undefined');

      // Also verify when stylesheet is parsed from ./parse entrypoint
      const parseSheet = ParseExports.parse('body { font-size: 16px; animation-name: slide; }');
      const rule = parseSheet.cssRules[0] as unknown as { style: CSSStyleDeclaration };
      rule.style.setProperty('font-size', undefined as unknown as string);
      assert.equal(rule.style.getPropertyValue('font-size'), '16px'); // untouched

      rule.style.setProperty('animation-name', undefined as unknown as string);
      assert.equal(rule.style.getPropertyValue('animation-name'), 'undefined');
    });

    it('CSSStyleDeclaration.prototype.setProperty accepts 3 WebIDL arguments', () => {
      assert.equal(CSSStyleDeclaration.prototype.setProperty.length, 2); // 2 mandatory (prop, val)
    });

    it('setCssTextSilent is deleted from CSSStyleDeclaration.prototype', () => {
      assert.equal('setCssTextSilent' in CSSStyleDeclaration.prototype, false);
    });

    it('dist/**/*.d.ts contains zero non-private _ properties when stripInternal is enabled', () => {
      const distDir = path.resolve(import.meta.dirname, '../dist');
      if (!fs.existsSync(distDir)) return;

      const dtsFiles = fs
        .readdirSync(distDir, { recursive: true })
        .filter((f): f is string => typeof f === 'string' && f.endsWith('.d.ts'));
      assert.ok(dtsFiles.length > 0, 'Expected emitted .d.ts files in dist/');

      const leaks: string[] = [];
      for (const rel of dtsFiles) {
        const lines = fs.readFileSync(path.join(distDir, rel), 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          // Skip `private _foo;` declarations which TypeScript emits as opaque nominal markers
          if (trimmed.startsWith('private ')) continue;
          // Match class/interface member declarations starting with _ (optional readonly/protected/get/set prefix)
          if (/^(?:(?:readonly|protected|public|static|abstract|get|set)\s+)*_[a-zA-Z0-9]+/.test(trimmed)) {
            leaks.push(`${rel}: ${trimmed}`);
          }
        }
      }
      assert.deepEqual(leaks, [], `Found non-private _ declarations in dist/**/*.d.ts:\n${leaks.join('\n')}`);
    });
  });

  describe('160.5: Thermo-Nuclear Bug / Complexity Fixes', () => {
    it('@property with prelude comments parses properly', () => {
      const sheet = parse('@property --foo /* comment */ { syntax: "*"; inherits: false; }');
      assert.equal(sheet.cssRules.length, 1);
      assert.equal(sheet.cssRules[0].constructor.name, 'CSSPropertyRule');
      const propRule = sheet.cssRules[0] as unknown as { name: string; syntax: string; inherits: boolean };
      assert.equal(propRule.name, '--foo');
      assert.equal(propRule.syntax, '*');
      assert.equal(propRule.inherits, false);
    });

    it('@layer with prelude comments parses properly', () => {
      const sheet = parse('@layer /* comment */ foo.bar /* note */ { div { color: red; } }');
      assert.equal(sheet.cssRules.length, 1);
      assert.equal(sheet.cssRules[0].constructor.name, 'CSSLayerBlockRule');
      const layerRule = sheet.cssRules[0] as unknown as { name: string };
      assert.equal(layerRule.name, 'foo.bar');
    });

    it('CSSKeyframesRule.prototype.appendRule with comments containing braces parses properly', () => {
      const sheet = parse('@keyframes spin {}');
      const kfRule = sheet.cssRules[0] as CSSKeyframesRule;
      assert.equal(kfRule.cssRules.length, 0);

      kfRule.appendRule('0% { color: red; } /* } */');
      assert.equal(kfRule.cssRules.length, 1);
      const child = kfRule.cssRules[0] as CSSKeyframeRule;
      assert.equal(child.keyText, '0%');
      assert.equal(child.style.getPropertyValue('color'), 'red');
    });
  });
});
