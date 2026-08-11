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
import { test } from 'node:test';
import assert from 'node:assert';
import { parseHTML } from 'linkedom';
import { matches, querySelectorAll } from '../src/matcher.ts';

test('Matcher: Type and Universal selectors', () => {
  const { document } = parseHTML('<div><span></span><p></p></div>');
  const div = document.querySelector('div')!;
  const span = document.querySelector('span')!;

  assert.strictEqual(matches(div, 'div'), true);
  assert.strictEqual(matches(div, 'DIV'), true); // case-insensitive for HTML
  assert.strictEqual(matches(div, 'span'), false);
  assert.strictEqual(matches(span, '*'), true);
  assert.strictEqual(matches(div, '*'), true);
});

test('Matcher: ID and Class selectors', () => {
  const { document } = parseHTML('<div id="main" class="foo bar baz"></div>');
  const div = document.querySelector('div')!;

  assert.strictEqual(matches(div, '#main'), true);
  assert.strictEqual(matches(div, '#other'), false);
  assert.strictEqual(matches(div, '.foo'), true);
  assert.strictEqual(matches(div, '.bar'), true);
  assert.strictEqual(matches(div, '.qux'), false);
  assert.strictEqual(matches(div, 'div#main.foo.bar'), true);
  assert.strictEqual(matches(div, 'div#main.qux'), false);
});

test('Matcher: Attribute selectors and operators', () => {
  const { document } = parseHTML(`
    <input type="text" name="user-name" data-val="12345" lang="en-US" title="Hello World">
  `);
  const input = document.querySelector('input')!;

  // [attr]
  assert.strictEqual(matches(input, '[type]'), true);
  assert.strictEqual(matches(input, '[disabled]'), false);

  // [attr=val]
  assert.strictEqual(matches(input, '[type="text"]'), true);
  assert.strictEqual(matches(input, '[type="TEXT" i]'), true);
  assert.strictEqual(matches(input, '[type="TEXT" s]'), false);

  // [attr~=val]
  assert.strictEqual(matches(input, '[title~="Hello"]'), true);
  assert.strictEqual(matches(input, '[title~="World"]'), true);
  assert.strictEqual(matches(input, '[title~="Foo"]'), false);

  // [attr|=val]
  assert.strictEqual(matches(input, '[lang|="en"]'), true);
  assert.strictEqual(matches(input, '[lang|="en-US"]'), true);
  assert.strictEqual(matches(input, '[lang|="fr"]'), false);

  // [attr^=val]
  assert.strictEqual(matches(input, '[name^="user"]'), true);
  assert.strictEqual(matches(input, '[name^="name"]'), false);

  // [attr$=val]
  assert.strictEqual(matches(input, '[name$="name"]'), true);
  assert.strictEqual(matches(input, '[name$="user"]'), false);

  // [attr*=val]
  assert.strictEqual(matches(input, '[data-val*="234"]'), true);
  assert.strictEqual(matches(input, '[data-val*="999"]'), false);
});

test('Matcher: Combinators (child, adjacent sibling, subsequent sibling, descendant)', () => {
  const { document } = parseHTML(`
    <div id="root">
      <ul id="list">
        <li id="item1" class="first"><span>Item 1</span></li>
        <li id="item2"><span>Item 2</span></li>
        <li id="item3"><a href="#">Item 3</a></li>
      </ul>
      <p id="p1">Para 1</p>
      <p id="p2">Para 2</p>
    </div>
  `);
  const list = document.getElementById('list')!;
  const item1 = document.getElementById('item1')!;
  const item2 = document.getElementById('item2')!;
  const item3 = document.getElementById('item3')!;
  const span1 = item1.querySelector('span')!;
  const p1 = document.getElementById('p1')!;
  const p2 = document.getElementById('p2')!;

  // Descendant: " "
  assert.strictEqual(matches(span1, 'div span'), true);
  assert.strictEqual(matches(span1, '#root li span'), true);
  assert.strictEqual(matches(p1, 'ul p'), false);

  // Child: ">"
  assert.strictEqual(matches(list, '#root > ul'), true);
  assert.strictEqual(matches(span1, '#root > span'), false);
  assert.strictEqual(matches(span1, 'li > span'), true);

  // Next-sibling: "+"
  assert.strictEqual(matches(item2, '#item1 + #item2'), true);
  assert.strictEqual(matches(item3, '#item1 + #item3'), false);
  assert.strictEqual(matches(p1, 'ul + p'), true);

  // Subsequent-sibling: "~"
  assert.strictEqual(matches(item3, '#item1 ~ #item3'), true);
  assert.strictEqual(matches(p2, 'ul ~ p'), true);
  assert.strictEqual(matches(item1, 'ul ~ li'), false);
});

test('Matcher: Pseudo-classes (:is, :where, :not)', () => {
  const { document } = parseHTML(`
    <article id="art" class="featured">
      <section class="body">
        <p class="lead">Intro</p>
      </section>
    </article>
  `);
  const art = document.getElementById('art')!;
  const p = document.querySelector('p')!;

  assert.strictEqual(matches(art, ':is(.featured, .empty)'), true);
  assert.strictEqual(matches(art, ':where(.empty, .highlight)'), false);
  assert.strictEqual(matches(art, ':not(.archived)'), true);
  assert.strictEqual(matches(art, ':not(.featured)'), false);
  assert.strictEqual(matches(p, ':is(article, div) p.lead'), true);
});

