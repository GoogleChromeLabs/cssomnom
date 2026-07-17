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

const MDN_UNITS_PATH = 'node_modules/mdn-data/css/units.json';
const CSS_VALUES_SPEC_PATH = 'submodules/csswg-drafts/css-values-4/Overview.bs';
const CSS_CONTAIN_SPEC_PATH = 'submodules/csswg-drafts/css-contain-3/Overview.bs';
const CSS_CONDITIONAL_SPEC_PATH = 'submodules/csswg-drafts/css-conditional-5/Overview.bs';
const WPT_FIXTURES_PATH = 'tests/fixtures/wpt_extracted.json';
const OUTPUT_PATH = 'src/data/units.ts';

type UnitConfig = {
    unit: string;
    type: string;
    canonical?: boolean;
    factor?: number;
};

function computeUnits(): UnitConfig[] {
    const units = new Map<string, UnitConfig>();

    // 1. Load from MDN
    if (fs.existsSync(MDN_UNITS_PATH)) {
        const mdnUnits = JSON.parse(fs.readFileSync(MDN_UNITS_PATH, 'utf8'));
        for (const unit of Object.keys(mdnUnits)) {
            units.set(unit.toLowerCase(), { unit: unit.toLowerCase(), type: 'unknown' });
        }
    }

    // 2. Extract from Specs via Regex
    const specPaths = [CSS_VALUES_SPEC_PATH, CSS_CONTAIN_SPEC_PATH, CSS_CONDITIONAL_SPEC_PATH];
    for (const specPath of specPaths) {
        if (fs.existsSync(specPath)) {
            const content = fs.readFileSync(specPath, 'utf8');
            const dfnRegex = /<dfn id="([a-z*]+)">([a-z*]+)<\/dfn>/g;
            let match;
            while ((match = dfnRegex.exec(content)) !== null) {
                const unit = match[2].replace('*', '').toLowerCase();
                if (unit && unit.length <= 5) {
                    if (!units.has(unit)) {
                        units.set(unit, { unit, type: 'unknown' });
                    }
                }
            }

            const quoteRegex = /''([a-z]+)''/g;
            while ((match = quoteRegex.exec(content)) !== null) {
                 const unit = match[1].toLowerCase();
                 if (['auto', 'none', 'initial', 'inherit', 'unset', 'normal'].includes(unit)) continue;
                 if (unit.length <= 5) {
                    if (!units.has(unit)) {
                        units.set(unit, { unit, type: 'unknown' });
                    }
                 }
            }
        }
    }

    // 3. Scan WPT for dimension tokens
    if (fs.existsSync(WPT_FIXTURES_PATH)) {
        const wptData = JSON.parse(fs.readFileSync(WPT_FIXTURES_PATH, 'utf8'));
        const wptString = JSON.stringify(wptData);
        const dimensionRegex = /-?\d*\.?\d+([a-z]+)/gi;
        let match;
        while ((match = dimensionRegex.exec(wptString)) !== null) {
            const unit = match[1].toLowerCase();
            if (unit.length <= 5) {
                if (!units.has(unit)) {
                    units.set(unit, { unit, type: 'unknown' });
                }
            }
        }
    }

    // 4. Refine types and add known ones
    const knownMappings: Record<string, string> = {
        'px': 'length', 'cm': 'length', 'mm': 'length', 'in': 'length', 'pt': 'length', 'pc': 'length', 'q': 'length',
        'em': 'length', 'ex': 'length', 'ch': 'length', 'rem': 'length', 'lh': 'length', 'rlh': 'length',
        'vw': 'length', 'vh': 'length', 'vmin': 'length', 'vmax': 'length',
        'vi': 'length', 'vb': 'length', 'svw': 'length', 'svh': 'length', 'svi': 'length', 'svb': 'length', 'svmin': 'length', 'svmax': 'length',
        'lvw': 'length', 'lvh': 'length', 'lvi': 'length', 'lvb': 'length', 'lvmin': 'length', 'lvmax': 'length',
        'dvw': 'length', 'dvh': 'length', 'dvi': 'length', 'dvb': 'length', 'dvmin': 'length', 'dvmax': 'length',
        'cqw': 'length', 'cqh': 'length', 'cqi': 'length', 'cqb': 'length', 'cqmin': 'length', 'cqmax': 'length',
        'rex': 'length', 'cap': 'length', 'rcap': 'length', 'rch': 'length', 'ic': 'length', 'ric': 'length',
        'deg': 'angle', 'grad': 'angle', 'rad': 'angle', 'turn': 'angle',
        's': 'time', 'ms': 'time',
        'hz': 'frequency', 'khz': 'frequency',
        'dpi': 'resolution', 'dpcm': 'resolution', 'dppx': 'resolution', 'x': 'resolution',
        'fr': 'flex',
        'percent': 'percent',
        'number': 'number'
    };

    const finalUnits: UnitConfig[] = [];
    for (const [unit, config] of units.entries()) {
        if (knownMappings[unit]) {
            config.type = knownMappings[unit];
        }
        if (config.type === 'unknown' && !['mozmm'].includes(unit)) {
             continue;
        }
        finalUnits.push(config);
    }

    if (!units.has('percent')) finalUnits.push({ unit: 'percent', type: 'percent' });
    if (!units.has('number')) finalUnits.push({ unit: 'number', type: 'number' });

    const factors: Record<string, number> = {
        'px': 1, 'in': 96, 'pc': 16, 'pt': 96 / 72, 'cm': 96 / 2.54, 'mm': 96 / 25.4, 'q': 96 / 2.54 / 40,
        'rad': 1, 'deg': Math.PI / 180, 'grad': Math.PI / 200, 'turn': 2 * Math.PI,
        's': 1, 'ms': 0.001,
        'hz': 1, 'khz': 1000,
        'dppx': 1, 'x': 1, 'dpi': 1/96, 'dpcm': 2.54/96
    };

    for (const u of finalUnits) {
        if (factors[u.unit]) {
            u.factor = factors[u.unit];
        }
    }
    
    const canonicals: Record<string, string> = {
        'length': 'px',
        'angle': 'rad',
        'time': 's',
        'frequency': 'hz',
        'resolution': 'dppx',
        'flex': 'fr',
        'percent': 'percent',
        'number': 'number'
    };
    
    for (const u of finalUnits) {
        if (canonicals[u.type] === u.unit) {
            u.canonical = true;
        }
    }

    return finalUnits;
}

