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

// WHATWG HTML Standard § 15.3 Rendering (https://html.spec.whatwg.org/multipage/rendering.html),
// read from the whatwg/html submodule so `pnpm run maintain` updates it alongside the other specs.
const SPEC_SOURCE_PATH = path.resolve(import.meta.dirname, '../../submodules/whatwg-html/source');
const OUTPUT_PATH = path.resolve(import.meta.dirname, '../../src/data/gen/ua-stylesheet.ts');

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
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

function escapeTemplateLiteral(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function extractBlocks(source: string): string[] {
  const preRegex = /<pre><code class="css"[^>]*>([\s\S]*?)<\/code><\/pre>(\s*<!--([\s\S]*?)-->)?/g;
  const extractedBlocks: string[] = [];

  for (const match of source.matchAll(preRegex)) {
    // The nearest preceding <p> or <h*> introduces the block ("In quirks mode, the following rules…").
    const preceding = source.slice(Math.max(0, match.index - 3000), match.index);
    const introStart = Math.max(...[...preceding.matchAll(/<(?:p|h\d)[\s>]/g)].map(m => m.index), 0);
    const context = decodeHtmlEntities(preceding.slice(introStart)).replace(/\s+/g, ' ').toLowerCase();
    // Skip quirks-mode, legacy encoding, and optional customizable-select appearance branches
    if (
      context.includes('quirks mode') ||
      context.includes('iso-8859-8') ||
      context.includes('base appearance') ||
      context.includes('presentational hints')
    ) {
      continue;
    }

    const decoded = decodeHtmlEntities(match[1]).trim();
    if (!decoded.startsWith('@namespace')) continue;

    const tagRules = extractPureTagRules(normalizeWhatwgCssBlock(decoded));
    // HTML § 15.3.3 (#the-page) states the <body> 8px margin in prose (it's really a presentational
    // hint with attribute overrides), but the spec source carries the CSS equivalent as an editor's
    // comment directly after the block: `<!-- body { margin: 8px; } -->`.
    const trailingCommentCss = match[3] ? extractPureTagRules(match[3]) : [];
    if (tagRules.length > 0) extractedBlocks.push(tagRules.join('\n'));
    if (trailingCommentCss.length > 0) extractedBlocks.push(trailingCommentCss.join('\n'));
  }

  if (extractedBlocks.length === 0) {
    throw new Error(`Failed to extract UA stylesheet blocks from ${SPEC_SOURCE_PATH}`);
  }
  if (!extractedBlocks.some(b => /^body \{ margin: /m.test(b))) {
    throw new Error(
      `Expected the "<!-- body { margin: ... } -->" comment after "The page" CSS block in ${SPEC_SOURCE_PATH}. ` +
      'The spec source changed; update extractBlocks().',
    );
  }
  return extractedBlocks;
}

function main() {
  const blocks = extractBlocks(fs.readFileSync(SPEC_SOURCE_PATH, 'utf-8'));
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

export const HTML_UA_STYLESHEET_TEXT = \`
${escapeTemplateLiteral(stylesheetText)}
\`;
`;

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output);
  console.log(`Generated ${OUTPUT_PATH} (${blocks.length} normative UA CSS blocks).`);
}

main();
