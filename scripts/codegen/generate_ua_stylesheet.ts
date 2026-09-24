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

const WHATWG_RENDERING_URL = 'https://html.spec.whatwg.org/multipage/rendering.html';
const CACHE_PATH = path.resolve(import.meta.dirname, 'cache/whatwg-ua-blocks.json');
const OUTPUT_PATH = path.resolve(import.meta.dirname, '../../src/data/gen/ua-stylesheet.ts');

interface CachedUaData {
  sourceUrl: string;
  blocks: string[];
}

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function normalizeWhatwgCssBlock(rawCss: string): string {
  return rawCss
    .replace(/@namespace\s+[^;]+;/g, '')
    .replace(/@media[^{]+\{[\s\S]*?\}\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/:heading\(1\)/g, 'h1')
    .replace(/:heading\(2\)/g, 'h2')
    .replace(/:heading\(3\)/g, 'h3')
    .replace(/:heading\(4\)/g, 'h4')
    .replace(/:heading\(5\)/g, 'h5')
    .replace(/:heading\(6,\s*7,\s*8,\s*9\)/g, 'h6')
    .replace(/:heading\b/g, 'h1, h2, h3, h4, h5, h6')
    .trim();
}

function extractPureTagRules(cssText: string): string[] {
  const rules: string[] = [];
  const ruleRegex = /([^{}@]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRegex.exec(cssText)) !== null) {
    const selectorGroup = match[1].trim();
    if (selectorGroup.includes('(') || selectorGroup.includes(')')) continue;

    const rawSelectors = selectorGroup
      .split(',')
      .map(s => s.trim())
      .filter(s => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(s));
    if (rawSelectors.length === 0) continue;

    const decls = match[2]
      .split(';')
      .map(d => d.trim())
      .filter(Boolean)
      .join('; ');
    if (!decls) continue;

    rules.push(`${rawSelectors.join(', ')} { ${decls}; }`);
  }
  return rules;
}

async function fetchOrLoadBlocks(): Promise<string[]> {
  if (fs.existsSync(CACHE_PATH) && process.env.REFRESH_UA_STYLESHEET !== '1') {
    const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as CachedUaData;
    return cached.blocks;
  }

  try {
    const res = await fetch(WHATWG_RENDERING_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const preRegex = /([\s\S]{0,220})<pre><code class=['"]css['"]>([\s\S]*?)<\/code><\/pre>/gi;
    const extractedBlocks: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = preRegex.exec(html)) !== null) {
      const context = decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').toLowerCase();
      // Skip quirks-mode, legacy encoding, and optional customizable-select appearance branches
      if (
        context.includes('quirks mode') ||
        context.includes('iso-8859-8') ||
        context.includes('base appearance') ||
        context.includes('presentational hints')
      ) {
        continue;
      }

      const decoded = decodeHtmlEntities(match[2]).trim();
      if (!decoded.startsWith('@namespace')) continue;

      const normalized = normalizeWhatwgCssBlock(decoded);
      const tagRules = extractPureTagRules(normalized);
      if (tagRules.length > 0) {
        extractedBlocks.push(tagRules.join('\n'));
      }

      // HTML § 15.3.2 (#the-page) normative prose specifies 8px default margin on <body>
      if (decoded.includes('html, body { display: block; }')) {
        extractedBlocks.push('body { margin: 8px; }');
      }
    }

    if (extractedBlocks.length > 0) {
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
      fs.writeFileSync(
        CACHE_PATH,
        JSON.stringify({ sourceUrl: WHATWG_RENDERING_URL, blocks: extractedBlocks }, null, 2) + '\n',
      );
      return extractedBlocks;
    }
  } catch (err) {
    if (fs.existsSync(CACHE_PATH)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as CachedUaData;
      return cached.blocks;
    }
    throw err;
  }

  throw new Error('Failed to extract UA stylesheet blocks from WHATWG rendering.html');
}

async function main() {
  const blocks = await fetchOrLoadBlocks();
  const stylesheetText = blocks.join('\n\n');

  const output = `/**
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

// @generated by scripts/codegen/generate_ua_stylesheet.ts. Do not edit.
// Extracted from WHATWG HTML Standard § 15.3 (https://html.spec.whatwg.org/multipage/rendering.html)

export const HTML_UA_STYLESHEET_TEXT = ${JSON.stringify(stylesheetText, null, 2)};
`;

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output);
  console.log(`Generated ${OUTPUT_PATH} (${blocks.length} normative UA CSS blocks).`);
}

main();
