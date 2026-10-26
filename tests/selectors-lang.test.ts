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
import { parseStyleSheet, Parser } from '../src/parser.ts';
import { SelectorParser } from '../src/SelectorParser.ts';
import { tokenize } from '../src/tokenizer.ts';

function parseSelector(text: string) {
  const componentValues = new Parser(tokenize(text)).parseComponentValues();
  return new SelectorParser(componentValues, { allowRelative: true, forgiving: false }).parse();
}

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

  it('css3-selectors-lang-014: :lang(cs-CZ) matches lang="cs-Latn-CZ" (RFC 4647 extended filtering)', () => {
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

  it('css3-selectors-lang-016: :lang(es) matches xml:lang in XML document but not in HTML', () => {
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
    it(':lang(\\*-Latn) and :lang("*-Latn") match lang="de-Latn"', () => {
      const { document } = parseHTML('<div id="box" lang="de-Latn"></div>');
      const box = document.getElementById('box')!;
      assert.equal(matches(box, ':lang(\\*-Latn)'), true);
      assert.equal(matches(box, ':lang("*-Latn")'), true);
    });

    it(':lang(*-Latn) unquoted/unescaped wildcard range is invalid syntax', () => {
      assert.throws(() => parseSelector(':lang(*-Latn)'), /SyntaxError/);
    });

    it(':lang(fr) does not match lang="fr-ninechars" (subtag exceeds 8 chars per RFC 4647)', () => {
      const { document } = parseHTML('<div id="box" lang="fr-ninechars"></div>');
      const box = document.getElementById('box')!;
      assert.equal(matches(box, ':lang(fr)'), false);
    });

    it('lang-007: :lang("*-CH") matches lang="fr-CH"', () => {
      const { document } = parseHTML('<span lang="fr-CH"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("*-CH")'), true);
    });

    it('lang-008: :lang("*-Latn") matches lang="fr-Latn-FR"', () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("*-Latn")'), true);
    });

    it('lang-009: :lang("fr-FR") matches lang="fr-Latn-FR"', () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("fr-FR")'), true);
    });

    it('lang-010: :lang("*-FR") matches lang="fr-Latn-FR"', () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("*-FR")'), true);
    });

    it('lang-013: :lang(de, nl, 0, fr) is invalid syntax and drops rule (unforgiving)', () => {
      const { document } = parseHTML('<span lang="fr"></span>');
      const span = document.querySelector('span')!;
      assert.throws(() => parseSelector(':lang(de, nl, 0, fr)'), /SyntaxError/);
      assert.equal(matches(span, ':lang(de, nl, 0, fr)'), false);
      const rules = parseStyleSheet('div.test { color: green; } :lang(de, nl, 0, fr) { color: red; }');
      assert.equal(rules.length, 1);
    });

    it('lang-014: :lang(0) is invalid syntax and drops rule (unforgiving)', () => {
      const { document } = parseHTML('<span lang="0"></span>');
      const span = document.querySelector('span')!;
      assert.throws(() => parseSelector(':lang(0)'), /SyntaxError/);
      assert.equal(matches(span, ':lang(0)'), false);
      const rules = parseStyleSheet('div.test { color: green; } :lang(0) { color: red; }');
      assert.equal(rules.length, 1);
    });

    it('lang-015: :lang(\\*-FR) matches lang="fr-Latn-FR"', () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang(\\*-FR)'), true);
    });

    it('lang-017: :lang("fr-x-foobar") matches lang="fr-Latn-FR-x-foobar"', () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR-x-foobar"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("fr-x-foobar")'), true);
    });

    it('lang-018: :lang("*-x-foobar") matches lang="fr-Latn-FR-x-foobar"', () => {
      const { document } = parseHTML('<span lang="fr-Latn-FR-x-foobar"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("*-x-foobar")'), true);
    });

    it('lang-019: :lang("fr-x-foobar") does not match lang="fr"', () => {
      const { document } = parseHTML('<span lang="fr"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("fr-x-foobar")'), false);
    });

    it('lang-020: :lang("iw") matches lang="iw-ase-jpan-basiceng"', () => {
      const { document } = parseHTML('<span lang="iw-ase-jpan-basiceng"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("iw")'), true);
    });

    it('lang-021: :lang("en-gb-oed") and :lang("*-gb") match lang="en-GB-oed"', () => {
      const { document } = parseHTML('<div lang="en-GB-oed"><span><span></span></span></div>');
      const outer = document.querySelector('div')!;
      const span1 = outer.querySelector('span')!;
      const span2 = span1.querySelector('span')!;
      assert.equal(matches(span1, 'span:lang("en-gb-oed")'), true);
      assert.equal(matches(span2, ':lang("*-gb")'), true);
    });

    it('lang-022: :lang("i-navajo") matches lang="i-navajo"', () => {
      const { document } = parseHTML('<span lang="i-navajo"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("i-navajo")'), true);
    });

    it('lang-023: :lang("x") matches lang="x-lojban"', () => {
      const { document } = parseHTML('<span lang="x-lojban"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("x")'), true);
    });

    it('lang-024: :lang("art") matches lang="art-lojban"', () => {
      const { document } = parseHTML('<span lang="art-lojban"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("art")'), true);
    });

    it('lang-025: :lang("art") matches lang="art-x-lojban"', () => {
      const { document } = parseHTML('<span lang="art-x-lojban"></span>');
      const span = document.querySelector('span')!;
      assert.equal(matches(span, ':lang("art")'), true);
    });
  });

  describe('lang-singleton-subtag-matching.html WPT suite', () => {
    const html = `
      <div id="d1" lang="fr-x"></div>
      <div id="d2" lang="fr-x-standard"></div>
      <div id="d3" lang="fr-standard"></div>
      <div id="d4" lang="fr-ninechars"></div>
      <div id="d5" lang="cocoa-1-bar"></div>
      <div id="d6" lang="cocoa-a-bar"></div>
      <div id="d7" lang="en-x-private"></div>
      <div id="d8" lang="zh-x"></div>
      <div id="d9" lang="zh-x-foobar"></div>
    `;

    it(':lang(fr-x) matches lang="fr-x" and lang="fr-x-standard" (singleton "x" matches)', () => {
      const { document } = parseHTML(html);
      assert.equal(matches(document.getElementById('d1')!, ':lang(fr-x)'), true);
      assert.equal(matches(document.getElementById('d2')!, ':lang(fr-x)'), true);
      assert.equal(matches(document.getElementById('d3')!, ':lang(fr-x)'), false);
    });

    it(':lang(fr-standard) only matches lang="fr-standard" (not lang="fr-x-standard")', () => {
      const { document } = parseHTML(html);
      assert.equal(matches(document.getElementById('d3')!, ':lang(fr-standard)'), true);
      assert.equal(matches(document.getElementById('d2')!, ':lang(fr-standard)'), false);
    });

    it(':lang(fr) does not match lang="fr-ninechars" (subtag exceeds 8-char limit)', () => {
      const { document } = parseHTML(html);
      assert.equal(matches(document.getElementById('d1')!, ':lang(fr)'), true);
      assert.equal(matches(document.getElementById('d2')!, ':lang(fr)'), true);
      assert.equal(matches(document.getElementById('d3')!, ':lang(fr)'), true);
      assert.equal(matches(document.getElementById('d4')!, ':lang(fr)'), false);
    });

    it(':lang(cocoa-1) matches lang="cocoa-1-bar" (singleton "1" matches)', () => {
      const { document } = parseHTML(html);
      assert.equal(matches(document.getElementById('d5')!, ':lang(cocoa-1)'), true);
    });

    it(':lang(cocoa-a) matches lang="cocoa-a-bar" (singleton "a" matches)', () => {
      const { document } = parseHTML(html);
      assert.equal(matches(document.getElementById('d6')!, ':lang(cocoa-a)'), true);
    });

    it(':lang(cocoa-bar) does not match lang="cocoa-1-bar" (cannot skip past singleton "1")', () => {
      const { document } = parseHTML(html);
      assert.equal(matches(document.getElementById('d5')!, ':lang(cocoa-bar)'), false);
    });

    it(':lang(en-x) matches lang="en-x-private" (private-use singleton)', () => {
      const { document } = parseHTML(html);
      assert.equal(matches(document.getElementById('d7')!, ':lang(en-x)'), true);
    });

    it(':lang(zh-x) matches both lang="zh-x" and lang="zh-x-foobar"', () => {
      const { document } = parseHTML(html);
      assert.equal(matches(document.getElementById('d8')!, ':lang(zh-x)'), true);
      assert.equal(matches(document.getElementById('d9')!, ':lang(zh-x)'), true);
    });

    it(':lang(en-private) does not match lang="en-x-private" (cannot skip past singleton "x")', () => {
      const { document } = parseHTML(html);
      assert.equal(matches(document.getElementById('d7')!, ':lang(en-private)'), false);
    });
  });

  describe('Selectors 4 § 7.2 :lang("") and :lang("*") semantics', () => {
    it(':lang("") matches untagged elements and lang="", but not tagged elements', () => {
      const { document } = parseHTML('<div><span id="no-lang"></span><span id="empty-lang" lang=""></span><span id="tagged" lang="en"></span></div>');
      const noLang = document.getElementById('no-lang')!;
      const emptyLang = document.getElementById('empty-lang')!;
      const tagged = document.getElementById('tagged')!;

      assert.equal(matches(noLang, ':lang("")'), true);
      assert.equal(matches(emptyLang, ':lang("")'), true);
      assert.equal(matches(tagged, ':lang("")'), false);
    });

    it(':lang("*") matches tagged elements including lang="und", but not untagged', () => {
      const { document } = parseHTML('<div><span id="no-lang"></span><span id="empty-lang" lang=""></span><span id="und" lang="und"></span><span id="en" lang="en"></span></div>');
      const noLang = document.getElementById('no-lang')!;
      const emptyLang = document.getElementById('empty-lang')!;
      const und = document.getElementById('und')!;
      const en = document.getElementById('en')!;

      assert.equal(matches(noLang, ':lang("*")'), false);
      assert.equal(matches(emptyLang, ':lang("*")'), false);
      assert.equal(matches(und, ':lang("*")'), true);
      assert.equal(matches(en, ':lang("*")'), true);
    });

    it('meta http-equiv="content-language" provides document language fallback in HTML', () => {
      const { document } = parseHTML(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta http-equiv="content-language" content="invalid, en">
          <meta http-equiv="content-language" content="  ja zh  ">
        </head>
        <body><span id="fallback"></span></body>
        </html>
      `);
      const span = document.getElementById('fallback')!;
      // First meta contains comma so it is skipped; second meta extracts up to first whitespace ("ja")
      assert.equal(matches(span, ':lang(ja)'), true);
      assert.equal(matches(span, ':lang(zh)'), false);
    });

    it('HTML Standard Step 1: attribute in XML namespace applies in HTML and overrides lang in no namespace', () => {
      const { document } = parseHTML('<div id="el" lang="en"></div>');
      const el = document.getElementById('el')!;
      // Linkedom lacks attribute namespace support; mock DOM Level 2 NS methods on the element
      el.hasAttributeNS = (ns, localName) => ns === 'http://www.w3.org/XML/1998/namespace' && localName === 'lang';
      el.getAttributeNS = (ns, localName) => (ns === 'http://www.w3.org/XML/1998/namespace' && localName === 'lang' ? 'es' : null);
      assert.equal(matches(el, ':lang(es)'), true);
      assert.equal(matches(el, ':lang(en)'), false);
    });

    it('HTML Standard Step 3: element inside shadow root inherits language from shadow host', () => {
      const { document } = parseHTML('<div id="host" lang="de"></div>');
      const host = document.getElementById('host')!;
      const shadow = host.attachShadow({ mode: 'open' });
      const inner = document.createElement('span');
      shadow.appendChild(inner);

      assert.equal(matches(inner, ':lang(de)'), true);
      assert.equal(matches(inner, ':lang(en)'), false);
    });
  });
});
