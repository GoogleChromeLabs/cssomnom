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

// STANDARD_PROPERTIES_SYNTAX registry maps CSS property names to Houdini-compliant syntax strings.
//
// WHY MANUALLY MAINTAINED?
// CSS specifications contain complex grammars (space-separated, brackets, ||/&& combinators)
// that cannot be parsed by matchesSyntax/parseSyntax (which strictly conform to the Houdini
// Custom Properties API syntax specification, prohibiting space separators, groupings, etc.).
//
// RULES FOR ADDING PROPERTIES:
// 1. Only add properties if we explicitly want to validate them in CSSStyleValue.parse() / CSS.supports().
// 2. The syntax MUST be Houdini-compliant: basic types, '|' alternatives, and simple multipliers.
// 3. DO NOT add properties with complex syntaxes (e.g. space-separated values, complex sequences),
//    as they will cause false-positives and reject valid standard CSS values.
//
// Omitted properties bypass validation and always pass, preserving CSSOM robustness.
export const STANDARD_PROPERTIES_SYNTAX: Record<string, string> = {
  'alignment-baseline': 'baseline | text-bottom | alphabetic | ideographic | middle | central | mathematical | text-top',
  'backface-visibility': 'visible | hidden',
  'background-color': '<color>',
  'border-bottom-color': '<color>',
  'border-collapse': 'separate | collapse',
  'border-color': '<color>',
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
