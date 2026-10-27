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

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkSpecAnchors } from '../scripts/ci/check-spec-anchors.ts';

describe('check-spec-anchors CI validator', () => {
  it('reports zero violations on the codebase', () => {
    const violations = checkSpecAnchors();
    if (violations.length > 0) {
      const details = violations.map((v) => `${v.file}:${v.lineNumber} [${v.rule}] ${v.message} (${v.lineContent})`).join('\n');
      assert.fail(`Expected 0 violations on codebase, but found ${violations.length}:\n${details}`);
    }
    assert.equal(violations.length, 0);
  });

  describe('Rule A: Forbidden section citations', () => {
    let tempDir: string;

    before(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-anchor-test-'));
    });

    after(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('rejects section numbers (§) on vendored specs', () => {
      const fixtureFile = path.join(tempDir, 'invalid-section.ts');
      fs.writeFileSync(
        fixtureFile,
        `// cssom-1 § 6.5.3 #insert-a-css-rule\nconst x = 1;\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir });
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, 'RULE_A_FORBIDDEN_SECTION');
      assert.match(violations[0].lineContent, /cssom-1 § 6\.5\.3/);
    });

    it('rejects section numbers (§) with prose spec aliases', () => {
      const fixtureFile = path.join(tempDir, 'invalid-prose-section.ts');
      fs.writeFileSync(
        fixtureFile,
        `// CSS Selectors 4 § 7.2 :lang()\nconst x = 1;\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir });
      const violation = violations.find((v) => v.file.includes('invalid-prose-section'));
      assert.ok(violation);
      assert.equal(violation.rule, 'RULE_A_FORBIDDEN_SECTION');
    });

    it('rejects bare section numbers without spec prefix', () => {
      const fixtureFile = path.join(tempDir, 'bare-section.ts');
      fs.writeFileSync(
        fixtureFile,
        `// 5.4.9 Consume a declaration\n// 10 Mathematical Expressions\nconst x = 1;\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir }).filter((v) => v.file.includes('bare-section'));
      assert.equal(violations.length, 2);
      assert.equal(violations[0].rule, 'RULE_A_FORBIDDEN_SECTION');
      assert.equal(violations[1].rule, 'RULE_A_FORBIDDEN_SECTION');
    });

    it('rejects bare § section numbers without spec prefix', () => {
      const fixtureFile = path.join(tempDir, 'bare-section-symbol.ts');
      fs.writeFileSync(
        fixtureFile,
        `// § 6.7.1 Something\nconst x = 1;\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir }).filter((v) => v.file.includes('bare-section-symbol'));
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, 'RULE_A_FORBIDDEN_SECTION');
    });

    it('allows immutable external RFC, WebIDL, and SVG2 section citations', () => {
      const fixtureFile = path.join(tempDir, 'valid-external.ts');
      fs.writeFileSync(
        fixtureFile,
        `// RFC 4647 § 3.3.2 Extended Filtering\n// WebIDL § 3.6 #es-attributes\n// svg2 § 13.2 #presentation-attributes\nconst ok = true;\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir }).filter((v) => v.file.includes('valid-external'));
      assert.equal(violations.length, 0);
    });

    it('rejects section numbers (§) when vendored spec appears after external spec name with filler words', () => {
      const fixtureFile = path.join(tempDir, 'mixed-specs.ts');
      fs.writeFileSync(
        fixtureFile,
        `// rfc4647 § 3.3.2 and css-values-4 § 5.1\nconst x = 1;\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir }).filter((v) => v.file.includes('mixed-specs'));
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, 'RULE_A_FORBIDDEN_SECTION');
    });
  });

  describe('Rule B: Submodule anchor validation', () => {
    let tempDir: string;

    before(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-anchor-rule-b-'));
    });

    after(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('accepts valid anchors in Bikeshed specs', () => {
      const fixtureFile = path.join(tempDir, 'valid-anchors.ts');
      fs.writeFileSync(
        fixtureFile,
        `// cssom-1 #insert-a-css-rule\n// css-syntax-3 #consume-token\n// html #case-sensitivity-of-selectors\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir });
      assert.equal(violations.length, 0);
    });

    it('rejects invalid or hallucinated anchors in vendored specs', () => {
      const fixtureFile = path.join(tempDir, 'invalid-anchor.ts');
      fs.writeFileSync(
        fixtureFile,
        `// cssom-1 #non-existent-hallucinated-anchor-12345\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir });
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, 'RULE_B_INVALID_ANCHOR');
      assert.match(violations[0].message, /non-existent-hallucinated-anchor-12345/);
    });

    it('rejects unknown or unvendored spec shortnames', () => {
      const fixtureFile = path.join(tempDir, 'unknown-spec.ts');
      fs.writeFileSync(
        fixtureFile,
        `// css-unknown-spec-99 #some-anchor\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir }).filter((v) => v.file.includes('unknown-spec'));
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, 'RULE_B_INVALID_ANCHOR');
      assert.match(violations[0].message, /Unknown spec shortname/);
    });

    it('rejects prose spec titles before anchor', () => {
      const fixtureFile = path.join(tempDir, 'prose-spec-title.ts');
      fs.writeFileSync(
        fixtureFile,
        `// CSS Values 4 #lengths\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir }).filter((v) => v.file.includes('prose-spec-title'));
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, 'RULE_B_INVALID_ANCHOR');
      assert.match(violations[0].message, /Prose spec name.*before.*is forbidden/);
    });
  });

  describe('Rule C: Raw spec URLs', () => {
    let tempDir: string;

    before(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-anchor-rule-c-'));
    });

    after(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('rejects raw drafts.csswg.org URLs', () => {
      const fixtureFile = path.join(tempDir, 'raw-url.ts');
      fs.writeFileSync(
        fixtureFile,
        `* @see https://drafts.csswg.org/css-syntax-3/#tokenization\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir }).filter((v) => v.file.includes('raw-url'));
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, 'RULE_C_RAW_SPEC_URL');
      assert.match(violations[0].message, /Raw drafts URL found/);
    });

    it('rejects raw drafts.css-houdini.org URLs', () => {
      const fixtureFile = path.join(tempDir, 'raw-houdini-url.ts');
      fs.writeFileSync(
        fixtureFile,
        `// https://drafts.css-houdini.org/css-typed-om-1/#numeric-value\n`,
        'utf-8'
      );

      const violations = checkSpecAnchors({ srcDir: tempDir }).filter((v) => v.file.includes('raw-houdini-url'));
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, 'RULE_C_RAW_SPEC_URL');
    });
  });
});
