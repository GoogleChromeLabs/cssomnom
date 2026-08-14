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

import type { DOMElement } from '../matcher.ts';

export type { DOMElement };

export type Specificity = [number, number, number];

/**
 * Matched CSS declaration with full cascade metadata.
 * css-cascade-5 § 2 #filtering
 * css-cascade-5 § 6 #cascade-sort
 */
export interface MatchedDeclaration {
  name: string;
  value: string;
  important: boolean;
  isInline: boolean;
  layerOrder: number;
  specificity: Specificity;
  sourceOrder: number;
  raw?: string;
}

/**
 * Cascade origin and importance precedence levels.
 * css-cascade-5 § 6.1 #cascade-origin
 */
export const CascadeOrigin = {
  USER_AGENT: 0,
  USER: 10,
  AUTHOR_NORMAL_LAYERED: 10,
  AUTHOR_NORMAL_UNLAYERED: 20,
  INLINE_NORMAL: 30,
  AUTHOR_IMPORTANT_UNLAYERED: 40,
  AUTHOR_IMPORTANT_LAYERED: 50,
  INLINE_IMPORTANT: 60,
} as const;

export type CascadeOrigin = typeof CascadeOrigin[keyof typeof CascadeOrigin];

/**
 * Standard CSS properties that are inherited by default according to CSS specs.
 * css-cascade-5 § 7.2 #computed-values
 */
export const INHERITED_PROPERTIES = new Set([
  'color',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'font-variant',
  'font-stretch',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-indent',
  'text-transform',
  'white-space',
  'visibility',
  'cursor',
  'direction',
  'writing-mode',
]);
