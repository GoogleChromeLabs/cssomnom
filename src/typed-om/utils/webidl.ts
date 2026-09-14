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
// WebIDL § 3.7 #es-operations
// WebIDL § 3.6.3 #interface-prototype-object

/**
 * Ensures all regular prototype members (attributes and operations) on a WebIDL interface
 * prototype object are enumerable, matching WebIDL specification requirements.
 *
 * In ES6 class semantics, methods and accessors defined in the class body are created with
 * [[Enumerable]]: false. WebIDL requires:
 * - Regular attributes on interface prototype objects: { [[Get]]: G, [[Set]]: S, [[Enumerable]]: true, [[Configurable]]: true }
 * - Regular operations on interface prototype objects: { [[Value]]: F, [[Writable]]: true, [[Enumerable]]: true, [[Configurable]]: true }
 * - Constructor property: { [[Value]]: C, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true }
 * - Symbol-keyed properties (e.g. @@toStringTag, @@iterator, @@unscopables): retain their spec-mandated non-enumerable descriptor.
 *
 * This function is applied once at module definition time and avoids any per-property-access or runtime overhead.
 */
export function applyWebIDLPrototypeDescriptors(ctor: Function): void {
  const proto = ctor.prototype;
  if (!proto) return;

  const names = Object.getOwnPropertyNames(proto);
  for (const name of names) {
    if (name === 'constructor' || name.startsWith('_')) {
      continue;
    }
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (desc && !desc.enumerable) {
      Object.defineProperty(proto, name, {
        ...desc,
        enumerable: true
      });
    }
  }
}
