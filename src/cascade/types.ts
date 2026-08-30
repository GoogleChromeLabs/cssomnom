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
 * css-cascade-5 § 5 #filtering
 * css-cascade-5 § 6.1 #cascade-sort
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
 * css-cascade-5 § 6.1 #style-attr
 * css-cascade-5 § 6.1 #cascade-layering
 * css-cascade-5 § 6.2 #cascading-origins
 * css-cascade-5 § 6.3 #importance
 */
export const CascadeOrigin = {
  // css-cascade-5 § 6.1 #cascade-origin, § 6.2 #cascade-origin-ua
  USER_AGENT: 0,
  // css-cascade-5 § 6.1 #cascade-origin, § 6.2 #cascade-origin-user
  USER: 10,
  // css-cascade-5 § 6.1 #cascade-origin, § 6.1 #cascade-layering
  AUTHOR_NORMAL_LAYERED: 10,
  // css-cascade-5 § 6.1 #cascade-origin, § 6.1 #cascade-layering (implicit final layer)
  AUTHOR_NORMAL_UNLAYERED: 20,
  // css-cascade-5 § 6.1 #style-attr (element-attached styles)
  INLINE_NORMAL: 30,
  // css-cascade-5 § 6.1 #cascade-origin, § 6.1 #cascade-layering, § 6.3 #importance
  AUTHOR_IMPORTANT_UNLAYERED: 40,
  // css-cascade-5 § 6.1 #cascade-origin, § 6.1 #cascade-layering, § 6.3 #importance
  AUTHOR_IMPORTANT_LAYERED: 50,
  // css-cascade-5 § 6.1 #style-attr, § 6.3 #importance
  INLINE_IMPORTANT: 60,
} as const;

export type CascadeOrigin = typeof CascadeOrigin[keyof typeof CascadeOrigin];

/**
 * Standard CSS properties that are inherited by default according to CSS specs.
 * css-cascade-5 § 7.2 #inheriting
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
