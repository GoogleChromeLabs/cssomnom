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

/**
 * Safely access a constructor from globalThis without double casts.
 */
export function getGlobalConstructor<T = unknown>(name: string): T | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  const val = Reflect.get(globalThis, name);
  return typeof val === 'function' ? (val as T) : undefined;
}
