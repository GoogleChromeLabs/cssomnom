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
import { tokenize } from '../../src/tokenizer.ts';
import { Parser } from '../../src/parser.ts';
import { CSSStyleValue } from '../../src/typed-om.ts';
import { MediaParser } from '../../src/MediaParser.ts';

function generateRandomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 {}[]():;,#.\\\'"/* \n\t';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

function generateSemiRandomCSS(length: number): string {
  const tokens = [
    'div', 'span', 'a', '#id', '.class', ':', '::', 'hover', 'active',
    '{', '}', '[', ']', '(', ')', ';', ',',
    'color', 'background', 'margin', 'padding', 'width', 'height',
    'red', 'blue', '10px', '1em', '100%', 'url(foo.jpg)',
    ' ', '\n', '\t'
  ];
  let result = '';
  for (let i = 0; i < length; i++) {
    result += tokens[Math.floor(Math.random() * tokens.length)];
  }
  return result;
}

test('Fuzz parser with random strings', () => {
  const iterations = 10000;
  let successCount = 0;
  
  for (let i = 0; i < iterations; i++) {
    const length = Math.floor(Math.random() * 100);
    const input = generateRandomString(length);
    
    try {
      const tokens = tokenize(input);
      const parser = new Parser(tokens);
      parser.parseStyleSheet();
      successCount++;
    } catch (e) {
      console.error(`Failed on input: "${input}"`);
      throw e;
    }
  }
  
  assert.strictEqual(successCount, iterations, 'All iterations should pass without throwing');
});

test('Fuzz parser with semi-random CSS', () => {
  const iterations = 10000;
  let successCount = 0;
  
  for (let i = 0; i < iterations; i++) {
    const length = Math.floor(Math.random() * 20); // Length in terms of tokens
    const input = generateSemiRandomCSS(length);
    
    try {
      const tokens = tokenize(input);
      const parser = new Parser(tokens);
      parser.parseStyleSheet();
      successCount++;
    } catch (e) {
      console.error(`Failed on input: "${input}"`);
      throw e;
    }
  }
  
  assert.strictEqual(successCount, iterations, 'All iterations should pass without throwing');
});

function generateSemiRandomMediaQuery(length: number): string {
  const tokens = [
    'all', 'screen', 'print', 'and', 'not', 'only', 'or',
    '(', ')', ':', ',',
    'width', 'height', 'min-width', 'max-width', 'orientation', 'landscape', 'portrait',
    '10px', '20em', '16/9',
    ' ', '\n', '\t'
  ];
  let result = '';
  for (let i = 0; i < length; i++) {
    result += tokens[Math.floor(Math.random() * tokens.length)];
  }
  return result;
}

function generateSemiRandomTypedOMValue(length: number): string {
  const tokens = [
    '10px', '1em', '100%', 'red', 'blue', 'calc(', 'min(', 'max(', ')', '+', '-', '*', '/',
    ' ', 'ident', 'var(--foo)', 'url(bar.jpg)', ',',
    '0', '1', '2', '3'
  ];
  let result = '';
  for (let i = 0; i < length; i++) {
    result += tokens[Math.floor(Math.random() * tokens.length)];
  }
  return result;
}

test('Fuzz CSSStyleValue.parse with random strings', () => {
  const iterations = 10000;
  let successCount = 0;
  
  for (let i = 0; i < iterations; i++) {
    const length = Math.floor(Math.random() * 100);
    const input = generateRandomString(length);
    
    try {
      CSSStyleValue.parse('color', input);
      successCount++;
    } catch (e) {
      if (e instanceof TypeError || e instanceof SyntaxError) {
        successCount++;
      } else {
        console.error(`Failed on input: "${input}"`);
        throw e;
      }
    }
  }
  
  assert.strictEqual(successCount, iterations, 'All iterations should handle errors gracefully');
});

test('Fuzz CSSStyleValue.parse with semi-random values', () => {
  const iterations = 10000;
  let successCount = 0;
  
  for (let i = 0; i < iterations; i++) {
    const length = Math.floor(Math.random() * 10);
    const input = generateSemiRandomTypedOMValue(length);
    
    try {
      CSSStyleValue.parse('color', input);
      successCount++;
    } catch (e) {
      if (e instanceof TypeError || e instanceof SyntaxError) {
        successCount++;
      } else {
        console.error(`Failed on input: "${input}"`);
        throw e;
      }
    }
  }
  
  assert.strictEqual(successCount, iterations, 'All iterations should handle errors gracefully');
});

test('Fuzz MediaParser.parse with random strings', () => {
  const iterations = 10000;
  let successCount = 0;
  
  for (let i = 0; i < iterations; i++) {
    const length = Math.floor(Math.random() * 100);
    const input = generateRandomString(length);
    
    try {
      MediaParser.parse(input);
      successCount++;
    } catch (e) {
      console.error(`Failed on input: "${input}"`);
      throw e;
    }
  }
  
  assert.strictEqual(successCount, iterations, 'All iterations should pass without throwing');
});

test('Fuzz MediaParser.parse with semi-random media queries', () => {
  const iterations = 10000;
  let successCount = 0;
  
  for (let i = 0; i < iterations; i++) {
    const length = Math.floor(Math.random() * 20);
    const input = generateSemiRandomMediaQuery(length);
    
    try {
      MediaParser.parse(input);
      successCount++;
    } catch (e) {
      console.error(`Failed on input: "${input}"`);
      throw e;
    }
  }
  
  assert.strictEqual(successCount, iterations, 'All iterations should pass without throwing');
});