function main() {
    const units = computeUnits();

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
 */\n\n// @generated by scripts/codegen/generate_units_code.ts. Do not edit.\n// Machine-generated.\n\n`;
    tsContent += `import type { CSSNumericType } from '../typed-om.ts';\n\n`;

    tsContent += `export const UNITS = [\n`;
    const sortedUnits = units.map(u => u.unit).sort();
    for (const u of sortedUnits) {
        tsContent += `  '${u}',\n`;
    }
    tsContent += `] as const;\n\n`;

    tsContent += `export type CSSUnit = typeof UNITS[number];\n\n`;
    
    tsContent += `export const unitToBase: Record<string, keyof CSSNumericType | 'number'> = {\n`;
    for (const u of units) {
        tsContent += `  '${u.unit}': '${u.type}',\n`;
    }
    tsContent += `};\n\n`;

    const generateFactorMap = (name: string, type: string) => {
        let s = `export const ${name}: Record<string, number> = {\n`;
        for (const u of units) {
            if (u.type === type && u.factor !== undefined) {
                s += `  '${u.unit}': ${u.factor},\n`;
            }
        }
        s += `};\n\n`;
        return s;
    };

    tsContent += generateFactorMap('unitToPixels', 'length');
    tsContent += generateFactorMap('unitToRadians', 'angle');
    tsContent += generateFactorMap('unitToSeconds', 'time');

    fs.writeFileSync(OUTPUT_PATH, tsContent);
    console.log(`Generated ${OUTPUT_PATH} directly from specs and packages.`);

    const FACTORIES_OUTPUT_PATH = 'src/data/css-factories.ts';
    let factoriesContent = `/**
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
 */\n\n// @generated by scripts/codegen/generate_units_code.ts. Do not edit.\n// Machine-generated.\n\n`;
    factoriesContent += `import { CSSUnitValue } from '../typed-om.ts';\n`;
    factoriesContent += `import type { CSSUnit } from './units.ts';\n\n`;
    factoriesContent += `export const CSSFactories = {\n`;
    
    for (const u of sortedUnits) {
        factoriesContent += `  ${u}: (v: number) => new CSSUnitValue(v, '${u}' as CSSUnit),\n`;
    }
    factoriesContent += `};\n`;
    
    fs.writeFileSync(FACTORIES_OUTPUT_PATH, factoriesContent);
    console.log(`Generated ${FACTORIES_OUTPUT_PATH} directly from specs and packages.`);
}

main();
