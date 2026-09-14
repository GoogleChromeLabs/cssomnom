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

export interface WebIDLOptions {
  /** If true, wraps attribute accessors with brand checks (WebIDL § 3.6.1/3.6.2) */
  brandCheck?: boolean;
  /** If true, enforces minimum argument arity on operations (WebIDL § 3.7) */
  arityCheck?: boolean;
}

/**
 * Aligns regular prototype properties of a WebIDL interface object with specification requirements:
 * 1. Interface prototype members are { enumerable: true, configurable: true }.
 * 2. Attribute getters/setters perform brand checks, throwing TypeError when invoked on the prototype
 *    itself or on an incompatible receiver (WebIDL § 3.6.1, § 3.6.2).
 * 3. Operations are { writable: true, enumerable: true, configurable: true } and throw TypeError
 *    when invoked with fewer arguments than required (WebIDL § 3.7).
 */
export function applyWebIDLInterface(ctor: Function, options: WebIDLOptions = {}): void {
  const proto = ctor.prototype;
  if (!proto) return;

  const brandCheck = options.brandCheck ?? true;
  const arityCheck = options.arityCheck ?? true;

  const names = Object.getOwnPropertyNames(proto);
  for (const name of names) {
    if (name === 'constructor' || name === 'location' || name.startsWith('_')) {
      continue;
    }

    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc) continue;

    // WebIDL § 3.6 #es-attributes
    if (desc.get || desc.set) {
      const origGet = desc.get;
      const origSet = desc.set;

      let get = origGet;
      if (origGet && brandCheck) {
        get = function (this: unknown) {
          // WebIDL § 3.6.1 #es-attribute-getter:
          // If this value is not an ECMAScript object that implements the interface, throw TypeError.
          if (!this || this === proto || !(this instanceof ctor)) {
            throw new TypeError(
              `Failed to read the '${name}' property from '${ctor.name}': The provided value is not of type '${ctor.name}'.`
            );
          }
          return origGet.call(this);
        };
        Object.defineProperty(get, 'name', { value: `get ${name}`, configurable: true });
      }

      let set = origSet;
      if (origSet && brandCheck) {
        set = function (this: unknown, val: unknown) {
          // WebIDL § 3.6.2 #es-attribute-setter:
          // If this value is not an ECMAScript object that implements the interface, throw TypeError.
          if (!this || this === proto || !(this instanceof ctor)) {
            throw new TypeError(
              `Failed to set the '${name}' property on '${ctor.name}': The provided value is not of type '${ctor.name}'.`
            );
          }
          return origSet.call(this, val);
        };
        Object.defineProperty(set, 'name', { value: `set ${name}`, configurable: true });
      }

      Object.defineProperty(proto, name, {
        get,
        set: origSet ? set : undefined,
        enumerable: true,
        configurable: true
      });
      continue;
    }

    // WebIDL § 3.7 #es-operations
    if (typeof desc.value === 'function') {
      const origFn = desc.value;
      const minArgs = origFn.length;

      let fn = origFn;
      if (brandCheck || (arityCheck && minArgs > 0)) {
        fn = function (this: unknown, ...args: unknown[]) {
          // WebIDL § 3.7: If this value is not a platform object that implements interface, throw TypeError.
          if (brandCheck && (!this || this === proto || !(this instanceof ctor))) {
            const err = new TypeError(
              `Failed to execute '${name}' on '${ctor.name}': The provided value is not of type '${ctor.name}'.`
            );
            if (name === 'replace' && ctor.name === 'CSSStyleSheet') {
              return Promise.reject(err);
            }
            throw err;
          }
          // WebIDL § 3.7 #es-operations step 2:
          // If fewer arguments than required are passed, throw or reject with TypeError.
          if (arityCheck && arguments.length < minArgs) {
            const err = new TypeError(
              `Failed to execute '${name}' on '${ctor.name}': ${minArgs} argument required, but only ${arguments.length} present.`
            );
            if (name === 'replace' && ctor.name === 'CSSStyleSheet') {
              return Promise.reject(err);
            }
            throw err;
          }
          return origFn.apply(this, args);
        };
        Object.defineProperty(fn, 'name', { value: origFn.name, configurable: true });
        Object.defineProperty(fn, 'length', { value: minArgs, configurable: true });
      }

      Object.defineProperty(proto, name, {
        value: fn,
        writable: true,
        enumerable: true,
        configurable: true
      });
    }
  }
}

/**
 * Defines constants on an interface object and its prototype per WebIDL:
 * - WebIDL § 3.6.4 #es-constants: { [[Writable]]: false, [[Enumerable]]: true, [[Configurable]]: false }
 * - WebIDL § 3.6.5 #constants-on-interface-prototype-object: same attributes on prototype
 */
export function applyWebIDLConstants(ctor: Function, constants: Record<string, number>): void {
  for (const [name, val] of Object.entries(constants)) {
    Object.defineProperty(ctor, name, {
      value: val,
      writable: false,
      enumerable: true,
      configurable: false
    });
    if (ctor.prototype) {
      Object.defineProperty(ctor.prototype, name, {
        value: val,
        writable: false,
        enumerable: true,
        configurable: false
      });
    }
  }
}
