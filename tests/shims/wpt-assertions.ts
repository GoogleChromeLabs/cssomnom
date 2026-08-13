/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import assert from 'node:assert';

export class HarnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HarnessError';
  }
}

export class AssertionErrorProxy extends assert.AssertionError {
  constructor(messageOrOptions: string | assert.AssertionErrorOptions) {
    if (typeof messageOrOptions === 'string') {
      super({ message: messageOrOptions });
    } else {
      super(messageOrOptions);
    }
  }
}

export class OptionalFeatureUnsupportedError extends assert.AssertionError {
  constructor(message: string) {
    super({ message });
    this.name = 'OptionalFeatureUnsupportedError';
  }
}

export function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as Record<string, unknown>).message);
  }
  return String(err);
}

export function code_unit_str(char: string): string {
  return 'U+' + char.charCodeAt(0).toString(16);
}

export function sanitize_unpaired_surrogates(str: string): string {
  return str.replace(
    /([\ud800-\udbff]+)(?![\udc00-\udfff])|(^|[^\ud800-\udbff])([\udc00-\udfff]+)/g,
    (_, low, prefix, high) => {
      let output = prefix || '';
      const string = low || high;
      for (let i = 0; i < string.length; i++) {
        output += code_unit_str(string[i]);
      }
      return output;
    }
  );
}

export function get_test_name(func: Function, name: string | undefined, defaultName: string, tests: Array<{ name: string }>): string {
  if (name) {
    return name;
  }
  if (func) {
    const func_code = func.toString().trim();
    const arrow = func_code.match(/^\(\)\s*=>\s*(?:{(.*)}\s*|(.*))$/s);
    if (arrow && !/[\n\r\u2028\u2029]/.test(func_code)) {
      const body = (arrow[1] !== undefined ? arrow[1] : arrow[2]).trim();
      const trimmed = body.replace(/^([^;]*)(;\s*)+$/, '$1');
      if (trimmed) {
        return trimmed;
      }
    }
  }
  const count = tests.filter(t => t.name.startsWith(defaultName)).length;
  return `${defaultName}-${count}`;
}

const CODENAME_NAME_MAP: Record<string, string> = {
  INDEX_SIZE_ERR: 'IndexSizeError',
  HIERARCHY_REQUEST_ERR: 'HierarchyRequestError',
  WRONG_DOCUMENT_ERR: 'WrongDocumentError',
  INVALID_CHARACTER_ERR: 'InvalidCharacterError',
  NO_MODIFICATION_ALLOWED_ERR: 'NoModificationAllowedError',
  NOT_FOUND_ERR: 'NotFoundError',
  NOT_SUPPORTED_ERR: 'NotSupportedError',
  INUSE_ATTRIBUTE_ERR: 'InUseAttributeError',
  INVALID_STATE_ERR: 'InvalidStateError',
  SYNTAX_ERR: 'SyntaxError',
  INVALID_MODIFICATION_ERR: 'InvalidModificationError',
  NAMESPACE_ERR: 'NamespaceError',
  INVALID_ACCESS_ERR: 'InvalidAccessError',
  TYPE_MISMATCH_ERR: 'TypeMismatchError',
  SECURITY_ERR: 'SecurityError',
  NETWORK_ERR: 'NetworkError',
  ABORT_ERR: 'AbortError',
  URL_MISMATCH_ERR: 'URLMismatchError',
  TIMEOUT_ERR: 'TimeoutError',
  INVALID_NODE_TYPE_ERR: 'InvalidNodeTypeError',
  DATA_CLONE_ERR: 'DataCloneError'
};

const NAME_CODE_MAP: Record<string, number> = {
  IndexSizeError: 1,
  HierarchyRequestError: 3,
  WrongDocumentError: 4,
  InvalidCharacterError: 5,
  NoModificationAllowedError: 7,
  NotFoundError: 8,
  NotSupportedError: 9,
  InUseAttributeError: 10,
  InvalidStateError: 11,
  SyntaxError: 12,
  InvalidModificationError: 13,
  NamespaceError: 14,
  InvalidAccessError: 15,
  TypeMismatchError: 17,
  SecurityError: 18,
  NetworkError: 19,
  AbortError: 20,
  URLMismatchError: 21,
  TimeoutError: 23,
  InvalidNodeTypeError: 24,
  DataCloneError: 25,
  EncodingError: 0,
  NotReadableError: 0,
  UnknownError: 0,
  ConstraintError: 0,
  DataError: 0,
  TransactionInactiveError: 0,
  ReadOnlyError: 0,
  VersionError: 0,
  OperationError: 0,
  NotAllowedError: 0,
  OptOutError: 0
};

const CODE_NAME_MAP: Record<number, string> = {};
for (const [k, v] of Object.entries(NAME_CODE_MAP)) {
  if (v > 0) CODE_NAME_MAP[v] = k;
}

