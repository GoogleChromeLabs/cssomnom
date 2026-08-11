import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CSS, CSSStyleSheet, CSSStyleRule, CSSCounterStyleRule, CSSFontFeatureValuesRule, CSSNamespaceRule, CSSImportRule, parse } from '../src/index.ts';

describe('Phase 83 - CSSOM Rules, Serialization & CSS.escape', () => {
  describe('CSS.escape', () => {
    // cssom-1 § 3 #the-css.escape()-method
    it('escapes complex selectors and identifiers correctly', () => {
      assert.strictEqual(CSS.escape('.item#123:hover'), '\\.item\\#123\\:hover');
      assert.strictEqual(CSS.escape('123'), '\\31 23');
      assert.strictEqual(CSS.escape('-123'), '-\\31 23');
      assert.strictEqual(CSS.escape('--custom'), '--custom');
      assert.strictEqual(CSS.escape('-'), '\\-');
      assert.strictEqual(CSS.escape('\0'), '\uFFFD');
    });
  });

  describe('CSSStyleRule.selectorText dynamic setter', () => {
    // cssom-1 § 6.4.1 #dom-cssstylerule-selectortext
    it('updates selectorText on valid selector input', () => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync('.foo { color: red; }');
      const rule = sheet.cssRules[0] as CSSStyleRule;
      assert.strictEqual(rule.selectorText, '.foo');

      rule.selectorText = '#container > div.active';
      assert.strictEqual(rule.selectorText, '#container > div.active');
    });

    it('ignores invalid selector input without modifying rule or throwing', () => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync('.original { color: blue; }');
      const rule = sheet.cssRules[0] as CSSStyleRule;

      rule.selectorText = ':::';
      assert.strictEqual(rule.selectorText, '.original');

      rule.selectorText = '';
      assert.strictEqual(rule.selectorText, '.original');

      rule.selectorText = '   ';
      assert.strictEqual(rule.selectorText, '.original');

      rule.selectorText = '{';
      assert.strictEqual(rule.selectorText, '.original');
    });
  });

  describe('CSSCounterStyleRule', () => {
    // css-counter-styles-3 § 8.1 #csscounterstylerule
    it('parses and serializes @counter-style rules without newlines', () => {
      const sheet = parse(`
        @counter-style thumbs {
          system: cyclic;
          symbols: 👍 👎;
          suffix: " ";
        }
      `);
      assert.strictEqual(sheet.cssRules.length, 1);
      const rule = sheet.cssRules[0] as CSSCounterStyleRule;
      assert.ok(rule instanceof CSSCounterStyleRule);
      assert.strictEqual(rule.type, 11);
      assert.strictEqual(rule.name, 'thumbs');
      assert.strictEqual(rule.system, 'cyclic');
      assert.strictEqual(rule.symbols, '👍 👎');
      assert.strictEqual(rule.suffix, '" "');
      assert.strictEqual(Object.prototype.toString.call(rule), '[object CSSCounterStyleRule]');
      assert.ok(!rule.cssText.includes('\n'), 'cssText must not contain unformatted newlines');
    });

    it('allows updating descriptors via getters/setters', () => {
      const sheet = parse('@counter-style test {}');
      const rule = sheet.cssRules[0] as CSSCounterStyleRule;
      rule.name = 'updated';
      rule.system = 'numeric';
      assert.strictEqual(rule.name, 'updated');
      assert.strictEqual(rule.system, 'numeric');
    });
  });

  describe('CSSFontFeatureValuesRule', () => {
    // css-fonts-4 § 8 #cssfontfeaturevaluesrule-interface
    it('parses feature value blocks into maplike collections', () => {
      const sheet = parse(`
        @font-feature-values test_family {
          @annotation {
            the_first: 6;
          }
          @styleset {
            yo: 7;
            del: 4;
            di: 10 9 4 5;
          }
        }
      `);
      assert.strictEqual(sheet.cssRules.length, 1);
      const rule = sheet.cssRules[0] as CSSFontFeatureValuesRule;
      assert.ok(rule instanceof CSSFontFeatureValuesRule);
      assert.strictEqual(rule.type, 14);
      assert.strictEqual(rule.fontFamily, 'test_family');
      assert.strictEqual(rule.annotation.size, 1);
      assert.deepStrictEqual(rule.annotation.get('the_first'), [6]);
      assert.strictEqual(rule.styleset.size, 3);
      assert.deepStrictEqual(rule.styleset.get('yo'), [7]);
      assert.deepStrictEqual(rule.styleset.get('del'), [4]);
      assert.deepStrictEqual(rule.styleset.get('di'), [10, 9, 4, 5]);
      assert.strictEqual(rule.ornaments.size, 0);
      assert.strictEqual(Object.prototype.toString.call(rule), '[object CSSFontFeatureValuesRule]');
      assert.strictEqual(Object.prototype.toString.call(rule.styleset), '[object CSSFontFeatureValuesMap]');
    });

    it('supports map manipulation on feature value maps', () => {
      const rule = new CSSFontFeatureValuesRule('Baskerville');
      rule.styleset.set('swash-alt', 42);
      assert.strictEqual(rule.styleset.size, 1);
      assert.deepStrictEqual(rule.styleset.get('swash-alt'), [42]);

      rule.styleset.set('multi', [1, 2, 3]);
      assert.strictEqual(rule.styleset.size, 2);
      assert.deepStrictEqual(rule.styleset.get('multi'), [1, 2, 3]);

      assert.strictEqual(rule.styleset.has('swash-alt'), true);
      assert.strictEqual(rule.styleset.delete('swash-alt'), true);
      assert.strictEqual(rule.styleset.size, 1);

      rule.styleset.clear();
      assert.strictEqual(rule.styleset.size, 0);
    });
  });

  describe('CSSNamespaceRule and CSSImportRule WebIDL conformance', () => {
    // cssom-1 § 6.4.5 #dom-cssnamespacerule
    it('provides prototype getters and [Symbol.toStringTag]', () => {
      const sheet = parse('@namespace prefix "http://example.com/ns";');
      const rule = sheet.cssRules[0] as CSSNamespaceRule;
      assert.ok(rule instanceof CSSNamespaceRule);
      assert.strictEqual(rule.prefix, 'prefix');
      assert.strictEqual(rule.namespaceURI, 'http://example.com/ns');
      assert.strictEqual(Object.prototype.toString.call(rule), '[object CSSNamespaceRule]');
      assert.strictEqual(Object.prototype.hasOwnProperty.call(rule, 'prefix'), false);
      assert.strictEqual('prefix' in rule, true);
    });

    it('CSSImportRule conforms to WebIDL prototype attribute inheritance', () => {
      const sheet = parse('@import url("style.css") layer(framework) supports(display: grid) print;');
      const rule = sheet.cssRules[0] as CSSImportRule;
      assert.ok(rule instanceof CSSImportRule);
      assert.strictEqual(rule.href, 'style.css');
      assert.strictEqual(rule.layerName, 'framework');
      assert.strictEqual(rule.supportsText, 'display: grid');
      assert.strictEqual(rule.media.mediaText, 'print');
      assert.strictEqual(Object.prototype.toString.call(rule), '[object CSSImportRule]');
      assert.strictEqual(Object.prototype.hasOwnProperty.call(rule, 'href'), false);
      assert.strictEqual('href' in rule, true);
    });
  });

  describe('Constructable CSSStyleSheet replace() and replaceSync()', () => {
    // cssom-1 § 6.5.1 #dom-cssstylesheet-replace
    it('asynchronously replaces rules and locks modification during parallel parsing', async () => {
      const sheet = new CSSStyleSheet();
      const promise = sheet.replace('.async-test { color: green; }');
      assert.ok(promise instanceof Promise);

      // Simultaneous synchronous modification should throw NotAllowedError while async replace is in progress
      assert.throws(() => {
        sheet.replaceSync('.disallowed {}');
      }, /Modification is disallowed/);

      const resolved = await promise;
      assert.strictEqual(resolved, sheet);
      assert.strictEqual(sheet.cssRules.length, 1);
      assert.strictEqual((sheet.cssRules[0] as CSSStyleRule).selectorText, '.async-test');

      // Now modification is allowed again
      sheet.replaceSync('.allowed {}');
      assert.strictEqual((sheet.cssRules[0] as CSSStyleRule).selectorText, '.allowed');
    });

    it('rejects replace on non-constructed stylesheets', async () => {
      const parsedSheet = parse('.static {}');
      await assert.rejects(async () => {
        await parsedSheet.replace('.new {}');
      }, (err: Error) => err.name === 'NotAllowedError');
    });
  });
});
