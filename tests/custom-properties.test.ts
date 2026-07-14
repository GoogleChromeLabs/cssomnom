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
import { test } from 'node:test';
import assert from 'node:assert';
import { CSSStyleDeclaration, CSSPropertyRule, CSSStyleSheet, CSSStyleRule } from '../src/index.ts';
import { CSSStyleValue, CSSUnparsedValue, CSSVariableReferenceValue } from '../src/typed-om.ts';
import { Parser } from '../src/parser.ts';
import { PropertyRegistry } from '../src/PropertyRegistry.ts';

test('CSSOM: Custom property empty serialization', () => {
  const style = new CSSStyleDeclaration([]);
  style.cssText = '--foo:;';
  assert.strictEqual(style.getPropertyValue('--foo'), ' ');
  assert.strictEqual(style.cssText, '--foo: ;'); 
  // Actually, serializeDeclarations does: `${d.name}: ${val}`.
  // if val is ' ', then it's `--foo:  ;`.
  
  // Wait! Spec says "serialize as a single space".
  // Chrome: `--foo: ;` (one space after colon).
  // If getPropertyValue returns ' ', and we do `${name}: ${val}`, we get 2 spaces.
  
  // Maybe getPropertyValue should return empty string if it's empty, 
  // and ONLY the serializer should add the space?
  // But CSSOM spec for getPropertyValue says "return the value".
  
  // Let's see what Chrome does for getPropertyValue('--foo') when it's empty.
  // It returns " ".
  
  // If Chrome returns " ", and cssText is "--foo: ;", then it must NOT add another space.
});

test('Typed OM: CSSVariableReferenceValue parsing', () => {
  const v1 = CSSStyleValue.parse('--test', 'var(--foo)') as CSSUnparsedValue;
  assert.ok(v1 instanceof CSSUnparsedValue);
  const ref1 = v1.item(0) as CSSVariableReferenceValue;
  assert.strictEqual(ref1.variable, '--foo');
  assert.strictEqual(ref1.fallback, null);
  
  const v2 = CSSStyleValue.parse('--test', 'var(--foo, 10px)') as CSSUnparsedValue;
  const ref2 = v2.item(0) as CSSVariableReferenceValue;
  assert.strictEqual(ref2.variable, '--foo');
  assert.ok(ref2.fallback instanceof CSSUnparsedValue);
  assert.strictEqual(ref2.fallback.toString(), '10px');
});

test('Typed OM: CSSVariableReferenceValue parsing - validate fallback comma', () => {
  const v = CSSStyleValue.parse('--test', 'var(--foo fallback)') as CSSUnparsedValue;
  const ref = v.item(0);
  assert.ok(!(ref instanceof CSSVariableReferenceValue), 'Should not be a CSSVariableReferenceValue because fallback is not comma-separated');
});

test('CSSOM: Custom property validation with var() should be lenient at parse time', () => {
  const style = new CSSStyleDeclaration([]);
  style.setProperty('--foo', 'var(--bar fallback)');
  assert.strictEqual(style.getPropertyValue('--foo'), 'var(--bar fallback)', 'Should allow invalid var() syntax in custom property at parse time');
  
  style.setProperty('--bar', 'var()');
  assert.strictEqual(style.getPropertyValue('--bar'), 'var()', 'Should allow empty var() in custom property at parse time');
});

test('CSSStyleDeclaration: Case-insensitivity', () => {
  const style = new CSSStyleDeclaration([]);
  style.setProperty('COLOR', 'red');
  assert.strictEqual(style.getPropertyValue('color'), 'red');
  assert.strictEqual(style.getPropertyValue('Color'), 'red');
  assert.strictEqual(style.item(0), 'color');
  
  style.setProperty('--CUSTOM', 'value');
  assert.strictEqual(style.getPropertyValue('--CUSTOM'), 'value');
  assert.strictEqual(style.getPropertyValue('--custom'), '');
});

