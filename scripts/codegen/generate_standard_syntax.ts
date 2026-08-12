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
import fs from 'node:fs';

const WEBREF_CSS_PATH = 'node_modules/@webref/css/css.json';
const OUTPUT_PATH = 'src/data/gen/standard-syntax.ts';

interface Property {
  name: string;
  syntax?: string;
  legacyAliasOf?: string;
  styleDeclaration?: string[];
  longhands?: string[];
}

interface TypeDef {
  name: string;
  syntax?: string;
}

const css = JSON.parse(fs.readFileSync(WEBREF_CSS_PATH, 'utf8')) as {
  properties: Property[];
  types: TypeDef[];
};

const propMap = new Map<string, Property>();
for (const p of css.properties) {
  propMap.set(p.name, p);
}

const typeMap = new Map<string, TypeDef>();
for (const t of css.types) {
  typeMap.set(t.name, t);
}

const KNOWN_TYPE_REPLACEMENTS: Record<string, string> = {
  'color-base': '<color>',
  'system-color': '<color>',
  'light-dark-color': '<color>',
  'contrast-color()': '<color>',
  'device-cmyk()': '<color>',
  'opacity-value': '<number> | <percentage>',
  'alpha-value': '<number> | <percentage>',
  'length-percentage': '<length-percentage>',
  'time-percentage': '<time> | <percentage>',
  'angle-percentage': '<angle> | <percentage>',
  'frequency-percentage': '<frequency> | <percentage>',
  'line-width': '<length> | thin | medium | thick',
  'line-style': 'none | hidden | dotted | dashed | solid | double | groove | ridge | inset | outset',
  'position': '<length-percentage> | left | center | right | top | bottom',
  'bg-position': '<length-percentage> | left | center | right | top | bottom',
  'bg-size': '<length-percentage> | auto | cover | contain',
  'repeat-style': 'repeat-x | repeat-y | repeat | space | round | no-repeat',
  'attachment': 'scroll | fixed | local',
  'visual-box': 'border-box | padding-box | content-box',
  'shape-box': 'border-box | padding-box | content-box | margin-box',
  'geometry-box': 'border-box | padding-box | content-box | margin-box | fill-box | stroke-box | view-box',
  'coord-box': 'content-box | padding-box | border-box | fill-box | stroke-box | view-box',
  'bg-clip': 'border-box | padding-box | content-box | text',
  'bg-image': 'none | <image>',
  'single-animation-direction': 'normal | reverse | alternate | alternate-reverse',
  'single-animation-fill-mode': 'none | forwards | backwards | both',
  'single-animation-iteration-count': 'infinite | <number>',
  'single-animation-play-state': 'running | paused',
  'single-transition-property': 'all | none | <custom-ident>',
  'easing-function': 'linear | ease | ease-in | ease-out | ease-in-out | step-start | step-end',
  'baseline-metric': 'baseline | text-bottom | alphabetic | ideographic | middle | central | mathematical | text-top | bottom | center | top',
  'baseline-position': 'first | last | baseline',
  'content-distribution': 'space-between | space-around | space-evenly | stretch',
  'overflow-position': 'unsafe | safe',
  'content-position': 'center | start | end | flex-start | flex-end',
  'self-position': 'center | start | end | self-start | self-end | flex-start | flex-end',
  'transform-list': '<transform-list>',
  'transform-function': '<transform-function>',
  'quote': 'open-quote | close-quote | no-open-quote | no-close-quote',
  'counter-style': 'none | decimal | <custom-ident>',
  'counter-style-name': 'none | decimal | <custom-ident>',
  'overflow': 'visible | hidden | clip | scroll | auto',
  'ratio': '<number>',
  'flex': '<flex>',
  'zero': '0',
};

