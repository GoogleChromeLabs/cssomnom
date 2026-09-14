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

// WebIDL § 3.6 #es-attributes
// WebIDL § 3.6.1 #es-attribute-getter
// WebIDL § 3.6.2 #es-attribute-setter
// WebIDL § 3.6.3 #interface-prototype-object
// WebIDL § 3.6.4 #es-constants
// WebIDL § 3.6.5 #constants-on-interface-prototype-object
// WebIDL § 3.7 #es-operations

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import * as CSSOM from '../src/CSSOM.ts';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';
import { CSSStyleProperties } from '../src/data/gen/properties.ts';
import { applyWebIDLInterface } from '../src/webidl.ts';
import { patchWindowForTypedOM } from './dom-shim/src/index.ts';

describe('WebIDL Interface Prototype Member Descriptors in CSSOM', () => {
  // Derive test subjects independently from module exports rather than hardcoding.
  const exportedEntries = Object.entries({
    ...CSSOM,
    CSSStyleDeclaration,
    CSSStyleProperties
  });

  const cssomClasses = exportedEntries
    .filter(([_name, val]) => typeof val === 'function' && val.prototype && typeof val.prototype === 'object')
    .map(([name, val]) => ({ name, ctor: val as Function }));

  test('prototype member attributes and operations are enumerable across CSSOM classes (drift guard)', () => {
    // WebIDL § 3.6 #es-attributes & WebIDL § 3.7 #es-operations:
    // Regular attributes and operations on the interface prototype object must have [[Enumerable]]: true.
    const nonEnumerable: string[] = [];

    for (const { name, ctor } of cssomClasses) {
      const proto = ctor.prototype;
      for (const propName of Object.getOwnPropertyNames(proto)) {
        if (propName === 'constructor' || propName === 'location' || propName.startsWith('_')) continue;
        const desc = Object.getOwnPropertyDescriptor(proto, propName);
        if (desc && !desc.enumerable) {
          nonEnumerable.push(`${name}.prototype.${propName}`);
        }
      }
    }

    assert.deepStrictEqual(
      nonEnumerable,
      [],
      'Exported CSSOM interfaces have non-enumerable prototype members violating WebIDL § 3.6/3.7:\n  ' +
        nonEnumerable.join('\n  ')
    );
  });

  test('prototype attribute getters throw TypeError when called on prototype object (brand checks)', () => {
    // WebIDL § 3.6.1 #es-attribute-getter:
    // If the attribute is a regular attribute: If the this value is not an ECMAScript object that
    // implements the interface, throw a TypeError.
    const failingBrandChecks: string[] = [];

    for (const { name, ctor } of cssomClasses) {
      const proto = ctor.prototype;
      for (const propName of Object.getOwnPropertyNames(proto)) {
        if (propName === 'constructor' || propName === 'location' || propName.startsWith('_')) continue;
        const desc = Object.getOwnPropertyDescriptor(proto, propName);
        if (desc && typeof desc.get === 'function') {
          try {
            // Invoking on the prototype itself must throw TypeError
            desc.get.call(proto);
            failingBrandChecks.push(`${name}.prototype.${propName} did not throw on prototype receiver`);
          } catch (err) {
            if (!(err instanceof TypeError)) {
              failingBrandChecks.push(
                `${name}.prototype.${propName} threw ${err?.constructor?.name ?? typeof err} instead of TypeError`
              );
            }
          }

          try {
            // Invoking on an unrelated plain object must throw TypeError
            desc.get.call({});
            failingBrandChecks.push(`${name}.prototype.${propName} did not throw on plain object receiver`);
          } catch (err) {
            if (!(err instanceof TypeError)) {
              failingBrandChecks.push(
                `${name}.prototype.${propName} on {} threw ${err?.constructor?.name ?? typeof err} instead of TypeError`
              );
            }
          }
        }
      }
    }

    assert.deepStrictEqual(
      failingBrandChecks,
      [],
      'CSSOM interface attribute getters failed WebIDL § 3.6.1 brand checks:\n  ' +
        failingBrandChecks.join('\n  ')
    );
  });

  test('operations throw TypeError when called with fewer than required arguments', () => {
    // WebIDL § 3.7 #es-operations:
    // If fewer arguments than required are passed, throw a TypeError.
    const dummyInstance = new CSSOM.CSSStyleSheet();
    const media = new CSSOM.MediaList();
    const decl = new CSSStyleDeclaration();

    // MediaList.item(unsigned long)
    assert.throws(() => {
      // @ts-expect-error - testing invalid arity
      media.item();
    }, TypeError);

    // MediaList.appendMedium(CSSOMString)
    assert.throws(() => {
      // @ts-expect-error - testing invalid arity
      media.appendMedium();
    }, TypeError);

    // CSSStyleSheet.insertRule(CSSOMString, optional unsigned long)
    assert.throws(() => {
      // @ts-expect-error - testing invalid arity
      dummyInstance.insertRule();
    }, TypeError);

    // CSSStyleSheet.deleteRule(unsigned long)
    assert.throws(() => {
      // @ts-expect-error - testing invalid arity
      dummyInstance.deleteRule();
    }, TypeError);

    // CSSStyleDeclaration operations
    assert.throws(() => {
      // @ts-expect-error - testing invalid arity
      decl.item();
    }, TypeError);

    assert.throws(() => {
      // @ts-expect-error - testing invalid arity
      decl.getPropertyValue();
    }, TypeError);

    assert.throws(() => {
      // @ts-expect-error - testing invalid arity
      decl.getPropertyPriority();
    }, TypeError);

    assert.throws(() => {
      // @ts-expect-error - testing invalid arity
      decl.setProperty('color');
    }, TypeError);

    assert.throws(() => {
      // @ts-expect-error - testing invalid arity
      decl.removeProperty();
    }, TypeError);
  });

  test('CSSRule legacy constants on interface object and prototype conform to WebIDL § 3.6.4/3.6.5', () => {
    // Derive constant domain dynamically from interface object rather than hardcoding
    const constantNames = Object.getOwnPropertyNames(CSSOM.CSSRule)
      .filter((name) => /^[A-Z][A-Z0-9_]*_RULE$/.test(name))
      .sort();

    // cssom-1 § 6.4 & WebIDL § 3.6.4: All 13 legacy constants must be present including FONT_FEATURE_VALUES_RULE
    assert.ok(
      constantNames.length >= 13,
      `Expected at least 13 legacy CSSRule constants, found ${constantNames.length}: ${constantNames.join(', ')}`
    );
    assert.ok(
      constantNames.includes('FONT_FEATURE_VALUES_RULE'),
      'FONT_FEATURE_VALUES_RULE (14) must be defined on CSSRule interface'
    );

    for (const name of constantNames) {
      // On constructor (WebIDL § 3.6.4 #es-constants)
      const ctorDesc = Object.getOwnPropertyDescriptor(CSSOM.CSSRule, name);
      assert.ok(ctorDesc, `CSSRule.${name} must exist`);
      assert.strictEqual(ctorDesc.writable, false, `CSSRule.${name} must not be writable`);
      assert.strictEqual(ctorDesc.enumerable, true, `CSSRule.${name} must be enumerable`);
      assert.strictEqual(ctorDesc.configurable, false, `CSSRule.${name} must not be configurable`);
      assert.strictEqual(typeof ctorDesc.value, 'number', `CSSRule.${name} must be numeric value`);

      // On prototype (WebIDL § 3.6.5 #constants-on-interface-prototype-object)
      const protoDesc = Object.getOwnPropertyDescriptor(CSSOM.CSSRule.prototype, name);
      assert.ok(protoDesc, `CSSRule.prototype.${name} must exist`);
      assert.strictEqual(protoDesc.writable, false, `CSSRule.prototype.${name} must not be writable`);
      assert.strictEqual(protoDesc.enumerable, true, `CSSRule.prototype.${name} must be enumerable`);
      assert.strictEqual(protoDesc.configurable, false, `CSSRule.prototype.${name} must not be configurable`);
      assert.strictEqual(typeof protoDesc.value, 'number', `CSSRule.prototype.${name} must be numeric value`);
      assert.strictEqual(protoDesc.value, ctorDesc.value, `CSSRule.${name} and CSSRule.prototype.${name} values must match`);
    }

    // Bidirectional drift guard: prototype must match constructor constants exactly
    const protoConstantNames = Object.getOwnPropertyNames(CSSOM.CSSRule.prototype)
      .filter((name) => /^[A-Z][A-Z0-9_]*_RULE$/.test(name))
      .sort();
    assert.deepStrictEqual(
      protoConstantNames,
      constantNames,
      'Constants on CSSRule constructor and CSSRule.prototype must match exactly'
    );
  });

  test('applyWebIDLInterface idempotency: double-wrapping is a no-op', () => {
    class TestInterface {
      op(a: string, b: string): string {
        return a + b;
      }
      get attr(): string {
        return 'val';
      }
    }

    applyWebIDLInterface(TestInterface);
    const opDesc1 = Object.getOwnPropertyDescriptor(TestInterface.prototype, 'op')!;
    const attrDesc1 = Object.getOwnPropertyDescriptor(TestInterface.prototype, 'attr')!;

    // Re-wrap the exact same constructor
    applyWebIDLInterface(TestInterface);
    const opDesc2 = Object.getOwnPropertyDescriptor(TestInterface.prototype, 'op')!;
    const attrDesc2 = Object.getOwnPropertyDescriptor(TestInterface.prototype, 'attr')!;

    assert.strictEqual(opDesc1.value, opDesc2.value, 'Operation wrapper function must not be re-wrapped');
    assert.strictEqual(attrDesc1.get, attrDesc2.get, 'Attribute getter wrapper must not be re-wrapped');
  });

  test('operations error messages correctly pluralize required argument counts', () => {
    const dummyInstance = new CSSOM.CSSStyleSheet();
    assert.throws(
      () => {
        // @ts-expect-error - invalid arity
        dummyInstance.insertRule();
      },
      (err: unknown) => {
        return err instanceof TypeError && err.message.includes('1 argument required');
      }
    );

    const decl = new CSSStyleDeclaration();
    assert.throws(
      () => {
        // @ts-expect-error - invalid arity
        decl.setProperty('color');
      },
      (err: unknown) => {
        return err instanceof TypeError && err.message.includes('2 arguments required');
      }
    );
  });

  test('CSSGroupingRule.prototype.cssRules and CSSStyleDeclaration.prototype.parentRule inheritance', () => {
    // CSSGroupingRule.prototype.cssRules must be an accessor on prototype, not own property
    const cssRulesDesc = Object.getOwnPropertyDescriptor(CSSOM.CSSGroupingRule.prototype, 'cssRules');
    assert.ok(cssRulesDesc, 'CSSGroupingRule.prototype.cssRules must exist');
    assert.strictEqual(typeof cssRulesDesc.get, 'function', 'CSSGroupingRule.prototype.cssRules must be getter');
    assert.strictEqual(cssRulesDesc.enumerable, true);

    const groupingRule = new CSSOM.CSSMediaRule('screen', [], () => ({} as import('../src/types.ts').Rule));
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(groupingRule, 'cssRules'),
      false,
      'groupingRule must inherit cssRules from prototype, not have it as own property'
    );
    assert.ok(groupingRule.cssRules);

    // CSSStyleDeclaration.prototype.parentRule must be an accessor on prototype, not own property
    const parentRuleDesc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'parentRule');
    assert.ok(parentRuleDesc, 'CSSStyleDeclaration.prototype.parentRule must exist');
    assert.strictEqual(typeof parentRuleDesc.get, 'function');
    assert.strictEqual(parentRuleDesc.enumerable, true);

    const decl = new CSSStyleDeclaration();
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(decl, 'parentRule'),
      false,
      'decl must inherit parentRule from prototype, not have it as own property'
    );
  });

  test('CSSMarginRule.prototype.name and CSSStyleProperties.prototype.cssFloat', () => {
    const nameDesc = Object.getOwnPropertyDescriptor(CSSOM.CSSMarginRule.prototype, 'name');
    assert.ok(nameDesc, 'CSSMarginRule.prototype.name must exist');
    assert.strictEqual(typeof nameDesc.get, 'function');
    assert.strictEqual(nameDesc.enumerable, true);

    const floatDesc = Object.getOwnPropertyDescriptor(CSSStyleProperties.prototype, 'cssFloat');
    assert.ok(floatDesc, 'CSSStyleProperties.prototype.cssFloat must exist');
    assert.strictEqual(typeof floatDesc.get, 'function');
    assert.strictEqual(floatDesc.enumerable, true);
  });

  test('DOM shim prototypes conform to WebIDL descriptors and brand checks', () => {
    const dom = parseHTML('<!DOCTYPE html><html><body><div id="test"></div></body></html>');
    const win = dom.window;
    patchWindowForTypedOM(win);

    // window globals exposed
    assert.ok(win.StyleSheet, 'window.StyleSheet must be exposed');
    assert.ok(win.StyleSheetList, 'window.StyleSheetList must be exposed');
    assert.ok(win.CSSRuleList, 'window.CSSRuleList must be exposed');

    // HTMLElement.prototype.style
    const htmlStyleDesc = Object.getOwnPropertyDescriptor(win.HTMLElement.prototype, 'style');
    assert.ok(htmlStyleDesc, 'HTMLElement.prototype.style must exist');
    assert.strictEqual(htmlStyleDesc.enumerable, true, 'HTMLElement.prototype.style must be enumerable');
    assert.throws(() => {
      htmlStyleDesc.get?.call(win.HTMLElement.prototype);
    }, TypeError, 'HTMLElement.prototype.style getter must throw on prototype');

    // SVGElement.prototype.style
    const svgProto = (win.SVGElement as Function)?.prototype;
    if (svgProto) {
      const svgStyleDesc = Object.getOwnPropertyDescriptor(svgProto, 'style');
      assert.ok(svgStyleDesc, 'SVGElement.prototype.style must exist');
      assert.strictEqual(svgStyleDesc.enumerable, true, 'SVGElement.prototype.style must be enumerable');
      assert.throws(() => {
        svgStyleDesc.get?.call(svgProto);
      }, TypeError, 'SVGElement.prototype.style getter must throw on prototype');
    }

    // HTMLStyleElement.prototype.sheet and disabled
    const sheetDesc = Object.getOwnPropertyDescriptor(win.HTMLStyleElement.prototype, 'sheet');
    assert.ok(sheetDesc, 'HTMLStyleElement.prototype.sheet must exist');
    assert.strictEqual(sheetDesc.enumerable, true);
    assert.throws(() => {
      sheetDesc.get?.call(win.HTMLStyleElement.prototype);
    }, TypeError, 'HTMLStyleElement.prototype.sheet must throw on prototype');

    const disabledDesc = Object.getOwnPropertyDescriptor(win.HTMLStyleElement.prototype, 'disabled');
    assert.ok(disabledDesc, 'HTMLStyleElement.prototype.disabled must exist');
    assert.strictEqual(disabledDesc.enumerable, true);
    assert.throws(() => {
      disabledDesc.get?.call(win.HTMLStyleElement.prototype);
    }, TypeError, 'HTMLStyleElement.prototype.disabled must throw on prototype');

    // Document.prototype.styleSheets
    const docProto = (win.Document as Function).prototype;
    const docSheetsDesc = Object.getOwnPropertyDescriptor(docProto, 'styleSheets');
    assert.ok(docSheetsDesc, 'Document.prototype.styleSheets must exist');
    assert.strictEqual(docSheetsDesc.enumerable, true);
    assert.throws(() => {
      docSheetsDesc.get?.call(docProto);
    }, TypeError, 'Document.prototype.styleSheets must throw on prototype');

    // document.styleSheets inherits length from StyleSheetList.prototype
    const styleSheets = win.document.styleSheets;
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(styleSheets, 'length'),
      false,
      'document.styleSheets must inherit length from StyleSheetList.prototype'
    );
    assert.strictEqual(typeof styleSheets.length, 'number');

    // window.getComputedStyle arity check
    assert.throws(() => {
      // @ts-expect-error - testing invalid arity
      win.getComputedStyle();
    }, TypeError, 'window.getComputedStyle must throw TypeError with 0 arguments');
  });
});