test('CSSPropertyRule: Serialization', () => {
  const rule = new CSSPropertyRule('--my-prop', '<length>', true, '10px');
  assert.strictEqual(rule.cssText, '@property --my-prop {syntax: "<length>"; inherits: true;initial-value: 10px;}');
});

test('CSSOM: Physical vs Logical precedence (Independent in StyleDeclaration)', () => {
  const style = new CSSStyleDeclaration([]);
  style.setProperty('margin-top', '10px');
  style.setProperty('margin-block-start', '20px');
  
  assert.strictEqual(style.getPropertyValue('margin-top'), '10px');
  assert.strictEqual(style.getPropertyValue('margin-block-start'), '20px');
  
  style.setProperty('margin-block-start', '30px', 'important');
  assert.strictEqual(style.getPropertyValue('margin-top'), '10px');
  assert.strictEqual(style.getPropertyValue('margin-block-start'), '30px');
  
  style.setProperty('margin-top', '40px', 'important');
  assert.strictEqual(style.getPropertyValue('margin-top'), '40px');
  assert.strictEqual(style.getPropertyValue('margin-block-start'), '30px');
});

test('CSSOM: Recursive shorthand condensation (border)', () => {
  const style = new CSSStyleDeclaration([]);
  style.setProperty('border-top-width', '1px');
  style.setProperty('border-top-style', 'solid');
  style.setProperty('border-top-color', 'black');
  
  // Should condense to border-top
  assert.strictEqual(style.cssText, 'border-top: 1px solid black;');
  
  style.setProperty('border-right-width', '1px');
  style.setProperty('border-right-style', 'solid');
  style.setProperty('border-right-color', 'black');
  style.setProperty('border-bottom-width', '1px');
  style.setProperty('border-bottom-style', 'solid');
  style.setProperty('border-bottom-color', 'black');
  style.setProperty('border-left-width', '1px');
  style.setProperty('border-left-style', 'solid');
  style.setProperty('border-left-color', 'black');
  
  assert.strictEqual(style.cssText, 'border: 1px solid black;');
});

test('Media Queries: Negative values in range features', async () => {
  const { MediaParser, serializeMediaQuery } = await import('../src/MediaParser.ts');
  
  const validate = (text: string) => serializeMediaQuery(MediaParser.parse(text)[0]) !== 'not all';
  
  assert.strictEqual(validate('(width: -10px)'), true);
  
  // Spec says: "Range features ... must not take a negative value."
  // However, task requires allowing valid negative lengths to parse successfully.
  assert.strictEqual(validate('(width > -10px)'), true);
  
  assert.strictEqual(validate('(0px < width < 10px)'), true);
  
  assert.strictEqual(validate('(-10px < width < 10px)'), true);
});

test('@property rule: validation', async () => {
  const { Parser } = await import('../src/parser.ts');
  const { tokenize } = await import('../src/tokenizer.ts');
  
  const parse = (css: string) => {
    const tokens = tokenize(css);
    const parser = new Parser(tokens);
    return parser.parseStyleSheet();
  };

  // Valid @property
  const sheet1 = parse('@property --foo { syntax: "<length>"; inherits: false; initial-value: 10px; }');
  assert.strictEqual(sheet1.cssRules.length, 1);
  assert.strictEqual(sheet1.cssRules[0].type, 18); // PROPERTY_RULE

  // Invalid: missing syntax
  const sheet2 = parse('@property --foo { inherits: false; initial-value: 10px; }');
  assert.strictEqual(sheet2.cssRules.length, 0);

  // Invalid: missing inherits
  const sheet3 = parse('@property --foo { syntax: "<length>"; initial-value: 10px; }');
  assert.strictEqual(sheet3.cssRules.length, 0);

  // Invalid: initial-value doesn't match syntax
  const sheet4 = parse('@property --foo { syntax: "<length>"; inherits: false; initial-value: red; }');
  assert.strictEqual(sheet4.cssRules.length, 0);

  // Invalid: not computationally independent
  const sheet5 = parse('@property --foo { syntax: "<length>"; inherits: false; initial-value: 1em; }');
  assert.strictEqual(sheet5.cssRules.length, 0);
});

