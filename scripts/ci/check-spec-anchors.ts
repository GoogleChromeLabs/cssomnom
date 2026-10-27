/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type ViolationRule =
  | 'RULE_A_FORBIDDEN_SECTION'
  | 'RULE_B_INVALID_ANCHOR'
  | 'RULE_C_RAW_SPEC_URL';

export interface SpecAnchorViolation {
  file: string;
  lineNumber: number;
  rule: ViolationRule;
  message: string;
  lineContent: string;
}

export interface CheckSpecAnchorsOptions {
  repoRoot?: string;
  srcDir?: string;
}

/**
 * Specs not vendored in submodules that are allowed to retain immutable section numbers
 * (e.g. RFCs, WebIDL, SVG2).
 */
const ALLOWED_EXTERNAL_SPECS_RE = /\b(rfc\s*4647|webidl|svg2?)\b/i;

interface SpecFileLocation {
  path: string;
  isHtml: boolean;
}

/**
 * Extracts anchors from a Bikeshed source specification (.bs or .src.html).
 */
function extractAnchorsFromBs(content: string): Set<string> {
  const anchors = new Set<string>();

  // 1. Explicit ID attributes: id="..." or id='...' or unquoted id=...
  const idRegex = /\bid=(?:["']([^"']+)["']|([a-zA-Z0-9_.:-]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = idRegex.exec(content)) !== null) {
    const val = m[1] || m[2];
    if (val) anchors.add(val.toLowerCase());
  }

  // 2. Bikeshed heading or inline anchor blocks: {#anchor}
  const headingAnchorRegex = /\{#([a-zA-Z0-9_.:()-]+)\}/g;
  while ((m = headingAnchorRegex.exec(content)) !== null) {
    anchors.add(m[1].toLowerCase());
  }

  // 3. Bikeshed oldids attribute: oldids="id1, id2"
  const oldidsRegex = /\boldids=["']([^"']+)["']/gi;
  while ((m = oldidsRegex.exec(content)) !== null) {
    for (const id of m[1].split(',')) {
      const trimmed = id.trim().toLowerCase();
      if (trimmed) anchors.add(trimmed);
    }
  }

  // 4. Bikeshed markdown headings without explicit ID
  const mdHeadingRegex = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/gm;
  while ((m = mdHeadingRegex.exec(content)) !== null) {
    let title = m[2].trim();
    const explicitMatch = /\{#([a-zA-Z0-9_.:()-]+)\}$/.exec(title);
    if (explicitMatch) {
      anchors.add(explicitMatch[1].toLowerCase());
      title = title.replace(/\{#([a-zA-Z0-9_.:()-]+)\}$/, '').trim();
    }
    title = title
      .replace(/\{\{([^}]+)\}\}/g, '$1')
      .replace(/''([^']+)''/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/\(.*?\)/g, '')
      .trim();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slug) anchors.add(slug);
    const noApos = title
      .replace(/'/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (noApos) anchors.add(noApos);
  }

  // 5. Underline-style headings: Title \n ===== or -----
  const underlineHeadingRegex = /^([^\n]+)\s+\{#([a-zA-Z0-9_.:()-]+)\}\s*\n[=-]{3,}$/gm;
  while ((m = underlineHeadingRegex.exec(content)) !== null) {
    anchors.add(m[2].toLowerCase());
  }

  // 6. Inherited definitions: <dl dfn-for="..." dfn-type="..."> or <div dfn-for="..." dfn-type="...">
  const dlRegex = /<(?:dl|div)\b([^>]*)>([\s\S]*?)<\/(?:dl|div)>/gi;
  while ((m = dlRegex.exec(content)) !== null) {
    const dlAttrs = m[1];
    const dlContent = m[2];
    const forMatch = /\bdfn-for=["']?([^"'>]+)["']?/i.exec(dlAttrs);
    const typeMatch = /\bdfn-type=["']?([^"'\s>]+)["']?/i.exec(dlAttrs);
    const forVals = forMatch ? forMatch[1].split(',').map((s) => s.trim().toLowerCase()) : [''];
    const typeVal = typeMatch ? typeMatch[1].toLowerCase() : '';

    if (forMatch && typeVal === 'attribute') {
      const dfnRegex = /<dfn\b[^>]*>([\s\S]*?)<\/dfn>/gi;
      let dm: RegExpExecArray | null;
      while ((dm = dfnRegex.exec(dlContent)) !== null) {
        const name = dm[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
        for (const forVal of forVals) {
          if (forVal) anchors.add(`dom-${forVal}-${name}`);
        }
      }
    }
  }

  // 7. Bikeshed <dfn> tags
  const dfnRegex = /<dfn\b([^>]*)>([\s\S]*?)<\/dfn>/gi;
  while ((m = dfnRegex.exec(content)) !== null) {
    const attrs = m[1];
    const rawInner = m[2].replace(/<[^>]+>/g, '').trim();
    const idMatch = /\bid=(?:["']([^"']+)["']|([a-zA-Z0-9_.:-]+))/i.exec(attrs);
    if (idMatch) {
      anchors.add((idMatch[1] || idMatch[2]).toLowerCase());
      continue;
    }
    const forMatch = /\bfor=["']?([^"'>]+)["']?/i.exec(attrs);
    const forVals = forMatch ? forMatch[1].split(',').map((s) => s.trim().toLowerCase()) : [''];
    let cleanInner = rawInner.replace(/\(.*?\)/g, '').trim().toLowerCase();
    let slotName: string | null = null;
    const slotMatch = /^\\?\[\[([a-zA-Z0-9_-]+)\]\]$/.exec(cleanInner);
    if (slotMatch) {
      slotName = slotMatch[1];
      cleanInner = slotMatch[1];
    }

    for (const forVal of forVals) {
      if (/\b(?:method|attribute|operation)\b/i.test(attrs) && forVal) {
        anchors.add(`dom-${forVal}-${cleanInner}`);
        if (slotName) {
          anchors.add(`dom-${forVal}-${slotName}-slot`);
        }
      } else if (/\bconstructor\b/i.test(attrs) && forVal) {
        anchors.add(`dom-${forVal}-${forVal}`);
      } else if (/\bproperty\b/i.test(attrs)) {
        anchors.add(`propdef-${cleanInner}`);
      } else if (/\bvalue\b/i.test(attrs) && forVal) {
        anchors.add(`valdef-${forVal}-${cleanInner}`);
      } else if (/\btype\b/i.test(attrs)) {
        anchors.add(`typedef-${cleanInner}`);
      } else if (/\bat-rule\b/i.test(attrs)) {
        anchors.add(`at-ruledef-${cleanInner}`);
      } else if (/\bfunction\b/i.test(attrs)) {
        anchors.add(`funcdef-${cleanInner}`);
      }
    }

    const ltMatch = /\blt=["']([^"']+)["']/i.exec(attrs);
    let terms = ltMatch ? ltMatch[1].split('|') : [rawInner];
    const expandedTerms: string[] = [];
    for (const t of terms) {
      expandedTerms.push(t);
      const linkMatch = /^\[=([\s\S]*?)=\]$/.exec(t.trim());
      if (linkMatch) {
        for (const sub of linkMatch[1].split('|')) {
          expandedTerms.push(sub.trim());
        }
      }
    }
    for (const term of expandedTerms) {
      const slug = term
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (slug) anchors.add(slug);
      const noApos = term
        .replace(/'/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (noApos) anchors.add(noApos);
    }
  }

  // 8. Bikeshed algorithm attributes: <div algorithm="name"> or <section algorithm="name">
  const algoRegex = /\balgorithm=["']([^"']+)["']/gi;
  while ((m = algoRegex.exec(content)) !== null) {
    const rawAlgo = m[1].trim();
    const slug = rawAlgo
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slug) anchors.add(slug);
    const directSlug = rawAlgo
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (directSlug) anchors.add(directSlug);
  }

  // 9. <pre class=propdef> and <pre class=descdef>
  const propdefRegex = /<pre\s+class=["']?(?:propdef|descdef)[^>]*>([\s\S]*?)<\/pre>/gi;
  while ((m = propdefRegex.exec(content)) !== null) {
    const isDesc = m[0].includes('descdef');
    const prefix = isDesc ? 'descdef-' : 'propdef-';
    const nameLine = m[1].split('\n').find((l) => /^\s*Name:\s*/i.test(l));
    if (nameLine) {
      const rawNames = nameLine.replace(/^\s*Name:\s*/i, '').trim();
      for (const p of rawNames.split(',')) {
        const slug = p.trim().toLowerCase();
        if (slug) anchors.add(`${prefix}${slug}`);
      }
    }
  }

  // 9. <pre class=idl> or <xmp class=idl>
  const idlRegex = /<(?:pre|xmp)\s+class=["']?idl["']?[^>]*>([\s\S]*?)<\/(?:pre|xmp)>/gi;
  while ((m = idlRegex.exec(content)) !== null) {
    const block = m[1];
    const nsMatch = /\bnamespace\s+([a-zA-Z0-9_-]+)/g;
    let nsm: RegExpExecArray | null;
    while ((nsm = nsMatch.exec(block)) !== null) {
      anchors.add(`namespacedef-${nsm[1].toLowerCase()}`);
    }
    const ifaceRegex = /\binterface\s+([a-zA-Z0-9_-]+)[^{]*\{([\s\S]*?)\};/g;
    let ifm: RegExpExecArray | null;
    while ((ifm = ifaceRegex.exec(block)) !== null) {
      const iface = ifm[1].toLowerCase();
      anchors.add(`dom-${iface}`);
      anchors.add(iface);
      const attrRegex = /\battribute\s+[^\s;]+\s+([a-zA-Z0-9_-]+)\s*;/g;
      let am: RegExpExecArray | null;
      while ((am = attrRegex.exec(ifm[2])) !== null) {
        anchors.add(`dom-${iface}-${am[1].toLowerCase()}`);
      }
    }
  }

  return anchors;
}

/**
 * Extracts anchors from WHATWG HTML source or processed HTML.
 */
function extractAnchorsFromHtml(content: string): Set<string> {
  const anchors = new Set<string>();

  // 1. Explicit id="..."
  const idRegex = /\bid=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = idRegex.exec(content)) !== null) {
    anchors.add(m[1].toLowerCase());
  }

  // 2. data-x attributes (used across WHATWG HTML)
  const dataXRegex = /\bdata-x=["']([^"']+)["']/gi;
  while ((m = dataXRegex.exec(content)) !== null) {
    anchors.add(m[1].toLowerCase());
  }

  // 3. Headings <h[1-6]...>...</h[1-6]>
  const headingRegex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  while ((m = headingRegex.exec(content)) !== null) {
    const raw = m[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
    const slug = raw.replace(/[^a-z0-9_:-]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) anchors.add(slug);
    const noColon = slug.replace(/:/g, '-');
    if (noColon) anchors.add(noColon);
  }

  // 4. <dfn ...>
  const dfnRegex = /<dfn\b([^>]*)>([\s\S]*?)<\/dfn>/gi;
  while ((m = dfnRegex.exec(content)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, '').trim().toLowerCase();
    const slug = text.replace(/[^a-z0-9_:-]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) anchors.add(slug);
  }

  return anchors;
}

/**
 * Caches discovered spec locations and parsed anchors.
 */
export class SpecAnchorRegistry {
  private repoRoot: string;
  private specLocations = new Map<string, SpecFileLocation>();
  private anchorCache = new Map<string, Set<string>>();

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.discoverSpecs();
  }

  private discoverSpecs() {
    const csswg = path.join(this.repoRoot, 'submodules/csswg-drafts');
    if (fs.existsSync(csswg)) {
      for (const ent of fs.readdirSync(csswg, { withFileTypes: true })) {
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
        const dir = path.join(csswg, ent.name);
        const loc = this.findSpecFileInDir(dir);
        if (loc) this.specLocations.set(ent.name.toLowerCase(), loc);
      }
    }

    const houdini = path.join(this.repoRoot, 'submodules/css-houdini-drafts');
    if (fs.existsSync(houdini)) {
      for (const ent of fs.readdirSync(houdini, { withFileTypes: true })) {
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
        const dir = path.join(houdini, ent.name);
        const loc = this.findSpecFileInDir(dir);
        if (loc) this.specLocations.set(ent.name.toLowerCase(), loc);
      }
    }

    const htmlSource = path.join(this.repoRoot, 'submodules/whatwg-html/source');
    if (fs.existsSync(htmlSource)) {
      this.specLocations.set('html', { path: htmlSource, isHtml: true });
    }
  }

  private findSpecFileInDir(dir: string): SpecFileLocation | null {
    const files = fs.readdirSync(dir);
    for (const f of ['Overview.bs', 'index.bs', 'Overview.src.html', 'Overview.html', 'index.html']) {
      if (files.includes(f)) {
        const fullPath = path.join(dir, f);
        const isHtml = f.endsWith('.html') && !f.endsWith('.src.html');
        if (isHtml) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.length < 2000 && /merged|moved/i.test(content)) {
              const redirectMatch = /href=["']https:\/\/drafts\.csswg\.org\/([^/]+)\//.exec(content);
              if (redirectMatch) {
                const target = redirectMatch[1].toLowerCase();
                const targetDir = path.join(path.dirname(dir), target);
                if (fs.existsSync(targetDir)) {
                  return this.findSpecFileInDir(targetDir);
                }
              }
            }
          } catch {}
        }
        return { path: fullPath, isHtml };
      }
    }
    const anyBs = files.find((f) => f.endsWith('.bs') || f.endsWith('.src.html'));
    if (anyBs) return { path: path.join(dir, anyBs), isHtml: false };
    return null;
  }

  public getCanonicalSpec(specName: string): string | null {
    const lower = specName.toLowerCase().trim();
    if (lower === 'css-shadow-parts' || lower === 'css-shadow-parts-1') {
      return 'css-shadow-1';
    }
    if (this.specLocations.has(lower)) {
      return lower;
    }
    if (lower.endsWith('-1')) {
      const base = lower.slice(0, -2);
      if (this.specLocations.has(base)) {
        return base;
      }
    }
    if (this.specLocations.has(`${lower}-1`)) {
      return `${lower}-1`;
    }
    return null;
  }

  public isVendoredSpec(specName: string): boolean {
    return this.getCanonicalSpec(specName) !== null;
  }

  public getAnchorsForSpec(specName: string): Set<string> | null {
    const canonical = this.getCanonicalSpec(specName);
    if (!canonical) return null;
    if (this.anchorCache.has(canonical)) {
      return this.anchorCache.get(canonical)!;
    }

    const loc = this.specLocations.get(canonical);
    if (!loc || !fs.existsSync(loc.path)) return null;

    const content = fs.readFileSync(loc.path, 'utf-8');
    const anchors = loc.isHtml ? extractAnchorsFromHtml(content) : extractAnchorsFromBs(content);
    this.anchorCache.set(canonical, anchors);
    return anchors;
  }
}

function findSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'gen') continue;
      results.push(...findSourceFiles(fullPath));
    } else if (entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Checks all TypeScript files in `src/` (excluding `src/data/gen/`) for:
 * 1. Rule A: Reject any forbidden section citations (§ or bare leading section numbers).
 * 2. Rule B: Every `<spec> #<anchor>` referencing a vendored spec must have `<anchor>` in the spec.
 * 3. Rule C: Reject raw drafts URLs.
 */
export function checkSpecAnchors(options?: CheckSpecAnchorsOptions): SpecAnchorViolation[] {
  const repoRoot = options?.repoRoot ?? process.cwd();
  const srcDir = options?.srcDir ?? path.join(repoRoot, 'src');
  const registry = new SpecAnchorRegistry(repoRoot);
  const violations: SpecAnchorViolation[] = [];

  const files = findSourceFiles(srcDir);

  const rawUrlRegex = /https?:\/\/drafts\.(?:csswg|css-houdini)\.org\/[^\s)>,]+/i;
  const bareSectionRegex = /^\s*(?:\/\/|\/\*|\*)\s*(\d+(?:\.\d+)+|\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s|$|:)/;
  const proseSpecRegex = /\b(css\s+[a-zA-Z][a-zA-Z0-9\s-]*|cssom\s+\d+|selectors\s+\d+|html\s+standard|media\s+queries\s+\d+)\s+(?:§[^\n#]+)?#([a-zA-Z][a-zA-Z0-9_.:()-]*)/gi;
  const genericCitationRegex = /(?:^|[\s,;(/])([a-zA-Z][a-zA-Z0-9-]*)\s+(?:§[^\n#]+)?#([a-zA-Z][a-zA-Z0-9_.:()-]*)/g;

  for (const filePath of files) {
    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isComment = line.includes('//') || line.includes('/*') || line.trimStart().startsWith('*');
      if (!isComment) continue;

      // 1. Raw spec draft URLs check (drafts.csswg.org or drafts.css-houdini.org)
      const rawUrlMatch = rawUrlRegex.exec(line);
      if (rawUrlMatch) {
        violations.push({
          file: relPath,
          lineNumber: i + 1,
          rule: 'RULE_C_RAW_SPEC_URL',
          message: `Raw drafts URL found in comment. Use anchor-first format '// <spec> #<anchor>' instead.`,
          lineContent: line.trim(),
        });
      }

      // 2. Bare leading section number comments (e.g. // 5.4.9 ... or // 10.1 ... or // 6.13 The CSS... or // 10 Mathematical...)
      const bareSectionMatch = bareSectionRegex.exec(line);
      if (bareSectionMatch) {
        violations.push({
          file: relPath,
          lineNumber: i + 1,
          rule: 'RULE_A_FORBIDDEN_SECTION',
          message: `Forbidden bare section number '${bareSectionMatch[1]}'. Use anchor-first format '// <spec> #<anchor>' per AGENTS.md.`,
          lineContent: line.trim(),
        });
      }

      // 3. Section symbol (§) check: any § is forbidden unless preceded by an allowed external spec (WebIDL, RFC 4647, SVG2)
      if (line.includes('§')) {
        let hasViolation = false;
        for (let charIdx = 0; charIdx < line.length; charIdx++) {
          if (line[charIdx] !== '§') continue;
          const before = line.slice(0, charIdx);
          const extMatch = [...before.matchAll(new RegExp(ALLOWED_EXTERNAL_SPECS_RE, 'gi'))].pop();
          if (!extMatch) {
            hasViolation = true;
            break;
          }
          // Verify no vendored spec exists between extMatch and §
          const between = before.slice(extMatch.index! + extMatch[0].length);
          const tokens = between.match(/\b[a-zA-Z][a-zA-Z0-9-]*\b/g);
          if (tokens?.some((t) => registry.isVendoredSpec(t))) {
            hasViolation = true;
            break;
          }
        }

        if (hasViolation) {
          violations.push({
            file: relPath,
            lineNumber: i + 1,
            rule: 'RULE_A_FORBIDDEN_SECTION',
            message: `Forbidden '§' section number on vendored spec citation. Use anchor-first format '// <spec> #<anchor>' per AGENTS.md.`,
            lineContent: line.trim(),
          });
        }
      }

      // 4. Prose spec names before #<anchor> (e.g. CSS Values 4 #lengths, Selectors 4 #...)
      proseSpecRegex.lastIndex = 0;
      let pm: RegExpExecArray | null;
      while ((pm = proseSpecRegex.exec(line)) !== null) {
        const proseSpec = pm[1].trim();
        const rawAnchor = pm[2].trim().replace(/[:);,.]+$/, '');
        violations.push({
          file: relPath,
          lineNumber: i + 1,
          rule: 'RULE_B_INVALID_ANCHOR',
          message: `Prose spec name '${proseSpec}' before '#${rawAnchor}' is forbidden. Use the canonical submodule directory shortname.`,
          lineContent: line.trim(),
        });
      }

      // 5. Generic citation check: `<token> #<anchor>`
      genericCitationRegex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = genericCitationRegex.exec(line)) !== null) {
        const rawSpec = m[1].trim();
        const rawAnchor = m[2].toLowerCase().replace(/[:);,.]+$/, '');

        if (ALLOWED_EXTERNAL_SPECS_RE.test(rawSpec)) {
          continue;
        }

        const canonical = registry.getCanonicalSpec(rawSpec);
        if (!canonical) {
          if (/^(?:css|cssom|selectors|mediaqueries)-/i.test(rawSpec) || rawSpec.toLowerCase() === 'html') {
            violations.push({
              file: relPath,
              lineNumber: i + 1,
              rule: 'RULE_B_INVALID_ANCHOR',
              message: `Unknown spec shortname '${rawSpec}'. Use the canonical submodule directory name.`,
              lineContent: line.trim(),
            });
          }
          continue;
        }

        const anchors = registry.getAnchorsForSpec(canonical);
        if (!anchors) {
          violations.push({
            file: relPath,
            lineNumber: i + 1,
            rule: 'RULE_B_INVALID_ANCHOR',
            message: `Could not load submodule spec source for '${rawSpec}' (canonical: '${canonical}').`,
            lineContent: line.trim(),
          });
          continue;
        }

        if (!anchors.has(rawAnchor)) {
          violations.push({
            file: relPath,
            lineNumber: i + 1,
            rule: 'RULE_B_INVALID_ANCHOR',
            message: `Anchor '#${rawAnchor}' not found in vendored spec '${canonical}'.`,
            lineContent: line.trim(),
          });
        }
      }
    }
  }

  return violations;
}

function main() {
  const startTime = Date.now();
  const violations = checkSpecAnchors();
  const duration = Date.now() - startTime;

  if (violations.length > 0) {
    console.error('\x1b[31m================================================================================');
    console.error(`❌ [SPEC-ANCHOR GUARD] ${violations.length} SPEC CITATION VIOLATION(S) DETECTED (${duration}ms):`);
    console.error('================================================================================\x1b[0m');
    for (const v of violations) {
      console.error(`  📁 ${v.file}:${v.lineNumber} [${v.rule}]`);
      console.error(`     ↳ ${v.lineContent}`);
      console.error(`     \x1b[33mError: ${v.message}\x1b[0m`);
    }
    console.error('\x1b[33m\nSpec citations must follow AGENTS.md:');
    console.error('  Use anchor-first format: // <spec> #<anchor>[: optional step/note]');
    console.error('  Never cite § section numbers for vendored specs in submodules/.');
    console.error('  Anchors must exist in the vendored spec source.\x1b[0m\n');
    process.exit(1);
  }

  console.log(`✔ [SPEC-ANCHOR GUARD] All spec citations conform to anchor-first policy (${duration}ms).`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}