export const WPT_ASSERTIONS = {
  assert_equals(actual: unknown, expected: unknown, description?: string): void {
    assert.strictEqual(actual, expected, description ?? '');
  },

  assert_not_equals(actual: unknown, expected: unknown, message?: string): void {
    assert.notStrictEqual(actual, expected, message ?? '');
  },

  assert_true(actual: unknown, description?: string): void {
    assert.strictEqual(actual, true, description ?? '');
  },

  assert_false(actual: unknown, description?: string): void {
    assert.strictEqual(actual, false, description ?? '');
  },

  assert_approx_equals(actual: unknown, expected: unknown, epsilon: number, description?: string): void {
    assert.ok(Math.abs(Number(actual) - Number(expected)) <= epsilon, `${description || ''}: expected ${expected} +/- ${epsilon}, got ${actual}`);
  },

  assert_less_than(actual: unknown, expected: unknown, description?: string): void {
    assert.ok(Number(actual) < Number(expected), `${description || ''}: expected ${actual} < ${expected}`);
  },

  assert_greater_than(actual: unknown, expected: unknown, description?: string): void {
    assert.ok(Number(actual) > Number(expected), `${description || ''}: expected ${actual} > ${expected}`);
  },

  assert_less_than_equal(actual: unknown, expected: unknown, description?: string): void {
    assert.ok(Number(actual) <= Number(expected), `${description || ''}: expected ${actual} <= ${expected}`);
  },

  assert_greater_than_equal(actual: unknown, expected: unknown, description?: string): void {
    assert.ok(Number(actual) >= Number(expected), `${description || ''}: expected ${actual} >= ${expected}`);
  },

  assert_in_array(actual: unknown, expected: unknown[], description?: string): void {
    assert.ok(expected.includes(actual), `${description || ''}: expected ${actual} to be in array ${JSON.stringify(expected)}`);
  },

  assert_array_approx_equals(actual: unknown, expected: unknown, epsilon: number, description?: string): void {
    const isArrayLike = (v: unknown): v is ArrayLike<unknown> => {
      return Array.isArray(v) || ArrayBuffer.isView(v);
    };
    if (isArrayLike(actual) && isArrayLike(expected)) {
      assert.strictEqual(actual.length, expected.length, description ?? '');
      for (let i = 0; i < actual.length; i++) {
        assert.ok(Math.abs(Number(actual[i]) - Number(expected[i])) <= epsilon, `${description || ''} (index ${i}): expected ${expected[i]} +/- ${epsilon}, got ${actual[i]}`);
      }
    } else {
      assert.fail('assert_array_approx_equals: expected arrays');
    }
  },

  assert_regexp_match(actual: string, regexp: RegExp, description?: string): void {
    if (!regexp.test(actual)) {
      throw new AssertionErrorProxy({
        message: `${description || 'assert_regexp_match'}: expected ${JSON.stringify(actual)} to match ${regexp}`,
        actual,
        expected: regexp
      });
    }
  },

  assert_throws_exactly(expected: unknown, func: () => void, description?: string): void {
    try {
      func();
      assert.fail(`${description || ''}: Expected to throw exception`);
    } catch (e: unknown) {
      assert.strictEqual(e, expected, description ?? '');
    }
  },

  assert_array_equals(actual: unknown[], expected: unknown[], message?: string): void {
    assert.strictEqual(actual.length, expected.length, `${message || 'Array length mismatch'}: expected ${expected.length} but got ${actual.length}`);
    for (let i = 0; i < actual.length; i++) {
      assert.strictEqual(actual[i], expected[i], `${message || 'Array element mismatch at index ' + i}: expected ${expected[i]} but got ${actual[i]}`);
    }
  },

  assert_object_equals(actual: unknown, expected: unknown, message?: string): void {
    assert.strictEqual(typeof actual, 'object', `${message || ''}: value is ${actual}, expected object`);
    assert.ok(actual !== null, `${message || ''}: value is null, expected object`);
    assert.strictEqual(typeof expected, 'object', `${message || ''}: expected is ${expected}, expected object`);
    assert.ok(expected !== null, `${message || ''}: expected is null, expected object`);

    const check_equal = (act: Record<string, unknown>, exp: Record<string, unknown>, stack: unknown[]) => {
      stack.push(act);
      for (const p in act) {
        assert.ok(Object.prototype.hasOwnProperty.call(exp, p), `${message || ''}: unexpected property ${p}`);
        const actVal = act[p];
        const expVal = exp[p];
        if (typeof actVal === 'object' && actVal !== null) {
          if (stack.indexOf(actVal) === -1) {
            check_equal(actVal as Record<string, unknown>, expVal as Record<string, unknown>, stack);
          }
        } else {
          assert.ok(Object.is(actVal, expVal), `${message || ''}: property ${p} expected ${expVal} got ${actVal}`);
        }
      }
      for (const p in exp) {
        assert.ok(Object.prototype.hasOwnProperty.call(act, p), `${message || ''}: expected property ${p} missing`);
      }
      stack.pop();
    };
    check_equal(actual as Record<string, unknown>, expected as Record<string, unknown>, []);
  },

  assert_class_string(object: unknown, class_name: string, message?: string): void {
    const actual = Object.prototype.toString.call(object);
    const expected = `[object ${class_name}]`;
    assert.strictEqual(actual, expected, message ?? '');
  },

  assert_own_property(object: unknown, property_name: string | symbol, description?: string): void {
    assert.ok(typeof object === 'object' && object !== null, `${description || ''}: target must be an object`);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(object, property_name), true, `${description || ''}: expected property ${String(property_name)} missing`);
  },

  assert_not_own_property(object: unknown, property_name: string | symbol, description?: string): void {
    assert.ok(typeof object === 'object' && object !== null, `${description || ''}: target must be an object`);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(object, property_name), false, `${description || ''}: unexpected property ${String(property_name)} is found on object`);
  },

  assert_inherits(object: unknown, property_name: string | symbol, description?: string): void {
    assert.ok((typeof object === 'object' && object !== null) || typeof object === 'function', `${description || ''}: provided value is not an object`);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(object, property_name), false, `${description || ''}: property ${String(property_name)} found on object expected in prototype chain`);
    assert.strictEqual(property_name in (object as Record<string | symbol, unknown>), true, `${description || ''}: property ${String(property_name)} not found in prototype chain`);
  },

  assert_idl_attribute(object: unknown, property_name: string | symbol, description?: string): void {
    assert.ok((typeof object === 'object' && object !== null) || typeof object === 'function', `${description || ''}: provided value is not an object`);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(object, property_name), false, `${description || ''}: property ${String(property_name)} found on object expected in prototype chain`);
    assert.strictEqual(property_name in (object as Record<string | symbol, unknown>), true, `${description || ''}: property ${String(property_name)} not found in prototype chain`);
  },

  assert_readonly(object: unknown, property_name: string | symbol, description?: string): void {
    assert.ok((typeof object === 'object' && object !== null) || typeof object === 'function', `${description || ''}: provided value is not an object`);
    assert.strictEqual(property_name in (object as Record<string | symbol, unknown>), true, `${description || ''}: property ${String(property_name)} not found`);
  },

  assert_unreached(message?: string): void {
    assert.fail(message || 'Reached unreachable code');
  },

  assert_implements(condition: unknown, description?: string): void {
    if (!condition) {
      throw new AssertionErrorProxy({ message: 'assert_implements: ' + (description || '') });
    }
  },

  assert_implements_optional(condition: unknown, description?: string): void {
    if (!condition) {
      throw new OptionalFeatureUnsupportedError(description || '');
    }
  },

  assert_throws_js(constructor: Function, func: () => void, description?: string): void {
    try {
      func();
      assert.fail(`${description || ''}: Expected to throw JS exception`);
    } catch (e: unknown) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.ok(e && typeof e === 'object', `${description || ''}: Thrown value is not an object`);
      const errObj = e as Record<string, unknown>;
      assert.ok(
        errObj.constructor === constructor || (errObj.constructor as Function | undefined)?.name === constructor.name,
        `${description || ''}: expected constructor ${constructor.name}, got ${(errObj.constructor as Function | undefined)?.name}`
      );
      assert.strictEqual(errObj.name, constructor.name, `${description || ''}: expected error name ${constructor.name}, got ${errObj.name}`);
    }
  },

  assert_throws_dom(errorName: string | number, func: () => void, description?: string): void {
    try {
      func();
      assert.fail(`Expected to throw DOMException ${errorName}`);
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'name' in e) {
        let expectedName = '';
        let expectedCode: number | undefined = undefined;

        if (typeof errorName === 'number') {
          if (errorName === 0) {
            throw new assert.AssertionError({ message: 'Test bug: ambiguous DOMException code 0 passed to assert_throws_dom()' });
          }
          if (errorName === 22) {
            throw new assert.AssertionError({ message: 'Test bug: QuotaExceededError needs to be tested for using assert_throws_quotaexceedederror()' });
          }
          if (!(errorName in CODE_NAME_MAP)) {
            throw new assert.AssertionError({ message: `Test bug: unrecognized DOMException code "${errorName}" passed to assert_throws_dom()` });
          }
          expectedName = CODE_NAME_MAP[errorName];
          expectedCode = errorName;
        } else {
          if (errorName === 'QuotaExceededError') {
            throw new assert.AssertionError({ message: 'Test bug: QuotaExceededError needs to be tested for using assert_throws_quotaexceedederror()' });
          }
          expectedName = CODENAME_NAME_MAP[errorName] || errorName;
          if (!(expectedName in NAME_CODE_MAP)) {
            throw new assert.AssertionError({ message: `Test bug: unrecognized DOMException code name or name "${errorName}" passed to assert_throws_dom()` });
          }
          expectedCode = NAME_CODE_MAP[expectedName];
        }

        const errObj = e as Record<string, unknown>;
        assert.strictEqual(errObj.name, expectedName, `${description || ''}: expected name ${expectedName}`);
        if (expectedCode !== undefined && expectedCode > 0) {
          assert.strictEqual(errObj.code, expectedCode, `${description || ''}: expected code ${expectedCode}`);
        }
        return;
      }
      throw e;
    }
  }
};
