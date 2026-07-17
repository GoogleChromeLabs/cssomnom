/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { PropertyRegistry, type PropertyDefinition } from '../src/PropertyRegistry.ts';
import { Parser } from '../src/parser.ts';

const fixturesPath = new URL('./fixtures/properties-values-api.json', import.meta.url);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

interface WptTestCase {
  name?: string;
  syntax?: string;
  inherits?: boolean | string;
  initialValue?: string;
  'initial-value'?: string;
  input?: string;
  expected: {
    valid: boolean;
    error?: string;
  };
}

function getDummyInitialValue(syntax: string): string | undefined {
  if (!syntax || syntax === '*') return 'foo';
  const firstPart = syntax.split('|')[0].trim();
  const component = firstPart.replace(/[+#]/g, '').trim();
  if (component.startsWith('<') && component.endsWith('>')) {
    const typeName = component.slice(1, -1).toLowerCase();
    switch (typeName) {
      case 'color': return 'red';
      case 'length': return '0px';
      case 'percentage': return '0%';
      case 'length-percentage': return '0px';
      case 'number': return '0';
      case 'integer': return '0';
      case 'angle': return '0deg';
      case 'time': return '0s';
      case 'resolution': return '0dppx';
      case 'transform-function': return 'scale(1)';
      case 'transform-list': return 'scale(1)';
      case 'image': return 'url(http://a/)';
      case 'url': return 'url(http://a/)';
      case 'string': return '"a"';
      case 'custom-ident': return 'banana';
      default: return undefined;
    }
  }
  return component; // Literal ident
}

function cleanErrorName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return name.replace(/['"]/g, '');
}

describe('WPT Houdini Property Validation', () => {
  before(() => {
    PropertyRegistry.clear();
  });

  after(() => {
    PropertyRegistry.clear();
  });

  const atPropertyCases = (fixtures.atPropertyRules as WptTestCase[] || []).filter((c) => !c.input);
  const registerPropertyCases = fixtures.registerProperty as WptTestCase[] || [];
  const cases = [...atPropertyCases, ...registerPropertyCases];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    
    const rawName = c.name;
    const isTypeError = cleanErrorName(c.expected.error) === 'TypeError';
    
    // Resolve expected valid state
    let expectedValid = c.expected.valid;
    
    // Resolve name
    let name: string | undefined = undefined;
    if (rawName === 'name' || rawName === 'name1' || rawName === 'name2') {
      name = `--test-prop-${i}`;
    } else if (rawName === '') {
      name = '';
      expectedValid = false; // Empty name must throw
    } else if (rawName !== undefined) {
      name = rawName;
    } else {
      // name is missing
      if (expectedValid) {
        name = `--test-prop-${i}`;
      } else {
        name = undefined;
      }
    }

    if (name && !Parser.isValidDashedIdent(name.toString())) {
      expectedValid = false;
    }

    // Resolve syntax
    const syntax = c.syntax === 'undefined' ? undefined : c.syntax;
    
    // Resolve inherits
    let inherits: boolean | string | undefined = undefined;
    if (c.inherits === 'true' || c.inherits === true) inherits = true;
    else if (c.inherits === 'false' || c.inherits === false) inherits = false;
    else if (c.inherits !== undefined) inherits = c.inherits;
    else {
      if (expectedValid) inherits = false;
      else inherits = undefined;
    }

    if (isTypeError && name !== undefined) {
      // If TypeError is expected and name is present, then inherits is the missing key
      inherits = undefined;
    }

    const rawInitialValue = c.initialValue !== undefined ? c.initialValue : c['initial-value'];
    let initialValue = rawInitialValue === 'undefined' ? undefined : rawInitialValue;

    // Generate dummy initial value if expected to be valid but not provided
    if (expectedValid && initialValue === undefined && syntax !== undefined && syntax !== '*') {
      initialValue = getDummyInitialValue(syntax);
    }

    test(`Validation case ${i}: name=${name === undefined ? 'undefined' : `"${name}"`}, syntax=${syntax === undefined ? 'undefined' : `"${syntax}"`}, inherits=${inherits}, initialValue=${initialValue === undefined ? 'undefined' : `"${initialValue}"`}`, () => {
      const runValidation = () => {
        // Construct definition with only defined fields matching PropertyDefinition interface
        const definition: Partial<PropertyDefinition> = {};
        if (name !== undefined) definition.name = name;
        if (syntax !== undefined) definition.syntax = syntax;
        if (inherits !== undefined) definition.inherits = inherits as boolean;
        if (initialValue !== undefined) definition.initialValue = initialValue;

        if (expectedValid && name !== undefined) {
          // Unregister existing JS registration to simulate clean state for success cases
          const nameStr = name.toString();
          const existing = PropertyRegistry.get(nameStr);
          if (existing) {
            PropertyRegistry.unregister(nameStr, 'js');
          }
        }

        PropertyRegistry.register(definition as PropertyDefinition);
      };

      if (expectedValid) {
        assert.doesNotThrow(runValidation, `Expected valid definition to pass validation`);
      } else {
        const expectedError = cleanErrorName(c.expected.error);
        assert.throws(runValidation, (err: unknown) => {
          if (expectedError === 'TypeError') {
            return err instanceof TypeError;
          }
          if (expectedError) {
            return err instanceof DOMException && err.name === expectedError;
          }
          return err instanceof TypeError || err instanceof DOMException;
        }, `Expected invalid definition to throw ${expectedError || 'validation error'}`);
      }
    });
  }
});
