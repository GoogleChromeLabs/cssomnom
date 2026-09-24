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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { matches } from '../src/index.ts';

describe('CSS Selectors 4 - :lang() Matching & RFC 4647 (css3-selectors-lang-*.html)', () => {
  it('css3-selectors-lang-001: :lang(es) matches lang="es"', () => {
    const { document } = parseHTML('<div id="box" lang="es"></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(es)'), true);
  });

  it('css3-selectors-lang-002: :lang(es) matches lang="es" on parent', () => {
    const { document } = parseHTML('<div lang="es"><div id="box"></div></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(es)'), true);
  });

  it('css3-selectors-lang-004: :lang(es) matches lang="ES" (case insensitivity)', () => {
    const { document } = parseHTML('<div id="box" lang="ES"></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(es)'), true);
  });

  it('css3-selectors-lang-005: :lang(es) matches lang="es-MX"', () => {
    const { document } = parseHTML('<div id="box" lang="es-MX"></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(es)'), true);
  });

  it('css3-selectors-lang-006: :lang(es-MX) does not match lang="es"', () => {
    const { document } = parseHTML('<div id="box" lang="es"></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(es-MX)'), false);
  });

  it('css3-selectors-lang-007: :lang(es-MX) does not match lang="mx-es"', () => {
    const { document } = parseHTML('<div id="box" lang="mx-es"></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(es-MX)'), false);
  });

  it('css3-selectors-lang-008: :lang(en-GB) matches lang="en-GB"', () => {
    const { document } = parseHTML('<div id="box" lang="en-GB"></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(en-GB)'), true);
  });

  it('css3-selectors-lang-009: :lang(en-GB) matches lang="en-GB-scouse"', () => {
    const { document } = parseHTML('<div id="box" lang="en-GB-scouse"></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(en-GB)'), true);
  });

  it('css3-selectors-lang-010: :lang(en-GB) does not match lang="en-US"', () => {
    const { document } = parseHTML('<div id="box" lang="en-US"></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(en-GB)'), false);
  });

  it('css3-selectors-lang-011: :lang(az-Arab-IR) matches lang="az-Arab-IR"', () => {
    const { document } = parseHTML('<div id="box" lang="az-Arab-IR"></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(az-Arab-IR)'), true);
  });

  it('css3-selectors-lang-012: :lang(az-Arab-IR) does not match lang="az-IR"', () => {
    const { document } = parseHTML('<div id="box" lang="az-IR"></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(az-Arab-IR)'), false);
  });

  it('css3-selectors-lang-014: :lang(cs-CZ) matches lang="cs-Latn-CZ" (RFC 4647 extended filtering)', { todo: 'css :lang() RFC 4647 extended filtering with script subtags' }, () => {
    const { document } = parseHTML('<div id="box" lang="cs-Latn-CZ"></div>');
    const box = document.getElementById('box')!;
    // Selectors 4 § 7.2 requires RFC 4647 extended filtering where language range cs-CZ matches tag cs-Latn-CZ
    assert.equal(matches(box, '#box:lang(cs-CZ)'), true);
  });

  it('css3-selectors-lang-015: :lang(az-Arab-IR) matches lang="az-arab-IR" (case insensitivity)', () => {
    const { document } = parseHTML('<div id="box" lang="az-arab-IR"></div>');
    const box = document.getElementById('box')!;
    assert.equal(matches(box, '#box:lang(az-Arab-IR)'), true);
  });

  it('css3-selectors-lang-016: :lang(es) matches xml:lang in XML document but not in HTML', { todo: 'css :lang() xml:lang attribute handling in XML documents' }, () => {
    const { document } = parseHTML('<div id="box" xml:lang="es"></div>');
    const box = document.getElementById('box')!;
    // In HTML documents, xml:lang is ignored for :lang() matching (only lang attribute is used)
    assert.equal(matches(box, '#box:lang(es)'), false);
  });

  describe('Control test #colonlangcontroltest:lang(xx) across 24 WPT suites', () => {
    // Tests 004 through 016, 024 through 036 contain #colonlangcontroltest
    const controlSuites = [
      'css3-selectors-lang-004', 'css3-selectors-lang-005', 'css3-selectors-lang-006',
      'css3-selectors-lang-007', 'css3-selectors-lang-008', 'css3-selectors-lang-009',
      'css3-selectors-lang-010', 'css3-selectors-lang-011', 'css3-selectors-lang-012',
      'css3-selectors-lang-014', 'css3-selectors-lang-015', 'css3-selectors-lang-016',
      'css3-selectors-lang-024', 'css3-selectors-lang-025', 'css3-selectors-lang-026',
      'css3-selectors-lang-027', 'css3-selectors-lang-028', 'css3-selectors-lang-029',
      'css3-selectors-lang-030', 'css3-selectors-lang-031', 'css3-selectors-lang-032',
      'css3-selectors-lang-034', 'css3-selectors-lang-035', 'css3-selectors-lang-036',
    ];

    for (const suite of controlSuites) {
      it(`${suite}: #colonlangcontroltest matches :lang(xx)`, () => {
        const { document } = parseHTML('<p lang="xx" id="colonlangcontroltest"></p>');
        const el = document.getElementById('colonlangcontroltest')!;
        assert.equal(matches(el, '#colonlangcontroltest:lang(xx)'), true);
      });
    }
  });

  describe('RFC 4647 extended filtering edge cases and wildcards', () => {
    it(':lang(*-Latn) wildcard language range matches lang="de-Latn"', { todo: 'css :lang() wildcard ranges (*-Latn)' }, () => {
      const { document } = parseHTML('<div id="box" lang="de-Latn"></div>');
      const box = document.getElementById('box')!;
      assert.equal(matches(box, ':lang(*-Latn)'), true);
    });

    it(':lang(fr) does not match lang="fr-ninechars" (subtag exceeds 8 chars per RFC 4647)', { todo: 'css :lang() RFC 4647 8-character subtag limit' }, () => {
      const { document } = parseHTML('<div id="box" lang="fr-ninechars"></div>');
      const box = document.getElementById('box')!;
      assert.equal(matches(box, ':lang(fr)'), false);
    });

    it('lang-007: :lang("*-CH") matches lang="fr-CH"', { todo: 'css :lang() wildcard ranges (*-CH)' }, () => {
      const { document } = parseHTML('<span lang="fr-CH"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("*-CH")'), true);
    });

    it('lang-008: :lang("*-Latn") matches lang="fr-Latn-FR"', { todo: 'css :lang() wildcard ranges (*-Latn)' }, () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("*-Latn")'), true);
    });

    it('lang-009: :lang("fr-FR") matches lang="fr-Latn-FR"', { todo: 'css :lang() RFC 4647 extended filtering with script subtags' }, () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("fr-FR")'), true);
    });

    it('lang-010: :lang("*-FR") matches lang="fr-Latn-FR"', { todo: 'css :lang() wildcard ranges (*-FR)' }, () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("*-FR")'), true);
    });

    it('lang-013: :lang(de, nl, 0, fr) matches lang="fr" (syntax resilience)', { todo: 'css :lang() argument list parsing' }, () => {
      const { document } = parseHTML('<span lang="fr"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang(de, nl, 0, fr)'), true);
    });

    it('lang-014: :lang(0) matches lang="0"', { todo: 'css :lang() number/ident argument parsing' }, () => {
      const { document } = parseHTML('<span lang="0"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang(0)'), true);
    });

    it('lang-015: :lang(\\*-FR) matches lang="fr-Latn-FR"', { todo: 'css :lang() escaped wildcard range' }, () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang(\\*-FR)'), true);
    });

    it('lang-017: :lang("fr-x-foobar") matches lang="fr-Latn-FR-x-foobar"', { todo: 'css :lang() RFC 4647 extended filtering with private-use' }, () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR-x-foobar"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("fr-x-foobar")'), true);
    });

    it('lang-018: :lang("*-x-foobar") matches lang="fr-Latn-FR-x-foobar"', { todo: 'css :lang() wildcard ranges (*-x-foobar)' }, () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR-x-foobar"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("*-x-foobar")'), true);
    });
  });
});
