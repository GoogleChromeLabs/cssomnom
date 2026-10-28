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

import type { MediaQuery } from './types.ts';

/**
 * Upward optional feature hooks allowing `cssomnom/parse` (`./parse`) to tree-shake
 * out Typed OM, `@property` registry, `MediaParser`, and `CSS.supports`.
 *
 * Downward parser functions are imported directly from `src/parser.ts`.
 */
export const ParseHooks = {
  parseMediaQueryList: (text: string): MediaQuery[] => {
    return text.split(',').map(s => s.trim()).filter(Boolean).map(m => ({
      type: 'media-query' as const,
      mediaType: m,
      tokens: [],
      raw: m,
    }));
  },
  serializeMediaQuery: (query: MediaQuery): string => {
    return (query as { raw?: string }).raw ?? query.mediaType ?? '';
  },
  validatePropertyValue: (_property: string, _value: string, _rawValue?: unknown): boolean => {
    return true;
  },
  supports: (_conditionText: string): boolean => {
    return false;
  },
  createStylePropertyMap: (_style: unknown): unknown => {
    throw new Error('createStylePropertyMap not injected (import cssomnom/typed-om)');
  },
  validatePropertyRuleDescriptor: (_def: { name: string; syntax: string; inherits: boolean; initialValue?: string }): boolean => {
    return true;
  },
  registerPropertyRule: (_def: { name: string; syntax: string; inherits: boolean; initialValue?: string }): boolean => {
    return false;
  },
  unregisterPropertyRule: (_name: string): void => {},
};