// Manual overrides for properties with specialized Houdini-compliant syntax definitions or edge cases
const MANUAL_OVERRIDES: Record<string, string> = {
  'alignment-baseline': 'baseline | text-bottom | alphabetic | ideographic | middle | central | mathematical | text-top',
  'backface-visibility': 'visible | hidden',
  'background-color': '<color>',
  'border-bottom-color': '<color>',
  'border-collapse': 'separate | collapse',
  'border-color': '<color>',
  'caret-color': 'auto | <color>',
  'fill': '<color>',
  'stroke': '<color>',
  'border-left-color': '<color>',
  'border-right-color': '<color>',
  'border-top-color': '<color>',
  'bottom': '<length-percentage> | auto',
  'box-sizing': 'content-box | border-box',
  'break-inside': 'auto | avoid | avoid-column | avoid-page | avoid-region',
  'caption-side': 'top | bottom',
  'clear': 'none | left | right | both',
  'clip-rule': 'nonzero | evenodd',
  'color': '<color>',
  'color-interpolation': 'auto | srgb | linearrgb',
  'column-span': 'none | all',
  'container-type': 'normal | size | inline-size',
  'direction': 'ltr | rtl',
  'dominant-baseline': 'auto | text-bottom | alphabetic | ideographic | middle | central | mathematical | hanging | text-top',
  'empty-cells': 'show | hide',
  'fill-rule': 'nonzero | evenodd',
  'flex-direction': 'row | row-reverse | column | column-reverse',
  'flex-wrap': 'nowrap | wrap | wrap-reverse',
  'float': 'left | right | none',
  'font-kerning': 'auto | normal | none',
  'font-optical-sizing': 'auto | none',
  'font-palette': 'normal | light | dark',
  'font-presentation': 'auto | text | emoji',
  'font-variant-alternates': 'normal | historical-forms',
  'font-variant-caps': 'normal | small-caps | all-small-caps | petite-caps | all-petite-caps | unicase | titling-caps',
  'font-variant-emoji': 'normal | text | emoji | unicode',
  'height': '<length-percentage> | auto | fit-content | max-content | min-content',
  'hyphens': 'none | manual | auto',
  'image-rendering': 'auto | smooth | high-quality | crisp-edges | pixelated',
  'isolation': 'auto | isolate',
  'left': '<length-percentage> | auto',
  'letter-spacing': 'normal | <length-percentage>',
  'line-break': 'auto | loose | normal | strict | anywhere',
  'list-style-position': 'inside | outside',
  'margin-bottom': '<length-percentage> | auto',
  'margin-left': '<length-percentage> | auto',
  'margin-right': '<length-percentage> | auto',
  'margin-top': '<length-percentage> | auto',
  'mask-type': 'luminance | alpha',
  'mix-blend-mode': 'normal | multiply | screen | overlay | darken | lighten | color-dodge | color-burn | hard-light | soft-light | difference | exclusion | hue | saturation | color | luminosity',
  'object-fit': 'fill | contain | cover | none | scale-down',
  'offset-distance': '<length-percentage>',
  'opacity': '<number> | <percentage>',
  'outline-offset': '<length>',
  'outline-style': 'auto | none | dotted | dashed | solid | double | groove | ridge | inset | outset',
  'overflow-anchor': 'auto | none',
  'overflow-wrap': 'normal | break-word | break-spaces',
  'padding-bottom': '<length-percentage>',
  'padding-left': '<length-percentage>',
  'padding-right': '<length-percentage>',
  'padding-top': '<length-percentage>',
  'pointer-events': 'bounding-box | visiblepainted | visiblefill | visiblestroke | visible | painted | fill | stroke | all | none',
  'position-visibility': 'always | anchors-valid | anchors-visible | no-overflow',
  'position': 'static | relative | absolute | sticky | fixed',
  'resize': 'none | both | horizontal | vertical',
  'right': '<length-percentage> | auto',
  'scroll-behavior': 'auto | smooth',
  'scroll-snap-stop': 'normal | always',
  'scrollbar-gutter': 'auto | stable',
  'scrollbar-width': 'auto | thin | none',
  'speak': 'auto | never | always',
  'stroke-linecap': 'butt | round | square',
  'table-layout': 'auto | fixed',
  'text-align': 'start | end | left | right | center | justify',
  'text-align-last': 'auto | start | end | left | right | center | justify',
  'text-anchor': 'start | middle | end',
  'text-box-trim': 'none | trim-both | trim-start | trim-end',
  'text-combine-upright': 'none | all',
  'text-decoration-skip-ink': 'auto | none',
  'text-decoration-style': 'solid | double | dotted | dashed | wavy',
  'text-indent': '<length-percentage>',
  'text-justify': 'auto | none | inter-word | inter-character',
  'text-orientation': 'mixed | upright | sideways',
  'text-rendering': 'auto | optimizespeed | optimizelegibility | geometricprecision',
  'text-transform': 'none | capitalize | uppercase | lowercase | full-width',
  'top': '<length-percentage> | auto',
  'transform': '<transform-list> | none',
  'transform-box': 'border-box | fill-box | view-box',
  'transform-style': 'flat | preserve-3d',
  'unicode-bidi': 'normal | embed | isolate | bidi-override | isolate-override | plaintext',
  'user-select': 'auto | text | none | contain | all',
  'vector-effect': 'non-scaling-stroke | none',
  'vertical-align': 'baseline | sub | super | top | text-top | middle | bottom | text-bottom | <length-percentage>',
  'visibility': 'visible | hidden | collapse',
  'width': '<length-percentage> | auto | fit-content | max-content | min-content',
  'word-break': 'normal | keep-all | break-all',
  'word-wrap': 'normal | break-word | break-spaces',
  'writing-mode': 'horizontal-tb | vertical-rl | vertical-lr | sideways-rl | sideways-lr',
  'z-index': 'auto | <integer>',
};