test('@property rule: registers property in PropertyRegistry', async () => {
  const { Parser } = await import('../src/parser.ts');
  const { tokenize } = await import('../src/tokenizer.ts');
  const { PropertyRegistry } = await import('../src/PropertyRegistry.ts');
  
  PropertyRegistry.clear();
  
  const parse = (css: string) => {
    const tokens = tokenize(css);
    const parser = new Parser(tokens);
    return parser.parseStyleSheet();
  };

  const sheet = parse('@property --my-registered-prop { syntax: "<length>"; inherits: false; initial-value: 10px; }');
  assert.strictEqual(sheet.cssRules.length, 1);
  
  const def = PropertyRegistry.get('--my-registered-prop');
  assert.ok(def, 'Property should be registered during parsing');
  assert.strictEqual(def.syntax, '<length>');
  assert.strictEqual(def.inherits, false);
  assert.strictEqual(def.initialValue, '10px');
});

test('@property rule: case-insensitive descriptors', async () => {
  const { Parser } = await import('../src/parser.ts');
  const { tokenize } = await import('../src/tokenizer.ts');
  
  const parse = (css: string) => {
    const tokens = tokenize(css);
    const parser = new Parser(tokens);
    return parser.parseStyleSheet();
  };

  const sheet = parse('@property --foo { SYNTAX: "<length>"; INHERITS: false; INITIAL-VALUE: 10px; }');
  assert.strictEqual(sheet.cssRules.length, 1, 'Should accept uppercase descriptors');
});

test('CSSOM: Reject -- as property name', () => {
  const style = new CSSStyleDeclaration([]);
  style.cssText = '--: value;';
  assert.strictEqual(style.getPropertyValue('--'), '');
});

test('PropertyRegistry: Reject -- as property name', async () => {
  const { PropertyRegistry } = await import('../src/PropertyRegistry.ts');
  assert.throws(() => {
    PropertyRegistry.validate({ name: '--', syntax: '*', inherits: false });
  });
});

test('Typed OM: Reject var(--) with empty ident', () => {
  const v = CSSStyleValue.parse('--test', 'var(--)') as CSSUnparsedValue;
  const ref = v.item(0);
  assert.ok(!(ref instanceof CSSVariableReferenceValue), 'Should not be a CSSVariableReferenceValue because name is "--"');
});

test('@property rule: reject -- as name', async () => {
  const { Parser } = await import('../src/parser.ts');
  const { tokenize } = await import('../src/tokenizer.ts');
  
  const parse = (css: string) => {
    const tokens = tokenize(css);
    const parser = new Parser(tokens);
    return parser.parseStyleSheet();
  };

  const sheet = parse('@property -- { syntax: "<length>"; inherits: false; initial-value: 10px; }');
  assert.strictEqual(sheet.cssRules.length, 0, 'Should reject @property with name "--"');
});

test('CSSOM: setProperty rejects -- as property name', () => {
  const style = new CSSStyleDeclaration([]);
  style.setProperty('--', 'value');
  assert.strictEqual(style.getPropertyValue('--'), '');
  assert.strictEqual(style.length, 0);
});

test('Typed OM: CSSStyleValue.parse rejects -- as property name', () => {
  assert.throws(() => {
    CSSStyleValue.parse('--', 'value');
  }, TypeError);
});

test('CSSOM: Custom property rejects top-level semicolon', () => {
  const style = new CSSStyleDeclaration([]);
  style.setProperty('--foo', 'bar;baz');
  assert.strictEqual(style.getPropertyValue('--foo'), '', 'Should reject top-level semicolon');
});

test('CSSOM: Custom property validation with nested var() in first argument', () => {
  const style = new CSSStyleDeclaration([]);
  style.setProperty('--foo', 'var(var(--bar))');
  assert.strictEqual(style.getPropertyValue('--foo'), 'var(var(--bar))', 'Should allow nested var() in first argument');
});