test('Matcher: :has() with relative and descendant selectors', () => {
  const { document } = parseHTML(`
    <div id="card1" class="card">
      <h2>Title 1</h2>
      <p class="desc">Desc 1</p>
    </div>
    <div id="card2" class="card">
      <p class="desc">Desc 2</p>
    </div>
    <div id="card3" class="card">
      <button class="action">Click</button>
    </div>
  `);
  const card1 = document.getElementById('card1')!;
  const card2 = document.getElementById('card2')!;
  const card3 = document.getElementById('card3')!;

  assert.strictEqual(matches(card1, '.card:has(h2)'), true);
  assert.strictEqual(matches(card2, '.card:has(h2)'), false);
  assert.strictEqual(matches(card1, '.card:has(> h2)'), true);
  assert.strictEqual(matches(card1, '.card:has(h2 + p)'), true);
  assert.strictEqual(matches(card2, '.card:has(button)'), false);
  assert.strictEqual(matches(card3, '.card:has(button.action)'), true);
});

test('Matcher: Structural and Indexed pseudo-classes', () => {
  const { document } = parseHTML(`
    <div id="parent">
      <h1>Heading</h1>
      <p id="first-p" class="item">P 1</p>
      <p id="second-p" class="item">P 2</p>
      <div id="div-child">Div</div>
      <p id="third-p" class="item">P 3</p>
      <span id="only-span">Span</span>
    </div>
    <div id="empty-div"></div>
    <div id="single-parent"><span id="only-child-span">Only</span></div>
  `);
  const firstP = document.getElementById('first-p')!;
  const secondP = document.getElementById('second-p')!;
  const thirdP = document.getElementById('third-p')!;
  const onlySpan = document.getElementById('only-span')!;
  const emptyDiv = document.getElementById('empty-div')!;
  const onlyChildSpan = document.getElementById('only-child-span')!;

  assert.strictEqual(matches(document.documentElement, ':root'), true);
  assert.strictEqual(matches(emptyDiv, ':empty'), true);
  assert.strictEqual(matches(firstP, ':empty'), false);

  assert.strictEqual(matches(onlyChildSpan, ':only-child'), true);
  assert.strictEqual(matches(firstP, ':only-child'), false);

  assert.strictEqual(matches(onlySpan, ':only-of-type'), true);
  assert.strictEqual(matches(firstP, ':first-of-type'), true);
  assert.strictEqual(matches(thirdP, ':last-of-type'), true);

  // :nth-child(An+B)
  assert.strictEqual(matches(firstP, ':nth-child(2)'), true); // parent has h1 as child 1
  assert.strictEqual(matches(firstP, ':nth-child(odd)'), false);
  assert.strictEqual(matches(firstP, ':nth-child(even)'), true);

  // :nth-child(An+B of <selector-list>)
  assert.strictEqual(matches(firstP, ':nth-child(1 of p.item)'), true);
  assert.strictEqual(matches(secondP, ':nth-child(2 of p.item)'), true);
  assert.strictEqual(matches(thirdP, ':nth-child(3 of p.item)'), true);
  assert.strictEqual(matches(thirdP, ':nth-last-child(1 of p.item)'), true);

  // :nth-of-type(An+B)
  assert.strictEqual(matches(firstP, ':nth-of-type(1)'), true);
  assert.strictEqual(matches(secondP, ':nth-of-type(2)'), true);
  assert.strictEqual(matches(thirdP, ':nth-of-type(3)'), true);
});

test('Matcher: :dir() and :heading() pseudo-classes', () => {
  const { document } = parseHTML(`
    <div id="ltr-box" dir="ltr">
      <h1>Title</h1>
      <h2>Subtitle</h2>
      <p dir="rtl">Hebrew text</p>
    </div>
  `);
  const ltrBox = document.getElementById('ltr-box')!;
  const h1 = document.querySelector('h1')!;
  const h2 = document.querySelector('h2')!;
  const p = document.querySelector('p')!;

  assert.strictEqual(matches(ltrBox, ':dir(ltr)'), true);
  assert.strictEqual(matches(p, ':dir(rtl)'), true);
  assert.strictEqual(matches(h1, ':heading'), true);
  assert.strictEqual(matches(h1, ':heading(1)'), true);
  assert.strictEqual(matches(h1, ':heading(2)'), false);
  assert.strictEqual(matches(h2, ':heading(1, 2)'), true);
});

test('Matcher: querySelectorAll', () => {
  const { document } = parseHTML(`
    <div id="container">
      <div class="row"><span class="badge">1</span></div>
      <div class="row"><span class="badge">2</span></div>
      <div class="row"><span>3</span></div>
    </div>
  `);
  const container = document.getElementById('container')!;

  const rows = querySelectorAll(container, '.row');
  assert.strictEqual(rows.length, 3);

  const badges = querySelectorAll(container, '.row > span.badge');
  assert.strictEqual(badges.length, 2);
});
