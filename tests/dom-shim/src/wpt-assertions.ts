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

export function format_value(val: unknown, seen?: unknown[]): string {
  if (!seen) {
    seen = [];
  }
  if (typeof val === 'object' && val !== null) {
    if (seen.includes(val)) {
      return '[...]';
    }
    seen.push(val);
  }
  if (Array.isArray(val)) {
    let output = '[';
    output += val.map(x => format_value(x, seen)).join(', ');
    return output + ']';
  }

  switch (typeof val) {
    case 'string':
      return JSON.stringify(val);
    case 'boolean':
    case 'undefined':
      return String(val);
    case 'number':
      if (val === 0 && 1 / val === -Infinity) {
        return '-0';
      }
      return String(val);
    case 'bigint':
      return String(val) + 'n';
    case 'symbol':
      return String(val);
    case 'function':
      return `function ${(val as Function).name || 'anonymous'}() { [native code] }`;
    case 'object':
      if (val === null) {
        return 'null';
      }
      if (val && typeof (val as { nodeType?: number }).nodeType === 'number') {
        const node = val as { nodeType: number; localName?: string; nodeName?: string; data?: string };
        if (node.nodeType === 1) {
          return `<${node.localName || node.nodeName || 'element'}>`;
        }
        if (node.nodeType === 3) {
          return `Text node "${node.data || ''}"`;
        }
        return `Node object of type ${node.nodeType}`;
      }
      try {
        return typeof val + ' "' + String(val) + '"';
      } catch (e) {
        return `[stringifying object threw ${String(e)}]`;
      }
    default:
      return String(val);
  }
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
    if (!Object.is(actual, expected)) {
      throw new AssertionErrorProxy({
        message: `${description ? description + ': ' : ''}expected ${format_value(expected)} but got ${format_value(actual)}`,
        actual: format_value(actual),
        expected: format_value(expected),
        operator: 'strictEqual'
      });
    }
  },

  assert_not_equals(actual: unknown, expected: unknown, message?: string): void {
    if (Object.is(actual, expected)) {
      throw new AssertionErrorProxy({
        message: `${message ? message + ': ' : ''}expected not ${format_value(expected)} but got ${format_value(actual)}`,
        actual: format_value(actual),
        expected: format_value(expected),
        operator: 'notStrictEqual'
      });
    }
  },

  assert_true(actual: unknown, description?: string): void {
    if (actual !== true) {
      throw new AssertionErrorProxy({
        message: `${description ? description + ': ' : ''}expected true but got ${format_value(actual)}`,
        actual: format_value(actual),
        expected: 'true',
        operator: 'strictEqual'
      });
    }
  },

  assert_false(actual: unknown, description?: string): void {
    if (actual !== false) {
      throw new AssertionErrorProxy({
        message: `${description ? description + ': ' : ''}expected false but got ${format_value(actual)}`,
        actual: format_value(actual),
        expected: 'false',
        operator: 'strictEqual'
      });
    }
  },

  assert_approx_equals(actual: unknown, expected: unknown, epsilon: number, description?: string): void {
    assert.strictEqual(typeof actual, 'number', `${description || ''}: expected a number but got a ${typeof actual}`);
    if (Number.isFinite(actual as number) || Number.isFinite(Number(expected))) {
      assert.ok(
        Math.abs((actual as number) - Number(expected)) <= epsilon,
        `${description || ''}: expected ${expected} +/- ${epsilon} but got ${actual}`
      );
    } else {
      WPT_ASSERTIONS.assert_equals(actual, expected, description);
    }
  },

  assert_less_than(actual: unknown, expected: unknown, description?: string): void {
    assert.ok(typeof actual === 'number' || typeof actual === 'bigint', `${description || ''}: expected a number or bigint but got a ${typeof actual}`);
    assert.strictEqual(typeof actual, typeof expected, `${description || ''}: expected a ${typeof expected} but got a ${typeof actual}`);
    assert.ok((actual as number) < (expected as number), `${description || ''}: expected a number less than ${expected} but got ${actual}`);
  },

  assert_greater_than(actual: unknown, expected: unknown, description?: string): void {
    assert.ok(typeof actual === 'number' || typeof actual === 'bigint', `${description || ''}: expected a number or bigint but got a ${typeof actual}`);
    assert.strictEqual(typeof actual, typeof expected, `${description || ''}: expected a ${typeof expected} but got a ${typeof actual}`);
    assert.ok((actual as number) > (expected as number), `${description || ''}: expected a number greater than ${expected} but got ${actual}`);
  },

  assert_between_exclusive(actual: unknown, lower: unknown, upper: unknown, description?: string): void {
    assert.strictEqual(typeof lower, typeof upper, `${description || ''}: expected lower (${typeof lower}) and upper (${typeof upper}) types to match (test error)`);
    assert.ok(typeof actual === 'number' || typeof actual === 'bigint', `${description || ''}: expected a number or bigint but got a ${typeof actual}`);
    assert.strictEqual(typeof actual, typeof lower, `${description || ''}: expected a ${typeof lower} but got a ${typeof actual}`);
    assert.ok((actual as number) > (lower as number) && (actual as number) < (upper as number), `${description || ''}: expected a number greater than ${lower} and less than ${upper} but got ${actual}`);
  },

  assert_less_than_equal(actual: unknown, expected: unknown, description?: string): void {
    assert.ok(typeof actual === 'number' || typeof actual === 'bigint', `${description || ''}: expected a number or bigint but got a ${typeof actual}`);
    assert.strictEqual(typeof actual, typeof expected, `${description || ''}: expected a ${typeof expected} but got a ${typeof actual}`);
    assert.ok((actual as number) <= (expected as number), `${description || ''}: expected a number less than or equal to ${expected} but got ${actual}`);
  },

  assert_greater_than_equal(actual: unknown, expected: unknown, description?: string): void {
    assert.ok(typeof actual === 'number' || typeof actual === 'bigint', `${description || ''}: expected a number or bigint but got a ${typeof actual}`);
    assert.strictEqual(typeof actual, typeof expected, `${description || ''}: expected a ${typeof expected} but got a ${typeof actual}`);
    assert.ok((actual as number) >= (expected as number), `${description || ''}: expected a number greater than or equal to ${expected} but got ${actual}`);
  },

  assert_between_inclusive(actual: unknown, lower: unknown, upper: unknown, description?: string): void {
    assert.strictEqual(typeof lower, typeof upper, `${description || ''}: expected lower (${typeof lower}) and upper (${typeof upper}) types to match (test error)`);
    assert.ok(typeof actual === 'number' || typeof actual === 'bigint', `${description || ''}: expected a number or bigint but got a ${typeof actual}`);
    assert.strictEqual(typeof actual, typeof lower, `${description || ''}: expected a ${typeof lower} but got a ${typeof actual}`);
    assert.ok((actual as number) >= (lower as number) && (actual as number) <= (upper as number), `${description || ''}: expected a number greater than or equal to ${lower} and less than or equal to ${upper} but got ${actual}`);
  },

  assert_in_array(actual: unknown, expected: unknown[], description?: string): void {
    assert.ok(Array.isArray(expected), `${description || ''}: expected must be an array`);
    assert.ok(expected.indexOf(actual) !== -1, `${description || ''}: value ${actual} not in array ${JSON.stringify(expected)}`);
  },

  assert_array_approx_equals(actual: unknown, expected: unknown, epsilon: number, description?: string): void {
    const isArrayLike = (v: unknown): v is ArrayLike<unknown> => {
      return typeof v === 'object' && v !== null && 'length' in v;
    };
    if (isArrayLike(actual) && isArrayLike(expected)) {
      assert.strictEqual(actual.length, expected.length, description ?? '');
      for (let i = 0; i < actual.length; i++) {
        const actHas: boolean = Object.prototype.hasOwnProperty.call(actual, i);
        const expHas: boolean = Object.prototype.hasOwnProperty.call(expected, i);
        assert.strictEqual(actHas, expHas, `${description || ''}: property ${i}, property expected to be ${expHas ? 'present' : 'missing'} but was ${actHas ? 'present' : 'missing'}`);
        assert.strictEqual(typeof actual[i], 'number', `${description || ''}: property ${i}, expected a number but got a ${typeof actual[i]}`);
        assert.ok(Math.abs((actual[i] as number) - (expected[i] as number)) <= epsilon, `${description || ''} (index ${i}): expected ${expected[i]} +/- ${epsilon}, got ${actual[i]}`);
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
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      if (!Object.is(e, expected)) {
        throw new AssertionErrorProxy({
          message: `${description ? description + ': ' : ''}expected ${format_value(expected)} but got ${format_value(e)}`,
          actual: format_value(e),
          expected: format_value(expected),
          operator: 'strictEqual'
        });
      }
    }
  },

  assert_array_equals(actual: unknown, expected: unknown, message?: string): void {
    assert.ok(typeof actual === 'object' && actual !== null && 'length' in actual, `${message || ''}: value is ${actual}, expected array`);
    assert.ok(typeof expected === 'object' && expected !== null && 'length' in expected, `${message || ''}: expected is ${expected}, expected array`);

    const act = actual as ArrayLike<unknown>;
    const exp = expected as ArrayLike<unknown>;

    if (act.length !== exp.length) {
      throw new AssertionErrorProxy({
        message: `${message || 'Array length mismatch'}: expected ${exp.length} but got ${act.length}`,
        actual: String(act.length),
        expected: String(exp.length),
        operator: 'strictEqual'
      });
    }
    for (let i = 0; i < act.length; i++) {
      const actHas = Object.prototype.hasOwnProperty.call(act, i);
      const expHas = Object.prototype.hasOwnProperty.call(exp, i);
      if (actHas !== expHas) {
        throw new AssertionErrorProxy({
          message: `${message || 'Array element missing at index ' + i}: expected property ${i} to be ${expHas ? 'present' : 'missing'} but was ${actHas ? 'present' : 'missing'}`,
          actual: actHas ? 'present' : 'missing',
          expected: expHas ? 'present' : 'missing',
          operator: 'strictEqual'
        });
      }
      if (!Object.is(act[i], exp[i])) {
        throw new AssertionErrorProxy({
          message: `${message || 'Array element mismatch at index ' + i}: expected ${format_value(exp[i])} but got ${format_value(act[i])}`,
          actual: format_value(act[i]),
          expected: format_value(exp[i]),
          operator: 'strictEqual'
        });
      }
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
    assert.ok((typeof object === 'object' && object !== null) || typeof object === 'function', `${description || ''}: target must be an object`);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(object, property_name), true, `${description || ''}: expected property ${String(property_name)} missing`);
  },

  assert_not_own_property(object: unknown, property_name: string | symbol, description?: string): void {
    assert.ok((typeof object === 'object' && object !== null) || typeof object === 'function', `${description || ''}: target must be an object`);
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

    let cur: unknown = object;
    let desc: PropertyDescriptor | undefined;
    while (cur && (desc = Object.getOwnPropertyDescriptor(cur, property_name)) === undefined) {
      cur = Object.getPrototypeOf(cur);
    }
    assert.ok(desc !== undefined, `${description || ''}: could not find a descriptor for property ${String(property_name)}`);

    if (Object.prototype.hasOwnProperty.call(desc, 'value')) {
      // Data property descriptor
      assert.strictEqual(desc.writable, false, `${description || ''}: descriptor [[Writable]] expected false got ${desc.writable}`);
    } else if (Object.prototype.hasOwnProperty.call(desc, 'get') || Object.prototype.hasOwnProperty.call(desc, 'set')) {
      // Accessor property descriptor
      assert.strictEqual(desc.set, undefined, `${description || ''}: property ${String(property_name)} is an accessor property with a [[Set]] attribute, cannot test readonly-ness`);
    } else {
      assert.fail(`${description || ''}: Object.getOwnPropertyDescriptor must return a fully populated property descriptor`);
    }
  },

  assert_unreached(message?: string): void {
    assert.fail(message || 'Reached unreachable code');
  },

  assert_any(
    assert_func: Function,
    actual: unknown,
    expected_array: unknown[],
    ...args: unknown[]
  ): void {
    const errors: string[] = [];
    let passed = false;
    for (const expected of expected_array) {
      try {
        assert_func(actual, expected, ...args);
        passed = true;
        break;
      } catch (e: unknown) {
        errors.push(messageOf(e));
      }
    }
    if (!passed) {
      throw new AssertionErrorProxy({
        message: errors.join('\n\n'),
        actual: format_value(actual),
        expected: format_value(expected_array),
        operator: 'assert_any'
      });
    }
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
    assert.strictEqual(typeof constructor, 'function', `${description || ''}: ${constructor} is not a constructor`);
    let obj: unknown = constructor;
    while (obj) {
      if (typeof obj === 'function' && (obj as Function).name === 'Error') {
        break;
      }
      obj = Object.getPrototypeOf(obj);
    }
    assert.ok(obj !== null, `${description || ''}: ${constructor.name} is not an Error subtype`);

    try {
      func();
      assert.fail(`${description || ''}: Expected to throw JS exception`);
    } catch (e: unknown) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.ok(e && typeof e === 'object', `${description || ''}: Thrown value is not an object`);
      const errObj = e as Record<string, unknown>;
      const matchConstructor =
        errObj.constructor === constructor ||
        (errObj.constructor as Function | undefined)?.name === constructor.name;
      assert.ok(
        matchConstructor,
        `${description || ''}: expected constructor ${constructor.name}, got ${(errObj.constructor as Function | undefined)?.name}`
      );
      assert.strictEqual(errObj.name, constructor.name, `${description || ''}: expected error name ${constructor.name}, got ${errObj.name}`);
    }
  },

  assert_throws_dom(
    type: string | number,
    funcOrConstructor: unknown,
    descriptionOrFunc?: unknown,
    maybeDescription?: string
  ): void {
    let constructor: unknown;
    let func: () => void;
    let description: string | undefined;

    if (typeof funcOrConstructor === 'function' && funcOrConstructor.name === 'DOMException') {
      constructor = funcOrConstructor;
      func = descriptionOrFunc as () => void;
      description = maybeDescription;
    } else {
      constructor =
        (typeof globalThis !== 'undefined' && (globalThis as unknown as { DOMException?: unknown }).DOMException) ||
        (typeof DOMException !== 'undefined' ? DOMException : undefined);
      func = funcOrConstructor as () => void;
      description = descriptionOrFunc as string | undefined;
      assert.strictEqual(maybeDescription, undefined, 'Too many args passed to no-constructor version of assert_throws_dom');
    }

    try {
      func();
      assert.fail(`${description || ''}: Expected to throw DOMException ${type}`);
    } catch (e: unknown) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.ok(typeof e === 'object' && e !== null, `${description || ''}: Thrown value is not an object`);
      assert.ok(typeof type === 'number' || typeof type === 'string', `${description || ''}: ${type} is not a number or string`);

      let expectedName = '';
      let expectedCode: number | undefined = undefined;

      if (typeof type === 'number') {
        if (type === 0) {
          throw new assert.AssertionError({ message: 'Test bug: ambiguous DOMException code 0 passed to assert_throws_dom()' });
        }
        if (type === 22) {
          throw new assert.AssertionError({ message: 'Test bug: QuotaExceededError needs to be tested for using assert_throws_quotaexceedederror()' });
        }
        if (!(type in CODE_NAME_MAP)) {
          throw new assert.AssertionError({ message: `Test bug: unrecognized DOMException code "${type}" passed to assert_throws_dom()` });
        }
        expectedName = CODE_NAME_MAP[type];
        expectedCode = type;
      } else {
        if (type === 'QuotaExceededError') {
          throw new assert.AssertionError({ message: 'Test bug: QuotaExceededError needs to be tested for using assert_throws_quotaexceedederror()' });
        }
        expectedName = CODENAME_NAME_MAP[type] || type;
        if (!(expectedName in NAME_CODE_MAP)) {
          throw new assert.AssertionError({ message: `Test bug: unrecognized DOMException code name or name "${type}" passed to assert_throws_dom()` });
        }
        expectedCode = NAME_CODE_MAP[expectedName];
      }

      const errObj = e as Record<string, unknown>;
      const requiredProps: Record<string, unknown> = {};
      if (expectedCode !== undefined) {
        requiredProps.code = expectedCode;
      }
      if (
        expectedCode === 0 ||
        ('name' in errObj &&
          typeof errObj.name === 'string' &&
          errObj.name !== errObj.name.toUpperCase() &&
          errObj.name !== 'DOMException')
      ) {
        requiredProps.name = expectedName;
      }

      for (const [prop, expectedVal] of Object.entries(requiredProps)) {
        assert.ok(
          prop in errObj && errObj[prop] == expectedVal,
          `${description || ''}: expected property ${prop} to be ${expectedVal}, got ${errObj[prop]}`
        );
      }

      if (constructor) {
        // Upstream testharness.js (submodules/web-platform-tests/resources/testharness.js:2441 in assert_throws_dom_impl)
        // performs a strict identity check: assert(e.constructor === constructor, ...).
        //
        // Deviation: This is a deliberate, more-lenient-than-upstream cross-realm escape hatch.
        // Our CSSOM and DOM implementation objects live in the host Node.js realm while tests execute in a VM context
        // sandbox with a distinct DOMException constructor, so strict identity fails universally across realm boundaries.
        //
        // Cost / Trade-off: The upstream assertion's sole purpose is detecting wrong-global throws ("threw an exception
        // from the wrong global"). By falling back to matching constructor name (errObj.constructor.name === 'DOMException'),
        // our test harness accepts a DOMException originating from any global/realm, which means that specific check can
        // never fail in this harness.
        const ctorMatches =
          errObj.constructor === constructor ||
          ((errObj.constructor as Function | undefined)?.name === 'DOMException' &&
            (constructor as Function).name === 'DOMException');
        assert.ok(ctorMatches, `${description || ''}: threw an exception from the wrong global`);
      }
    }
  },

  assert_throws_quotaexceedederror(
    funcOrConstructor: unknown,
    requestedOrFunc?: unknown,
    quotaOrRequested?: unknown,
    descriptionOrQuota?: unknown,
    maybeDescription?: string
  ): void {
    let constructor: unknown;
    let func: () => void;
    let requested: unknown;
    let quota: unknown;
    let description: string | undefined;

    if (
      typeof funcOrConstructor === 'function' &&
      (funcOrConstructor.name === 'QuotaExceededError' || funcOrConstructor.name === 'DOMException')
    ) {
      constructor = funcOrConstructor;
      func = requestedOrFunc as () => void;
      requested = quotaOrRequested;
      quota = descriptionOrQuota;
      description = maybeDescription;
    } else {
      constructor =
        (typeof globalThis !== 'undefined' &&
          ((globalThis as unknown as Record<string, unknown>).QuotaExceededError ||
            (globalThis as unknown as { DOMException?: unknown }).DOMException)) ||
        (typeof DOMException !== 'undefined' ? DOMException : undefined);
      func = funcOrConstructor as () => void;
      requested = requestedOrFunc;
      quota = quotaOrRequested;
      description = descriptionOrQuota as string | undefined;
      assert.strictEqual(maybeDescription, undefined, 'Too many args passed to no-constructor version of assert_throws_quotaexceedederror');
    }

    try {
      func();
      assert.fail(`${description || ''}: Expected to throw QuotaExceededError`);
    } catch (e: unknown) {
      if (e instanceof assert.AssertionError) {
        throw e;
      }
      assert.ok(typeof e === 'object' && e !== null, `${description || ''}: Thrown value is not an object`);
      const errObj = e as Record<string, unknown>;

      assert.ok(
        requested === undefined || requested === null || typeof requested === 'number' || typeof requested === 'function',
        `${description || ''}: ${requested} is not null, a number, or a function`
      );
      assert.ok(
        quota === undefined || quota === null || typeof quota === 'number' || typeof quota === 'function',
        `${description || ''}: ${quota} is not null or a number`
      );

      const requiredProps: Record<string, unknown> = {
        code: 22,
        name: 'QuotaExceededError'
      };
      if (requested !== undefined && typeof requested !== 'function') {
        requiredProps.requested = requested;
      }
      if (quota !== undefined && typeof quota !== 'function') {
        requiredProps.quota = quota;
      }

      for (const [prop, expectedVal] of Object.entries(requiredProps)) {
        assert.ok(
          prop in errObj && errObj[prop] == expectedVal,
          `${description || ''}: property ${prop} is equal to ${errObj[prop]}, expected ${expectedVal}`
        );
      }

      if (typeof requested === 'function') {
        assert.ok(requested(errObj.requested), `${description || ''}: requested value did not pass requested predicate`);
      }
      if (typeof quota === 'function') {
        assert.ok(quota(errObj.quota), `${description || ''}: quota value did not pass quota predicate`);
      }

      if (constructor) {
        const ctorMatches =
          errObj.constructor === constructor ||
          ((errObj.constructor as Function | undefined)?.name === 'QuotaExceededError' ||
            (errObj.constructor as Function | undefined)?.name === 'DOMException');
        assert.ok(ctorMatches, `${description || ''}: threw an exception from the wrong global`);
      }
    }
  }
};
