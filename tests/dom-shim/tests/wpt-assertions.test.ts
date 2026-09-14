/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WPT_ASSERTIONS,
  AssertionErrorProxy,
  OptionalFeatureUnsupportedError,
  HarnessError,
  sanitize_unpaired_surrogates,
  code_unit_str
} from '../src/index.ts';

test('WPT_ASSERTIONS: assert_equals, assert_not_equals, assert_true, assert_false', () => {
  WPT_ASSERTIONS.assert_equals('a', 'a');
  WPT_ASSERTIONS.assert_equals(123, 123);
  assert.throws(() => WPT_ASSERTIONS.assert_equals('a', 'b'), assert.AssertionError);

  WPT_ASSERTIONS.assert_not_equals('a', 'b');
  assert.throws(() => WPT_ASSERTIONS.assert_not_equals('a', 'a'), assert.AssertionError);

  WPT_ASSERTIONS.assert_true(true);
  assert.throws(() => WPT_ASSERTIONS.assert_true(false), assert.AssertionError);

  WPT_ASSERTIONS.assert_false(false);
  assert.throws(() => WPT_ASSERTIONS.assert_false(true), assert.AssertionError);
});

test('WPT_ASSERTIONS: assert_approx_equals and comparison assertions', () => {
  WPT_ASSERTIONS.assert_approx_equals(1.001, 1.002, 0.01);
  assert.throws(() => WPT_ASSERTIONS.assert_approx_equals(1.0, 1.5, 0.1), assert.AssertionError);

  WPT_ASSERTIONS.assert_less_than(5, 10);
  WPT_ASSERTIONS.assert_greater_than(10, 5);
  WPT_ASSERTIONS.assert_less_than_equal(5, 5);
  WPT_ASSERTIONS.assert_greater_than_equal(5, 5);
});

test('WPT_ASSERTIONS: assert_array_equals and assert_object_equals', () => {
  WPT_ASSERTIONS.assert_array_equals([1, 2, 3], [1, 2, 3]);
  assert.throws(() => WPT_ASSERTIONS.assert_array_equals([1, 2], [1, 3]), assert.AssertionError);

  WPT_ASSERTIONS.assert_object_equals({ a: 1, b: 'two' }, { a: 1, b: 'two' });
  assert.throws(() => WPT_ASSERTIONS.assert_object_equals({ a: 1 }, { a: 2 }), assert.AssertionError);
});

// Regression: WebIDL interface objects are functions, not plain objects. idlharness.js calls
// assert_own_property(Interface, "prototype") on every interface (idlharness.js #test_member_attribute,
// #test_member_operation), so rejecting `typeof target === 'function'` failed every interface check.
// Upstream testharness.js only does `object.hasOwnProperty(...)` with no typeof guard.
test('WPT_ASSERTIONS: assert_own_property accepts interface objects (functions) as targets', () => {
  class SomeInterface {}

  // The exact idlharness.js call shape that regressed.
  WPT_ASSERTIONS.assert_own_property(SomeInterface, 'prototype');
  WPT_ASSERTIONS.assert_not_own_property(SomeInterface, 'notAProperty');

  // A function missing the property must still fail, rather than passing vacuously.
  assert.throws(
    () => WPT_ASSERTIONS.assert_own_property(() => {}, 'prototype'),
    assert.AssertionError
  );

  // Plain objects keep working.
  WPT_ASSERTIONS.assert_own_property({ a: 1 }, 'a');
  WPT_ASSERTIONS.assert_not_own_property({ a: 1 }, 'b');

  // Inherited properties are not own properties.
  WPT_ASSERTIONS.assert_not_own_property({ a: 1 }, 'toString');

  // Non-objects are still rejected.
  for (const notAnObject of [null, undefined, 'str', 42]) {
    assert.throws(
      () => WPT_ASSERTIONS.assert_own_property(notAnObject, 'prototype'),
      assert.AssertionError
    );
    assert.throws(
      () => WPT_ASSERTIONS.assert_not_own_property(notAnObject, 'prototype'),
      assert.AssertionError
    );
  }
});

test('WPT_ASSERTIONS: assert_throws_js and assert_throws_dom', () => {
  // assert_throws_js
  WPT_ASSERTIONS.assert_throws_js(TypeError, () => {
    throw new TypeError('invalid type');
  });
  assert.throws(() => {
    WPT_ASSERTIONS.assert_throws_js(TypeError, () => {});
  }, assert.AssertionError);

  // assert_throws_dom with string name and number code
  WPT_ASSERTIONS.assert_throws_dom('SyntaxError', () => {
    throw new DOMException('Bad syntax', 'SyntaxError');
  });
  WPT_ASSERTIONS.assert_throws_dom('SYNTAX_ERR', () => {
    throw new DOMException('Bad syntax', 'SyntaxError');
  });
  WPT_ASSERTIONS.assert_throws_dom(12, () => {
    throw new DOMException('Bad syntax', 'SyntaxError');
  });

  assert.throws(() => {
    WPT_ASSERTIONS.assert_throws_dom('SyntaxError', () => {});
  }, assert.AssertionError);
});

test('WPT_ASSERTIONS: assert_regexp_match and string utilities', () => {
  WPT_ASSERTIONS.assert_regexp_match('hello world', /^hello/);
  assert.throws(() => {
    WPT_ASSERTIONS.assert_regexp_match('goodbye world', /^hello/);
  }, AssertionErrorProxy);

  assert.strictEqual(code_unit_str('A'), 'U+41');
  const clean = sanitize_unpaired_surrogates('test');
  assert.strictEqual(clean, 'test');

  // Test HarnessError and OptionalFeatureUnsupportedError
  const harnessErr = new HarnessError('harness failure');
  assert.strictEqual(harnessErr.name, 'HarnessError');

  WPT_ASSERTIONS.assert_implements(true, 'should pass');
  assert.throws(() => {
    WPT_ASSERTIONS.assert_implements(false, 'missing feature');
  }, AssertionErrorProxy);

  WPT_ASSERTIONS.assert_implements_optional(true, 'optional feature');
  assert.throws(() => {
    WPT_ASSERTIONS.assert_implements_optional(false, 'unsupported optional feature');
  }, OptionalFeatureUnsupportedError);
});
