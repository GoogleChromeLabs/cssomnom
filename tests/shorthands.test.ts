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
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CSSStyleDeclaration } from '../src/index.ts';

describe('CSSStyleDeclaration Shorthands', () => {
  test('margin expansion', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('margin', '10px');
    assert.strictEqual(style.getPropertyValue('margin-top'), '10px');
    assert.strictEqual(style.getPropertyValue('margin-right'), '10px');
    assert.strictEqual(style.getPropertyValue('margin-bottom'), '10px');
    assert.strictEqual(style.getPropertyValue('margin-left'), '10px');
    assert.strictEqual(style.getPropertyValue('margin'), '10px');
  });

  test('margin 2 values', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('margin', '10px 20px');
    assert.strictEqual(style.getPropertyValue('margin-top'), '10px');
    assert.strictEqual(style.getPropertyValue('margin-right'), '20px');
    assert.strictEqual(style.getPropertyValue('margin-bottom'), '10px');
    assert.strictEqual(style.getPropertyValue('margin-left'), '20px');
    assert.strictEqual(style.getPropertyValue('margin'), '10px 20px');
  });

  test('margin contraction', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('margin-top', '10px');
    style.setProperty('margin-right', '10px');
    style.setProperty('margin-bottom', '10px');
    style.setProperty('margin-left', '10px');
    assert.strictEqual(style.getPropertyValue('margin'), '10px');

    style.setProperty('margin-right', '20px');
    assert.strictEqual(style.getPropertyValue('margin'), '10px 20px 10px 10px');

    style.setProperty('margin-left', '20px');
    assert.strictEqual(style.getPropertyValue('margin'), '10px 20px');
  });

  test('padding expansion', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('padding', '5px 10px 15px 20px');
    assert.strictEqual(style.getPropertyValue('padding-top'), '5px');
    assert.strictEqual(style.getPropertyValue('padding-right'), '10px');
    assert.strictEqual(style.getPropertyValue('padding-bottom'), '15px');
    assert.strictEqual(style.getPropertyValue('padding-left'), '20px');
    assert.strictEqual(style.getPropertyValue('padding'), '5px 10px 15px 20px');
  });

  test('intervening declarations prevent shorthand combination', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('margin-inline-start', '10px');
    style.setProperty('margin-top', '20px');
    style.setProperty('margin-inline-end', '10px');
    
    const cssText = style.cssText;
    assert.ok(cssText.includes('margin-inline-start: 10px'));
    assert.ok(cssText.includes('margin-inline-end: 10px'));
  });

  test('border-radius expansion', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('border-radius', '10px');
    assert.strictEqual(style.getPropertyValue('border-top-left-radius'), '10px');
    assert.strictEqual(style.getPropertyValue('border-top-right-radius'), '10px');
    assert.strictEqual(style.getPropertyValue('border-bottom-right-radius'), '10px');
    assert.strictEqual(style.getPropertyValue('border-bottom-left-radius'), '10px');
    assert.strictEqual(style.getPropertyValue('border-radius'), '10px');
  });

  test('border-radius expansion with /', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('border-radius', '10px 20px / 30px 40px');
    assert.strictEqual(style.getPropertyValue('border-top-left-radius'), '10px 30px');
    assert.strictEqual(style.getPropertyValue('border-top-right-radius'), '20px 40px');
    assert.strictEqual(style.getPropertyValue('border-bottom-right-radius'), '10px 30px');
    assert.strictEqual(style.getPropertyValue('border-bottom-left-radius'), '20px 40px');
    assert.strictEqual(style.getPropertyValue('border-radius'), '10px 20px / 30px 40px');
  });

  test('border-radius disallows logical keyword', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('border-radius', 'logical 10px');
    assert.strictEqual(style.getPropertyValue('border-top-left-radius'), '');
    assert.strictEqual(style.getPropertyValue('border-radius'), '');
  });

  test('scroll-margin expansion', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('scroll-margin', '10px 20px 30px 40px');
    assert.strictEqual(style.getPropertyValue('scroll-margin-top'), '10px');
    assert.strictEqual(style.getPropertyValue('scroll-margin-right'), '20px');
    assert.strictEqual(style.getPropertyValue('scroll-margin-bottom'), '30px');
    assert.strictEqual(style.getPropertyValue('scroll-margin-left'), '40px');
    assert.strictEqual(style.getPropertyValue('scroll-margin'), '10px 20px 30px 40px');
  });

  test('scroll-padding expansion', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('scroll-padding', '5px 10px');
    assert.strictEqual(style.getPropertyValue('scroll-padding-top'), '5px');
    assert.strictEqual(style.getPropertyValue('scroll-padding-right'), '10px');
    assert.strictEqual(style.getPropertyValue('scroll-padding-bottom'), '5px');
    assert.strictEqual(style.getPropertyValue('scroll-padding-left'), '10px');
    assert.strictEqual(style.getPropertyValue('scroll-padding'), '5px 10px');
  });

  test('border expansion', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('border', '1px solid red');
    assert.strictEqual(style.getPropertyValue('border-top-width'), '1px');
    assert.strictEqual(style.getPropertyValue('border-top-style'), 'solid');
    assert.strictEqual(style.getPropertyValue('border-top-color'), 'red');
    assert.strictEqual(style.getPropertyValue('border-right-width'), '1px');
    assert.strictEqual(style.getPropertyValue('border-right-style'), 'solid');
    assert.strictEqual(style.getPropertyValue('border-right-color'), 'red');
    assert.strictEqual(style.getPropertyValue('border-bottom-width'), '1px');
    assert.strictEqual(style.getPropertyValue('border-bottom-style'), 'solid');
    assert.strictEqual(style.getPropertyValue('border-bottom-color'), 'red');
    assert.strictEqual(style.getPropertyValue('border-left-width'), '1px');
    assert.strictEqual(style.getPropertyValue('border-left-style'), 'solid');
    assert.strictEqual(style.getPropertyValue('border-left-color'), 'red');
    assert.strictEqual(style.getPropertyValue('border'), '1px solid red');
  });

  test('shorthand requires all longhands', () => {
    const style = new CSSStyleDeclaration([]);
    style.setProperty('margin-top', '10px');
    style.setProperty('margin-right', '10px');
    assert.strictEqual(style.getPropertyValue('margin'), '');
  });
});
