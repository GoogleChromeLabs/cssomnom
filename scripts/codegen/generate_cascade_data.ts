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
const OUTPUT_CASCADE_PATH = 'src/data/gen/cascade-data.ts';

interface WebrefProperty {
  name: string;
  href?: string;
  initial?: string;
  appliesTo?: string;
  syntax?: string;
}

interface MdnProperty {
  syntax?: string;
  initial?: string | string[];
  groups?: string[];
  status?: string;
}

function main() {
  const webref = JSON.parse(fs.readFileSync(WEBREF_CSS_PATH, 'utf-8')) as { properties: WebrefProperty[] };
  const mdn = JSON.parse(fs.readFileSync('node_modules/mdn-data/css/properties.json', 'utf-8')) as Record<string, MdnProperty>;

  // 1. Extract SVG Presentation Attributes from SVG 2 spec and webref
  const svgPresentationAttrSet = new Set<string>([
    'alignment-baseline',
    'baseline-shift',
    'clip',
    'clip-path',
    'clip-rule',
    'color',
    'color-interpolation',
    'color-interpolation-filters',
    'color-rendering',
    'cursor',
    'direction',
    'display',
    'dominant-baseline',
    'fill',
    'fill-opacity',
    'fill-rule',
    'filter',
    'flood-color',
    'flood-opacity',
    'font-family',
    'font-size',
    'font-size-adjust',
    'font-stretch',
    'font-style',
    'font-variant',
    'font-weight',
    'glyph-orientation-vertical',
    'image-rendering',
    'letter-spacing',
    'lighting-color',
    'marker-end',
    'marker-mid',
    'marker-start',
    'mask',
    'mask-type',
    'opacity',
    'overflow',
    'paint-order',
    'pointer-events',
    'shape-rendering',
    'stop-color',
    'stop-opacity',
    'stroke',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-opacity',
    'stroke-width',
    'text-anchor',
    'text-decoration',
    'text-decoration-line',
    'text-decoration-style',
    'text-rendering',
    'transform',
    'vector-effect',
    'visibility',
    'word-spacing',
    'writing-mode',
  ]);

  for (const prop of webref.properties) {
    if (prop.href && (prop.href.includes('svg') || prop.href.includes('filter-effects') || prop.href.includes('masking'))) {
      if (!prop.name.startsWith('-')) {
        svgPresentationAttrSet.add(prop.name);
      }
    }
  }

  const svgPresentationAttributes = Array.from(svgPresentationAttrSet).sort();

  // 2. Extract Color Properties from MDN and CSS specs
  const colorPropertySet = new Set<string>([
    'color',
    'background-color',
    'border-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'outline-color',
    'text-decoration-color',
    'column-rule-color',
    'caret-color',
    'flood-color',
    'lighting-color',
    'stop-color',
    'accent-color',
  ]);

  for (const [name, prop] of Object.entries(mdn)) {
    if (prop.syntax && (prop.syntax.includes('<color>') || prop.syntax.includes('<color-property>'))) {
      if (!name.startsWith('-')) {
        colorPropertySet.add(name);
      }
    }
  }

  const colorProperties = Array.from(colorPropertySet).sort();

  // 3. Compile Default Initial Property Values per CSS Cascade 5 & SVG 2
  const defaultPropertyValues: Record<string, string> = {
    'alignment-baseline': 'baseline',
    'background-color': 'rgba(0, 0, 0, 0)',
    'baseline-shift': 'baseline',
    'border-spacing': '0px',
    'clip-rule': 'nonzero',
    'color': 'rgb(0, 0, 0)',
    'color-interpolation-filters': '',
    'cursor': 'auto',
    'direction': 'ltr',
    'display': 'inline',
    'dominant-baseline': 'auto',
    'fill': 'black',
    'fill-opacity': '1',
    'fill-rule': 'nonzero',
    'filter': 'none',
    'flood-color': '',
    'flood-opacity': '1',
    'font-family': 'Times New Roman',
    'font-size': '16px',
    'font-size-adjust': 'none',
    'font-stretch': '100%',
    'font-style': 'normal',
    'font-weight': '400',
    'glyph-orientation-vertical': 'auto',
    'kerning': 'auto',
    'letter-spacing': 'normal',
    'lighting-color': '',
    'opacity': '1',
    'overflow': 'visible',
    'pointer-events': 'visiblePainted',
    'stop-color': '',
    'stop-opacity': '1',
    'stroke': '',
    'stroke-dasharray': 'none',
    'stroke-dashoffset': '0px',
    'stroke-linecap': 'butt',
    'stroke-linejoin': 'miter',
    'stroke-miterlimit': '4',
    'stroke-opacity': '1',
    'stroke-width': '1px',
    'text-anchor': 'start',
    'text-decoration-line': 'none',
    'text-decoration-style': 'solid',
    'text-indent': '0px',
    'visibility': 'visible',
    'word-spacing': '0px',
    'writing-mode': 'lr-tb',
  };

  // 4. Block Tags Set per HTML and CSS Display
  const blockTags = [
    'ARTICLE',
    'BLOCKQUOTE',
    'BODY',
    'DIV',
    'FIELDSET',
    'FIGCAPTION',
    'FIGURE',
    'FOOTER',
    'FORM',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HEADER',
    'HR',
    'HTML',
    'LI',
    'MAIN',
    'NAV',
    'OL',
    'P',
    'PRE',
    'SECTION',
    'TABLE',
    'UL',
  ].sort();

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
export const SVG_PRESENTATION_ATTRIBUTES: Set<string> = new Set([\n`;

  for (const attr of svgPresentationAttributes) {
    code += `  '${attr}',\n`;
  }
  code += `]);\n\n`;

  code += `/**
 * Standard CSS color properties that normalize computed color format.
 * css-color-4 § 4 #resolving-color-values
 */
export const COLOR_PROPERTIES: Set<string> = new Set([\n`;

  for (const prop of colorProperties) {
    code += `  '${prop}',\n`;
  }
  code += `]);\n\n`;

  code += `/**
 * Default initial property values for standard CSS and SVG presentation attributes.
 * css-cascade-5 § 7.1 #initial-values
 * svg-2 § 6.2 #presentation-attributes
 */
export const DEFAULT_PROPERTY_VALUES: Record<string, string> = {\n`;

  const sortedDefaultKeys = Object.keys(defaultPropertyValues).sort();
  for (const key of sortedDefaultKeys) {
    code += `  '${key}': '${defaultPropertyValues[key]}',\n`;
  }
  code += `};\n\n`;

  code += `/**
 * Standard HTML block elements defaulting to display: block.
 * css-display-3 § 2
 */
export const BLOCK_TAGS: Set<string> = new Set([\n`;

  for (const tag of blockTags) {
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
