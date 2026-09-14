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

test('WPT_ASSERTIONS: assert_readonly checks descriptor writable and setter', () => {
  // Writable data property must FAIL (previously was TOO LENIENT and passed)
  const writableObj = { foo: 123 };
  assert.throws(() => {
    WPT_ASSERTIONS.assert_readonly(writableObj, 'foo');
  }, assert.AssertionError);

  // Accessor with a setter must FAIL (previously was TOO LENIENT and passed)
  const setterObj = {
    get bar() { return 1; },
    set bar(_v) {}
  };
  assert.throws(() => {
    WPT_ASSERTIONS.assert_readonly(setterObj, 'bar');
  }, assert.AssertionError);

  // Read-only data property must PASS
  const readonlyData = {};
  Object.defineProperty(readonlyData, 'foo', { value: 42, writable: false });
  WPT_ASSERTIONS.assert_readonly(readonlyData, 'foo');

  // Getter-only accessor must PASS
  const getterOnly = {
    get bar() { return 42; }
  };
  WPT_ASSERTIONS.assert_readonly(getterOnly, 'bar');

  // Inherited getter-only accessor must PASS
  const proto = {
    get inherited() { return 'yes'; }
  };
  const child = Object.create(proto);
  WPT_ASSERTIONS.assert_readonly(child, 'inherited');
});

test('WPT_ASSERTIONS: assert_throws_dom handles constructor overloads and error types', () => {
  // 4-arg overload with DOMException constructor
  WPT_ASSERTIONS.assert_throws_dom('SyntaxError', DOMException, () => {
    throw new DOMException('msg', 'SyntaxError');
  }, 'should support constructor as second argument');

  // Passing wrong constructor must fail
  class FakeDOMException extends Error {
    override name = 'SyntaxError';
    code = 12;
  }
  assert.throws(() => {
    WPT_ASSERTIONS.assert_throws_dom('SyntaxError', DOMException, () => {
      throw new FakeDOMException('msg');
    });
  }, assert.AssertionError);
});

test('WPT_ASSERTIONS: assert_throws_js validates error subtype', () => {
  class NotAnError {
    name = 'NotAnError';
  }
  assert.throws(() => {
    WPT_ASSERTIONS.assert_throws_js(NotAnError, () => {
      throw new NotAnError();
    });
  }, assert.AssertionError);
});

test('WPT_ASSERTIONS: numeric assertions strictly validate types without coercion', () => {
  // Strings and booleans must be rejected without coercion
  assert.throws(() => {
    WPT_ASSERTIONS.assert_less_than('5', 10);
  }, assert.AssertionError);

  assert.throws(() => {
    WPT_ASSERTIONS.assert_greater_than(true, 0);
  }, assert.AssertionError);

  assert.throws(() => {
    WPT_ASSERTIONS.assert_less_than_equal(5, '10');
  }, assert.AssertionError);

  assert.throws(() => {
    WPT_ASSERTIONS.assert_greater_than_equal('10', 5);
  }, assert.AssertionError);

  // Bigint and number mismatch must be rejected
  assert.throws(() => {
    WPT_ASSERTIONS.assert_less_than(5n, 10);
  }, assert.AssertionError);

  // Valid bigint comparisons work
  WPT_ASSERTIONS.assert_less_than(5n, 10n);
  WPT_ASSERTIONS.assert_greater_than(10n, 5n);
});

test('WPT_ASSERTIONS: assert_approx_equals handles infinities and validates number type', () => {
  // Infinities should pass
  WPT_ASSERTIONS.assert_approx_equals(Infinity, Infinity, 0.1);
  WPT_ASSERTIONS.assert_approx_equals(-Infinity, -Infinity, 0.1);
  assert.throws(() => {
    WPT_ASSERTIONS.assert_approx_equals(Infinity, -Infinity, 0.1);
  }, assert.AssertionError);

  // Non-numbers must be rejected
  assert.throws(() => {
    WPT_ASSERTIONS.assert_approx_equals('1.0', 1.0, 0.1);
  }, assert.AssertionError);
});

test('WPT_ASSERTIONS: assert_between_exclusive and assert_between_inclusive', () => {
  WPT_ASSERTIONS.assert_between_exclusive(5, 1, 10);
  assert.throws(() => {
    WPT_ASSERTIONS.assert_between_exclusive(1, 1, 10);
  }, assert.AssertionError);
  assert.throws(() => {
    WPT_ASSERTIONS.assert_between_exclusive(10, 1, 10);
  }, assert.AssertionError);

  WPT_ASSERTIONS.assert_between_inclusive(1, 1, 10);
  WPT_ASSERTIONS.assert_between_inclusive(10, 1, 10);
  WPT_ASSERTIONS.assert_between_inclusive(5, 1, 10);
  assert.throws(() => {
    WPT_ASSERTIONS.assert_between_inclusive(0, 1, 10);
  }, assert.AssertionError);
});

test('WPT_ASSERTIONS: assert_throws_quotaexceedederror', () => {
  const qErr = new DOMException('quota', 'QuotaExceededError');
  // @ts-expect-error mock quota props
  qErr.requested = 100;
  // @ts-expect-error mock quota props
  qErr.quota = 50;

  WPT_ASSERTIONS.assert_throws_quotaexceedederror(() => {
    throw qErr;
  }, 100, 50);

  // With predicate functions
  WPT_ASSERTIONS.assert_throws_quotaexceedederror(() => {
    throw qErr;
  }, (r: number) => r === 100, (q: number) => q === 50);

  // Overload with constructor
  WPT_ASSERTIONS.assert_throws_quotaexceedederror(DOMException, () => {
    throw qErr;
  }, 100, 50);
});

test('WPT_ASSERTIONS: assert_any', () => {
  WPT_ASSERTIONS.assert_any(WPT_ASSERTIONS.assert_equals, 'foo', ['bar', 'foo', 'baz']);
  assert.throws(() => {
    WPT_ASSERTIONS.assert_any(WPT_ASSERTIONS.assert_equals, 'nomatch', ['bar', 'foo', 'baz']);
  }, assert.AssertionError);
});

test('WPT_ASSERTIONS: assert_array_equals checks sparse vs non-sparse arrays', () => {
  const sparse: unknown[] = [];
  sparse.length = 1; // hole at index 0
  const nonSparse = [undefined];
  assert.throws(() => {
    WPT_ASSERTIONS.assert_array_equals(sparse, nonSparse);
  }, assert.AssertionError);
});

test('WPT_ASSERTIONS: assert_in_array uses indexOf semantics', () => {
  // Upstream: indexOf(NaN) returns -1, so assert_in_array(NaN, [NaN]) fails
  assert.throws(() => {
    WPT_ASSERTIONS.assert_in_array(NaN, [NaN]);
  }, assert.AssertionError);
});

