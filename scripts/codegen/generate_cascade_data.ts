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

import * as fs from 'node:fs';
import * as path from 'node:path';

const WEBREF_CSS_PATH = 'node_modules/@webref/css/css.json';
const MDN_PROPERTIES_PATH = 'node_modules/mdn-data/css/properties.json';
const OUTPUT_CASCADE_PATH = 'src/data/gen/cascade-data.ts';

interface WebrefProperty {
  name: string;
  href?: string;
  initial?: string;
  appliesTo?: string;
  syntax?: string;
  computedValue?: string;
}

interface MdnProperty {
  syntax?: string;
  initial?: string | string[];
  groups?: string[];
  appliesto?: string;
  computed?: string;
}

// Standard cross-spec CSS styling properties that SVG 2 § 6.2 explicitly lists as presentation attributes
const SVG2_CROSS_SPEC_PRESENTATION_PROPERTIES = new Set([
  'color',
  'cursor',
  'direction',
  'display',
  'font-family',
  'font-size',
  'font-size-adjust',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'image-rendering',
  'letter-spacing',
  'opacity',
  'overflow',
  'pointer-events',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-style',
  'transform',
  'unicode-bidi',
  'visibility',
  'word-spacing',
  'writing-mode',
]);

// Standard HTML flow content block elements defaulting to display: block per CSS Display 3 & HTML Rendering § 15
const HTML_BLOCK_ELEMENTS = [
  'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'DD', 'DIV', 'DL', 'DT',
  'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3',
  'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'HR', 'HTML', 'LI', 'MAIN',
  'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL',
];

function main() {
  const webref = JSON.parse(fs.readFileSync(WEBREF_CSS_PATH, 'utf-8')) as { properties: WebrefProperty[] };
  const mdn = JSON.parse(fs.readFileSync(MDN_PROPERTIES_PATH, 'utf-8')) as Record<string, MdnProperty>;

  // 1. Extract SVG Presentation Attributes dynamically from spec origins and MDN groups
  const svgPresentationAttrSet = new Set<string>(SVG2_CROSS_SPEC_PRESENTATION_PROPERTIES);

  for (const prop of webref.properties) {
    if (prop.name.startsWith('-')) continue;
    const href = prop.href || '';
    const applies = (prop.appliesTo || '').toLowerCase();

    const isSvgSpec =
      href.includes('svgwg.org') ||
      href.includes('svg2-draft') ||
      href.includes('fill-stroke') ||
      href.includes('strokes') ||
      href.includes('filter-effects') ||
      href.includes('css-masking') ||
      href.includes('css-transforms');

    const isSvgApplies =
      applies.includes('svg') ||
      applies.includes('shapes') ||
      applies.includes('graphics elements') ||
      applies.includes('container elements');

    if (isSvgSpec || isSvgApplies) {
      svgPresentationAttrSet.add(prop.name);
    }
  }

  for (const [name, prop] of Object.entries(mdn)) {
    if (name.startsWith('-')) continue;
    const groups = prop.groups || [];
    const applies = (prop.appliesto || '').toLowerCase();

    if (
      groups.includes('Scalable Vector Graphics') ||
      groups.includes('Filter Effects') ||
      groups.includes('CSS Masking') ||
      applies.includes('svg')
    ) {
      svgPresentationAttrSet.add(name);
    }
  }

  const svgPresentationAttributes = Array.from(svgPresentationAttrSet).sort();

  // 2. Extract Color Properties dynamically by syntax parsing
  const colorPropertySet = new Set<string>();

  for (const prop of webref.properties) {
    if (prop.name.startsWith('-')) continue;
    const syntax = prop.syntax || '';
    if (syntax.includes('<color>') || syntax.includes('<color-property>') || syntax.includes('<paint>')) {
      colorPropertySet.add(prop.name);
    }
  }

  for (const [name, prop] of Object.entries(mdn)) {
    if (name.startsWith('-')) continue;
    const syntax = prop.syntax || '';
    if (syntax.includes('<color>') || syntax.includes('<color-property>') || syntax.includes('<paint>')) {
      colorPropertySet.add(name);
    }
  }

  const colorProperties = Array.from(colorPropertySet).sort();

  // 3. Extract Default Initial Property Values dynamically
  const defaultPropertyValues: Record<string, string> = {};

  for (const prop of webref.properties) {
    if (
      prop.name.startsWith('-') ||
      !prop.initial ||
      prop.initial.includes('see individual') ||
      prop.initial.includes('N/A') ||
      prop.initial.includes('depends on')
    ) {
      continue;
    }
    defaultPropertyValues[prop.name] = prop.initial;
  }

  for (const [name, prop] of Object.entries(mdn)) {
    if (
      name.startsWith('-') ||
      !prop.initial ||
      typeof prop.initial !== 'string' ||
      prop.initial.includes('seeProse') ||
      prop.initial.includes('dependsOnUserAgent')
    ) {
      continue;
    }
    if (!defaultPropertyValues[name]) {
      defaultPropertyValues[name] = prop.initial;
    }
  }

  // Canonical CSSOM computed/resolved fallbacks for standard cascade properties
  const computedFallbacks: Record<string, string> = {
    'background-color': 'rgba(0, 0, 0, 0)',
    'color': 'rgb(0, 0, 0)',
    'font-family': 'Times New Roman',
    'font-size': '16px',
    'font-weight': '400',
    'stroke-width': '1px',
  };
  Object.assign(defaultPropertyValues, computedFallbacks);

  const sortedDefaultKeys = Object.keys(defaultPropertyValues).sort();

  // 4. Generate Output Code
  let code = `/**
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

// @generated by scripts/codegen/generate_cascade_data.ts. Do not edit.
// Machine-generated.

/**
 * Standard SVG presentation attributes that map to CSS properties in the cascade.
 * svg-2 § 6.2 #presentation-attributes
 * css-cascade-5 § 3 #cascade-origins
 */
export const SVG_PRESENTATION_ATTRIBUTES: ReadonlySet<string> = new Set([\n`;

  for (const attr of svgPresentationAttributes) {
    code += `  '${attr}',\n`;
  }
  code += `]);\n\n`;

  code += `/**
 * Standard CSS color properties that normalize computed color format.
 * css-color-4 § 4 #resolving-color-values
 */
export const COLOR_PROPERTIES: ReadonlySet<string> = new Set([\n`;

  for (const prop of colorProperties) {
    code += `  '${prop}',\n`;
  }
  code += `]);\n\n`;

  code += `/**
 * Default initial property values for standard CSS and SVG presentation attributes.
 * css-cascade-5 § 7.1 #initial-values
 * svg-2 § 6.2 #presentation-attributes
 */
export const DEFAULT_PROPERTY_VALUES: Readonly<Record<string, string>> = {\n`;

  for (const key of sortedDefaultKeys) {
    code += `  '${key}': ${JSON.stringify(defaultPropertyValues[key])},\n`;
  }
  code += `};\n\n`;

  code += `/**
 * Standard HTML block elements defaulting to display: block.
 * css-display-3 § 2
 * html § 15 #rendering
 */
export const BLOCK_TAGS: ReadonlySet<string> = new Set([\n`;

  for (const tag of HTML_BLOCK_ELEMENTS.sort()) {
    code += `  '${tag}',\n`;
  }
  code += `]);\n`;

  const outDir = path.dirname(OUTPUT_CASCADE_PATH);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_CASCADE_PATH, code, 'utf-8');
  console.log(`Generated ${OUTPUT_CASCADE_PATH} successfully.`);
}

main();
