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

// Barrel export for backwards compatibility
export * from './typed-om/index.ts';
export type { CSSUnit } from './data/gen/units.ts';
export type { CSSNumericType } from './typed-om/numeric/CSSNumericType.ts';
export type { CSSMatrixComponentOptions } from './typed-om/transform/transform-components.ts';
export type { StyleReadOnlyLike } from './typed-om/style-map/StylePropertyMapReadOnly.ts';
export type { StyleLike } from './typed-om/style-map/StylePropertyMap.ts';
