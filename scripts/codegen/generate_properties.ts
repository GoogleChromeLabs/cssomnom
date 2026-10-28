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
const OUTPUT_PROPERTIES_PATH = 'src/data/gen/properties.ts';
const OUTPUT_LIST_PATH = 'src/data/gen/property-list.ts';

interface AtRuleDef {
    name: string;
    descriptors?: Array<{ name: string }>;
}

interface TypeDef {
    name: string;
    syntax?: string;
}

function toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

async function main() {
    const css = JSON.parse(fs.readFileSync(WEBREF_CSS_PATH, 'utf8')) as {
        properties: Array<{ name: string }>;
        atrules: AtRuleDef[];
        types: TypeDef[];
    };
    const properties = css.properties.map((p) => p.name);
    
    // Sort and remove duplicates
    const uniqueProperties = Array.from(new Set(properties)) as string[];
    if (!uniqueProperties.includes('font-presentation')) {
        uniqueProperties.push('font-presentation');
    }
    uniqueProperties.sort();

    const { STANDARD_PROPERTIES_SYNTAX } = await import('../../src/data/gen/standard-syntax.ts');
    const customIdentProps = Object.keys(STANDARD_PROPERTIES_SYNTAX)
        .filter(p => STANDARD_PROPERTIES_SYNTAX[p].includes('<custom-ident>'))
        .sort();

    // 1. @font-face descriptors
    const fontFaceAtRule = css.atrules.find((a: AtRuleDef) => a.name === '@font-face');
    const fontFaceDescriptors = new Set<string>(
        (fontFaceAtRule?.descriptors || []).map((d: { name: string }) => d.name)
    );
    fontFaceDescriptors.add('font-stretch');
    fontFaceDescriptors.add('font-variant');
    const sortedFontFaceDescriptors = Array.from(fontFaceDescriptors).sort();

    // 2. @page allowed properties & descriptors
    const pageAtRule = css.atrules.find((a: AtRuleDef) => a.name === '@page');
    const pageDescriptors = (pageAtRule?.descriptors || []).map((d: { name: string }) => d.name);
    const pageAllowedProperties = new Set<string>([
        ...pageDescriptors,
        'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'margin-block', 'margin-block-start', 'margin-block-end',
        'margin-inline', 'margin-inline-start', 'margin-inline-end',
        'page-break-before', 'page-break-after', 'page-break-inside',
        'break-before', 'break-after', 'break-inside', 'orphans', 'widows',
        'page', 'counter-increment', 'counter-reset', 'counter-set', 'quotes'
    ]);
    const sortedPageAllowedProperties = Array.from(pageAllowedProperties).sort();
    const pageDescriptorProperties = [
        'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'size', 'pageOrientation', 'page-orientation', 'marks', 'bleed'
    ];

    // 3. @counter-style descriptors
    const counterStyleAtRule = css.atrules.find((a: AtRuleDef) => a.name === '@counter-style');
    const counterStyleDescriptors = (counterStyleAtRule?.descriptors || []).map((d: { name: string }) => [
        d.name,
        toCamelCase(d.name)
    ]);

    // 4. @font-feature-values map defs & blocks
    const fontFeatureValueMapDefs = [
        ['annotation', 'annotation'],
        ['ornaments', 'ornaments'],
        ['stylistic', 'stylistic'],
        ['swash', 'swash'],
        ['character-variant', 'characterVariant'],
        ['styleset', 'styleset'],
        ['historical-forms', 'historicalForms']
    ];
    const fontFeatureValueBlocks = {
        annotation: 'annotation',
        ornaments: 'ornaments',
        stylistic: 'stylistic',
        swash: 'swash',
        'character-variant': 'characterVariant',
        charactervariant: 'characterVariant',
        styleset: 'styleset',
        'historical-forms': 'historicalForms',
        historicalforms: 'historicalForms'
    };

    // 5. Margin box rules
    const marginRuleNames = css.atrules
        .filter((a: AtRuleDef) => /^@(top|bottom|left|right)-/.test(a.name))
        .map((a: AtRuleDef) => a.name.substring(1))
        .sort();

    // 6. Generic font families
    const genericComplete = css.types.find((t: TypeDef) => t.name === 'generic-font-complete')?.syntax || '';
    const genericIncomplete = css.types.find((t: TypeDef) => t.name === 'generic-font-incomplete')?.syntax || '';
    const genericFontFamilies = new Set<string>([
        ...genericComplete.split('|').map((s: string) => s.trim().toLowerCase()),
        ...genericIncomplete.split('|').map((s: string) => s.trim().toLowerCase()),
        'emoji',
        'fangsong'
    ].filter(Boolean));
    const sortedGenericFontFamilies = Array.from(genericFontFamilies).sort();

    // 7. Font & shorthand keyword sets
    const fontVariantLigatures = [
        'common-ligatures', 'no-common-ligatures',
        'discretionary-ligatures', 'no-discretionary-ligatures',
        'historical-ligatures', 'no-historical-ligatures',
        'contextual', 'no-contextual'
    ];
    const fontVariantCaps = [
        'small-caps', 'all-small-caps', 'petite-caps', 'all-petite-caps', 'unicase', 'titling-caps'
    ];
    const fontVariantNumeric = [
        'lining-nums', 'oldstyle-nums', 'proportional-nums', 'tabular-nums',
        'diagonal-fractions', 'stacked-fractions', 'ordinal', 'slashed-zero'
    ];
    const fontVariantEastAsian = [
        'jis78', 'jis83', 'jis90', 'jis04', 'simplified', 'traditional',
        'full-width', 'proportional-width', 'ruby'
    ];
    const fontVariantPosition = ['sub', 'super'];
    const fontVariantEmoji = ['text', 'emoji', 'unicode'];
    const fontVariantAlternatesFunctions = [
        'stylistic', 'styleset', 'character-variant', 'swash', 'ornaments', 'annotation'
    ];
    const systemFontKeywords = [
        'initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default',
        'caption', 'icon', 'menu', 'message-box', 'small-caption', 'status-bar'
    ];
    const fontStretchKeywords = [
        'ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed',
        'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded'
    ];
    const fontSizeKeywords = [
        'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large', 'smaller', 'larger'
    ];
    const flexBasisKeywords = [
        'auto', 'content', 'max-content', 'min-content', 'fit-content'
    ];

    // Generate property-list.ts
    let listContent = `/**
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
 */\n\n// @generated by scripts/codegen/generate_properties.ts. Do not edit.\n// Machine-generated.\n\n`;
    listContent += `export const SUPPORTED_PROPERTIES: Set<string> = /* @__PURE__ */ new Set('${uniqueProperties.join(',')}'.split(','));\n\n`;
    listContent += `export const CUSTOM_IDENT_PROPERTIES: Set<string> = /* @__PURE__ */ new Set('${customIdentProps.join(',')}'.split(','));\n\n`;
    listContent += `export const FONT_FACE_DESCRIPTORS: ReadonlySet<string> = /* @__PURE__ */ new Set('${sortedFontFaceDescriptors.join(',')}'.split(','));\n\n`;
    listContent += `export const PAGE_ALLOWED_PROPERTIES: ReadonlySet<string> = /* @__PURE__ */ new Set('${sortedPageAllowedProperties.join(',')}'.split(','));\n\n`;
    listContent += `export const PAGE_DESCRIPTOR_PROPERTIES = ${JSON.stringify(pageDescriptorProperties)} as const;\n\n`;
    listContent += `export const COUNTER_STYLE_DESCRIPTORS: ReadonlyArray<readonly [string, string]> = ${JSON.stringify(counterStyleDescriptors)};\n\n`;
    listContent += `export const COUNTER_STYLE_PROP_BY_DESCRIPTOR: ReadonlyMap<string, string> = /* @__PURE__ */ new Map(COUNTER_STYLE_DESCRIPTORS);\n\n`;
    listContent += `export const FONT_FEATURE_VALUE_MAP_DEFS = ${JSON.stringify(fontFeatureValueMapDefs)} as const;\n\n`;
    listContent += `export const FONT_FEATURE_VALUE_BLOCKS: Record<string, 'annotation' | 'ornaments' | 'stylistic' | 'swash' | 'characterVariant' | 'styleset' | 'historicalForms'> = ${JSON.stringify(fontFeatureValueBlocks)};\n\n`;
    listContent += `export const MARGIN_RULE_NAMES: ReadonlySet<string> = /* @__PURE__ */ new Set('${marginRuleNames.join(',')}'.split(','));\n\n`;
    listContent += `export const GENERIC_FONT_FAMILIES: ReadonlySet<string> = /* @__PURE__ */ new Set('${sortedGenericFontFamilies.join(',')}'.split(','));\n\n`;
    listContent += `export const FONT_VARIANT_LIGATURES_KEYWORDS: ReadonlySet<string> = /* @__PURE__ */ new Set('${fontVariantLigatures.join(',')}'.split(','));\n\n`;
    listContent += `export const FONT_VARIANT_CAPS_KEYWORDS: ReadonlySet<string> = /* @__PURE__ */ new Set('${fontVariantCaps.join(',')}'.split(','));\n\n`;
    listContent += `export const FONT_VARIANT_NUMERIC_KEYWORDS: ReadonlySet<string> = /* @__PURE__ */ new Set('${fontVariantNumeric.join(',')}'.split(','));\n\n`;
    listContent += `export const FONT_VARIANT_EAST_ASIAN_KEYWORDS: ReadonlySet<string> = /* @__PURE__ */ new Set('${fontVariantEastAsian.join(',')}'.split(','));\n\n`;
    listContent += `export const FONT_VARIANT_POSITION_KEYWORDS: ReadonlySet<string> = /* @__PURE__ */ new Set('${fontVariantPosition.join(',')}'.split(','));\n\n`;
    listContent += `export const FONT_VARIANT_EMOJI_KEYWORDS: ReadonlySet<string> = /* @__PURE__ */ new Set('${fontVariantEmoji.join(',')}'.split(','));\n\n`;
    listContent += `export const FONT_VARIANT_ALTERNATES_FUNCTIONS: ReadonlySet<string> = /* @__PURE__ */ new Set('${fontVariantAlternatesFunctions.join(',')}'.split(','));\n\n`;
    listContent += `export const SYSTEM_FONT_KEYWORDS: ReadonlySet<string> = /* @__PURE__ */ new Set('${systemFontKeywords.join(',')}'.split(','));\n\n`;
    listContent += `export const FONT_STRETCH_KEYWORDS: ReadonlySet<string> = /* @__PURE__ */ new Set('${fontStretchKeywords.join(',')}'.split(','));\n\n`;
    listContent += `export const FONT_SIZE_KEYWORDS: ReadonlySet<string> = /* @__PURE__ */ new Set('${fontSizeKeywords.join(',')}'.split(','));\n\n`;
    listContent += `export const FLEX_BASIS_KEYWORDS: ReadonlySet<string> = /* @__PURE__ */ new Set('${flexBasisKeywords.join(',')}'.split(','));\n`;
    fs.writeFileSync(OUTPUT_LIST_PATH, listContent);
    console.log(`Generated ${OUTPUT_LIST_PATH} with ${uniqueProperties.length} properties and ${customIdentProps.length} custom-ident properties.`);

    // Generate properties.ts
    let tsContent = `/**
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
 */\n\n// @generated by scripts/codegen/generate_properties.ts. Do not edit.\n// Machine-generated.\n\n`;
    tsContent += `export class CSSStyleProperties {\n`;
    tsContent += `  declare cssFloat: string;\n`;
    for (const prop of uniqueProperties) {
        if (prop.startsWith('--')) continue;
        
        let camelName = toCamelCase(prop);
        if (prop.startsWith('-')) {
            camelName = toCamelCase(prop.substring(1));
            camelName = camelName[0].toLowerCase() + camelName.substring(1);
        }
        
        tsContent += `  declare ${camelName}: string;\n`;
    }
    
    tsContent += `}\n\n`;
    tsContent += `// WebIDL § 3.6 #es-attributes\n`;
    tsContent += `// cssom-1 § 6.6.1 #dom-cssstyledeclaration-cssfloat\n`;
    tsContent += `Object.defineProperty(CSSStyleProperties.prototype, 'cssFloat', {\n`;
    tsContent += `  get(this: unknown): string {\n`;
    tsContent += `    const target = this as { getPropertyValue?: (p: string) => string; _float?: string };\n`;
    tsContent += `    return typeof target.getPropertyValue === 'function' ? target.getPropertyValue('float') : (target._float ?? '');\n`;
    tsContent += `  },\n`;
    tsContent += `  set(this: unknown, val: unknown): void {\n`;
    tsContent += `    const target = this as { setProperty?: (p: string, v: string) => void; _float?: string };\n`;
    tsContent += `    const strVal = val === null || val === undefined ? '' : String(val);\n`;
    tsContent += `    if (typeof target.setProperty === 'function') {\n`;
    tsContent += `      target.setProperty('float', strVal);\n`;
    tsContent += `    } else {\n`;
    tsContent += `      target._float = strVal;\n`;
    tsContent += `    }\n`;
    tsContent += `  },\n`;
    tsContent += `  enumerable: true,\n`;
    tsContent += `  configurable: true,\n`;
    tsContent += `});\n`;

    fs.writeFileSync(OUTPUT_PROPERTIES_PATH, tsContent);
    console.log(`Generated ${OUTPUT_PROPERTIES_PATH} with ${uniqueProperties.length} properties.`);
}

main();