function expandGrammar(raw: string, visited = new Set<string>()): string {
  if (!raw) return '';
  let s = raw;

  // Replace range notations like [0s,∞], [0,∞], [-∞,∞], [0px,∞], [1,∞]
  s = s.replace(/\[\s*[-+0-9a-z∞.]+\s*,\s*[-+0-9a-z∞.]+\s*\]/gi, '');

  // Replace property references <'prop'>
  s = s.replace(/<'([a-z0-9-]+)'>/g, (_, propName: string) => {
    if (visited.has('prop:' + propName)) return '';
    visited.add('prop:' + propName);
    const target = propMap.get(propName);
    return target && target.syntax ? `[ ${expandGrammar(target.syntax, visited)} ]` : '';
  });

  // Replace known types
  for (const [key, replacement] of Object.entries(KNOWN_TYPE_REPLACEMENTS)) {
    const re = new RegExp('<' + key.replace(/[()]/g, '\\$&') + '>', 'g');
    s = s.replace(re, replacement);
  }

  // Replace other types from typeMap if simple
  s = s.replace(/<([a-z0-9-]+)>/g, (match, typeName: string) => {
    if (
      typeName.startsWith('calc-') ||
      typeName.startsWith('anchor') ||
      typeName === 'url' ||
      typeName === 'image' ||
      typeName === 'color' ||
      typeName === 'length' ||
      typeName === 'percentage' ||
      typeName === 'number' ||
      typeName === 'integer' ||
      typeName === 'angle' ||
      typeName === 'time' ||
      typeName === 'resolution' ||
      typeName === 'custom-ident' ||
      typeName === 'string' ||
      typeName === 'flex' ||
      typeName === 'transform-list' ||
      typeName === 'transform-function' ||
      typeName === 'length-percentage'
    ) {
      return match;
    }
    if (visited.has('type:' + typeName)) return '';
    visited.add('type:' + typeName);
    const t = typeMap.get(typeName);
    if (t && t.syntax) {
      return `[ ${expandGrammar(t.syntax, visited)} ]`;
    }
    return '';
  });

  return s;
}

