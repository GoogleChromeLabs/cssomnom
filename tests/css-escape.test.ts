import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CSS } from '../src/index.ts';

describe('CSS.escape', () => {
  it('throws TypeError when called with no arguments', () => {
    // @ts-expect-error - testing invalid argument count
    assert.throws(() => CSS.escape(), TypeError);
  });

  it('converts arguments to string', () => {
    assert.strictEqual(CSS.escape(true), 'true');
    assert.strictEqual(CSS.escape(false), 'false');
    assert.strictEqual(CSS.escape(null), 'null');
    assert.strictEqual(CSS.escape(''), '');
  });

  it('handles null bytes (U+0000 -> U+FFFD)', () => {
    assert.strictEqual(CSS.escape('\0'), '\uFFFD');
    assert.strictEqual(CSS.escape('a\0'), 'a\uFFFD');
    assert.strictEqual(CSS.escape('\0b'), '\uFFFDb');
    assert.strictEqual(CSS.escape('a\0b'), 'a\uFFFDb');
  });

  it('preserves replacement character', () => {
    assert.strictEqual(CSS.escape('\uFFFD'), '\uFFFD');
    assert.strictEqual(CSS.escape('a\uFFFD'), 'a\uFFFD');
  });

  it('escapes leading digits as hex code points', () => {
    assert.strictEqual(CSS.escape('0a'), '\\30 a');
    assert.strictEqual(CSS.escape('9z'), '\\39 z');
    assert.strictEqual(CSS.escape('a0b'), 'a0b');
  });

  it('escapes dash followed by digit as hex code point', () => {
    assert.strictEqual(CSS.escape('-0a'), '-\\30 a');
    assert.strictEqual(CSS.escape('-9a'), '-\\39 a');
  });

  it('escapes single dash', () => {
    assert.strictEqual(CSS.escape('-'), '\\-');
    assert.strictEqual(CSS.escape('--a'), '--a');
  });

  it('escapes control characters and 0x7F', () => {
    assert.strictEqual(CSS.escape('\x01\x02\x1E\x1F'), '\\1 \\2 \\1e \\1f ');
    assert.strictEqual(CSS.escape('\x7F'), '\\7f ');
  });

  it('escapes punctuation and special characters', () => {
    assert.strictEqual(CSS.escape('.class#id:hover'), '\\.class\\#id\\:hover');
    assert.strictEqual(CSS.escape('hello\\world'), 'hello\\\\world');
    assert.strictEqual(CSS.escape(' '), '\\ ');
    assert.strictEqual(CSS.escape('!'), '\\!');
  });

  it('preserves astral symbols and unicode >= U+0080', () => {
    assert.strictEqual(CSS.escape('\uD834\uDF06'), '\uD834\uDF06');
    assert.strictEqual(CSS.escape('hello\u{1234}world'), 'hello\u{1234}world');
    assert.strictEqual(CSS.escape('a_b-c'), 'a_b-c');
  });

  it('has [Symbol.toStringTag] equal to "CSS"', () => {
    const desc = Object.getOwnPropertyDescriptor(CSS, Symbol.toStringTag);
    assert.ok(desc, 'Symbol.toStringTag descriptor should exist on CSS');
    assert.strictEqual(desc.value, 'CSS');
    assert.strictEqual(desc.writable, false);
    assert.strictEqual(desc.enumerable, false);
    assert.strictEqual(desc.configurable, true);
    assert.strictEqual(Object.prototype.toString.call(CSS), '[object CSS]');
  });
});