test('CSSOM: @property rules register/unregister in PropertyRegistry', () => {
  PropertyRegistry.clear();

  const css = '@property --my-registered-prop { syntax: "<length>"; inherits: false; initial-value: 10px; }';
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  
  const def = PropertyRegistry.get('--my-registered-prop');
  assert.ok(def, 'Should be registered');
  assert.strictEqual(def.syntax, '<length>');
  assert.strictEqual(def.inherits, false);
  assert.strictEqual(def.initialValue, '10px');

  sheet.replaceSync('div { color: red; }');
  assert.strictEqual(PropertyRegistry.get('--my-registered-prop'), undefined, 'Should be unregistered after replaceSync');
  
  sheet.insertRule('@property --my-registered-prop { syntax: "<color>"; inherits: true; initial-value: blue; }', 0);
  const def2 = PropertyRegistry.get('--my-registered-prop');
  assert.ok(def2, 'Should be registered via insertRule');
  assert.strictEqual(def2.syntax, '<color>');
  assert.strictEqual(def2.inherits, true);
  assert.strictEqual(def2.initialValue, 'blue');

  sheet.deleteRule(0);
  assert.strictEqual(PropertyRegistry.get('--my-registered-prop'), undefined, 'Should be unregistered after deleteRule');
});

test('CSSOM: Registered property resolution and syntax validation', () => {
  PropertyRegistry.clear();

  // Register --my-color as <color> with initial-value blue
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('@property --my-color { syntax: "<color>"; inherits: false; initial-value: blue; }');

  sheet.insertRule('div { --foo: var(--my-color); color: var(--my-color); }', 1);
  const styleRule = sheet.cssRules[1] as unknown as CSSStyleRule;

  // 1. No local value: resolves to initial-value 'blue'
  assert.strictEqual(Parser.resolveVariables(styleRule.style, 'color'), 'blue');

  // 2. Valid local value 'red': resolves to 'red'
  styleRule.style.setProperty('--my-color', 'red');
  assert.strictEqual(Parser.resolveVariables(styleRule.style, 'color'), 'red');

  // 3. Invalid local value '20px' (violates <color>): resolves to initial-value 'blue'
  styleRule.style.setProperty('--my-color', '20px');
  assert.strictEqual(Parser.resolveVariables(styleRule.style, 'color'), 'blue');

  // 4. Invalid local value with var() fallback: resolves to initial-value, NOT var() fallback
  styleRule.style.setProperty('color', 'var(--my-color, green)');
  assert.strictEqual(Parser.resolveVariables(styleRule.style, 'color'), 'blue');
});

test('CSSOM: Cycle tracking and boundary fallback logic', () => {
  PropertyRegistry.clear();
  const sheet = new CSSStyleSheet();
  sheet.insertRule('div {}', 0);
  const rule = sheet.cssRules[0] as unknown as CSSStyleRule;

  // Case A: Simple self-reference (--a: var(--a, 10px)) -> invalid, NOT 10px
  rule.style.setProperty('--a', 'var(--a, 10px)');
  assert.strictEqual(Parser.resolveVariables(rule.style, '--a'), '');

  // Case B: Direct cycle (--a: var(--b, 10px); --b: var(--a)) -> invalid, NOT 10px
  rule.style.setProperty('--a', 'var(--b, 10px)');
  rule.style.setProperty('--b', 'var(--a)');
  assert.strictEqual(Parser.resolveVariables(rule.style, '--a'), '');
  assert.strictEqual(Parser.resolveVariables(rule.style, '--b'), '');

  // Case C: Cycle outside reference (--a: var(--b, 10px); --b: var(--c); --c: var(--b))
  // --b and --c are cyclic (invalid), but --a is outside, so it should use fallback 10px!
  rule.style.setProperty('--a', 'var(--b, 10px)');
  rule.style.setProperty('--b', 'var(--c)');
  rule.style.setProperty('--c', 'var(--b)');
  assert.strictEqual(Parser.resolveVariables(rule.style, '--a').trim(), '10px');
});