function convertToHoudiniSyntax(rawSyntax: string): string {
  if (!rawSyntax) return '';
  const expanded = expandGrammar(rawSyntax);

  const types = new Set<string>();
  const idents = new Set<string>();

  const hasLength = /<length\b/.test(expanded);
  const hasPercentage = /<percentage\b/.test(expanded);
  const hasLengthPercentage = /<length-percentage\b/.test(expanded) || (hasLength && hasPercentage);
  const hasNumber = /<number\b/.test(expanded);
  const hasInteger = /<integer\b/.test(expanded);
  const hasColor = /<color\b/.test(expanded);
  const hasTime = /<time\b/.test(expanded);
  const hasAngle = /<angle\b/.test(expanded);
  const hasImage = /<image\b/.test(expanded);
  const hasUrl = /<url\b/.test(expanded);
  const hasResolution = /<resolution\b/.test(expanded);
  const hasTransformList = /<transform-list\b/.test(expanded);
  const hasTransformFunction = /<transform-function\b/.test(expanded);
  const hasCustomIdent = /<custom-ident\b/.test(expanded) || /<keyframes-name\b/.test(expanded);
  const hasString = /<string\b/.test(expanded);
  const hasFlex = /<flex\b/.test(expanded);

  if (hasLengthPercentage) {
    types.add('<length-percentage>');
  } else {
    if (hasLength) types.add('<length>');
    if (hasPercentage) types.add('<percentage>');
  }

  if (hasNumber) {
    types.add('<number>');
  } else if (hasInteger) {
    types.add('<integer>');
  }

  if (hasColor) types.add('<color>');
  if (hasTime) types.add('<time>');
  if (hasAngle) types.add('<angle>');
  if (hasImage) types.add('<image>');
  if (hasUrl && !hasImage) types.add('<url>');
  if (hasResolution) types.add('<resolution>');
  if (hasTransformList) types.add('<transform-list>');
  else if (hasTransformFunction) types.add('<transform-function>');
  if (hasCustomIdent) types.add('<custom-ident>');
  if (hasString) types.add('<string>');
  if (hasFlex) types.add('<flex>');

  // Find literal idents: tokens that match [a-z0-9-]+ outside of <...> and functions
  let clean = expanded.replace(/<[^>]+>/g, ' ').replace(/[a-zA-Z0-9-]+\([^)]*\)/g, ' ');
  clean = clean.replace(/[[\]{}|&+#?,!/:]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);

  for (const w of words) {
    const lower = w.toLowerCase();
    if (!/^[a-z0-9-]+$/.test(lower)) continue;
    if (['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default'].includes(lower)) continue;
    if (lower === '0') continue;
    if (/^[0-9]+$/.test(lower)) continue;
    idents.add(lower);
  }

  const parts: string[] = [];
  // Basic types first, then sorted idents
  for (const t of types) parts.push(t);
  for (const id of Array.from(idents).sort()) parts.push(id);

  return parts.join(' | ');
}

function main() {
  const result: Record<string, string> = {};

  for (const p of css.properties) {
    let rawSyntax = p.syntax;
    if (!rawSyntax && p.legacyAliasOf) {
      const target = propMap.get(p.legacyAliasOf);
      rawSyntax = target?.syntax;
    }

    if (!rawSyntax) continue;

    const houdiniSyntax = convertToHoudiniSyntax(rawSyntax);
    if (houdiniSyntax) {
      result[p.name.toLowerCase()] = houdiniSyntax;
    }
  }

  // Apply manual overrides
  for (const [prop, syntax] of Object.entries(MANUAL_OVERRIDES)) {
    result[prop.toLowerCase()] = syntax;
  }

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

// @generated by scripts/codegen/generate_standard_syntax.ts. Do not edit.
// Machine-generated standard syntax definitions from @webref/css.

export const STANDARD_PROPERTIES_SYNTAX: Record<string, string> = {\n`;

  const sortedKeys = Object.keys(result).sort();
  for (const key of sortedKeys) {
    code += `  '${key}': '${result[key]}',\n`;
  }

  code += `};\n`;

  fs.writeFileSync(OUTPUT_PATH, code);
  console.log(`Generated ${OUTPUT_PATH} with ${sortedKeys.length} standard properties syntax definitions.`);
}

main();
