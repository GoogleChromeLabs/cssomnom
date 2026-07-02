/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { test } from 'node:test';
import assert from 'node:assert';
import { CSS } from '../src/typed-om.ts';
import { PropertyRegistry } from '../src/PropertyRegistry.ts';

test('CSS.registerProperty: validation', () => {
  PropertyRegistry.clear();

  // Invalid name: doesn't start with --
  assert.throws(() => {
    CSS.registerProperty({
      name: 'not-a-custom-prop',
      syntax: '*',
      inherits: false
    });
  }, { name: 'SyntaxError' });

  // Invalid name: just --
  assert.throws(() => {
    CSS.registerProperty({
      name: '--',
      syntax: '*',
      inherits: false
    });
  }, { name: 'SyntaxError' });

  // Invalid name: contains invalid characters
  assert.throws(() => {
    CSS.registerProperty({
      name: '--foo!',
      syntax: '*',
      inherits: false
    });
  }, { name: 'SyntaxError' });

  // Invalid name: contains space
  assert.throws(() => {
    CSS.registerProperty({
      name: '--foo bar',
      syntax: '*',
      inherits: false
    });
  }, { name: 'SyntaxError' });

  // Invalid syntax
  assert.throws(() => {
    CSS.registerProperty({
      name: '--foo',
      syntax: 'invalid syntax',
      inherits: false
    });
  }, { name: 'SyntaxError' });

  // Invalid syntax: whitespace inside data type name
  assert.throws(() => {
    CSS.registerProperty({
      name: '--foo-invalid-ws',
      syntax: '< length >',
      inherits: false,
      initialValue: '0'
    });
  }, { name: 'SyntaxError' });

  // Missing initialValue for non-universal syntax
  assert.throws(() => {
    CSS.registerProperty({
      name: '--foo',
      syntax: '<length>',
      inherits: false
    });
  }, { name: 'SyntaxError' });

  // initialValue doesn't match syntax
  assert.throws(() => {
    CSS.registerProperty({
      name: '--foo',
      syntax: '<length>',
      inherits: false,
      initialValue: 'not-a-length'
    });
  }, { name: 'SyntaxError' });

  // Valid registration
  CSS.registerProperty({
    name: '--my-prop',
    syntax: '<length>',
    inherits: false,
    initialValue: '10px'
  });
  
  const def = PropertyRegistry.get('--my-prop');
  assert.ok(def);
  assert.strictEqual(def.name, '--my-prop');
  assert.strictEqual(def.syntax, '<length>');
  assert.strictEqual(def.initialValue, '10px');
});

test('CSS.registerProperty: throws TypeError on missing inherits', () => {
  PropertyRegistry.clear();

  assert.throws(() => {
    // @ts-expect-error intentionally omitting inherits
    CSS.registerProperty({
      name: '--missing-inherits',
      syntax: '*'
    });
  }, { name: 'TypeError' });
});

test('CSS.registerProperty: throws InvalidModificationError on duplicate registration', () => {
  PropertyRegistry.clear();

  CSS.registerProperty({
    name: '--duplicate-prop',
    syntax: '*',
    inherits: false
  });

  assert.throws(() => {
    CSS.registerProperty({
      name: '--duplicate-prop',
      syntax: '*',
      inherits: false
    });
  }, { name: 'InvalidModificationError' });
});

test('CSS.registerProperty: throws DOMException on invalid name', () => {
  PropertyRegistry.clear();
  try {
    CSS.registerProperty({
      name: 'not-a-custom-prop',
      syntax: '*',
      inherits: false
    });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e instanceof DOMException, 'Should be a DOMException');
    assert.strictEqual((e as DOMException).name, 'SyntaxError');
  }
});

test('CSS.registerProperty: length validation regression', () => {
  PropertyRegistry.clear();

  // Invalid length (angle instead)
  assert.throws(() => {
    CSS.registerProperty({
      name: '--my-prop',
      syntax: '<length>',
      inherits: false,
      initialValue: '10deg'
    });
  }, { name: 'SyntaxError' });

  // Valid length
  CSS.registerProperty({
    name: '--my-length-prop',
    syntax: '<length>',
    inherits: false,
    initialValue: '10px'
  });
  
  const def = PropertyRegistry.get('--my-length-prop');
  assert.strictEqual(def?.initialValue, '10px');
});

test('CSS.registerProperty: computationally independent initialValue', () => {
  PropertyRegistry.clear();

  // em is not computationally independent for registerProperty
  assert.throws(() => {
    CSS.registerProperty({
      name: '--foo',
      syntax: '<length>',
      inherits: false,
      initialValue: '1em'
    });
  }, { name: 'SyntaxError' });

  // var() is allowed in initialValue for universal syntax *
  CSS.registerProperty({
    name: '--foo-var',
    syntax: '*',
    inherits: false,
    initialValue: 'var(--bar)'
  });
  
  const defVar = PropertyRegistry.get('--foo-var');
  assert.ok(defVar);
  assert.strictEqual(defVar.initialValue, 'var(--bar)');

  // q is computationally independent
  CSS.registerProperty({
    name: '--foo-q',
    syntax: '<length>',
    inherits: false,
    initialValue: '1q'
  });
  
  const def = PropertyRegistry.get('--foo-q');
  assert.ok(def);
  assert.strictEqual(def.initialValue, '1q');

  // env() should be allowed by isComputationallyIndependent
  assert.throws(() => {
    CSS.registerProperty({
      name: '--foo-env-length',
      syntax: '<length>',
      inherits: false,
      initialValue: 'env(foo)'
    });
  }, (e: unknown) => {
    if (e instanceof Error) {
      return e.name === 'SyntaxError' && e.message.includes('does not match syntax');
    }
    return false;
  });
});

test('CSS.registerProperty: <string> syntax', () => {
  PropertyRegistry.clear();

  // Valid string
  CSS.registerProperty({
    name: '--my-string-prop',
    syntax: '<string>',
    inherits: false,
    initialValue: '"hello"'
  });

  const def = PropertyRegistry.get('--my-string-prop');
  assert.ok(def);
  assert.strictEqual(def.syntax, '<string>');
  assert.strictEqual(def.initialValue, '"hello"');

  // Invalid string (ident instead)
  assert.throws(() => {
    CSS.registerProperty({
      name: '--my-string-prop-invalid',
      syntax: '<string>',
      inherits: false,
      initialValue: 'hello'
    });
  }, { name: 'SyntaxError' });
});

test('CSS.registerProperty: <custom-ident> hardening', () => {
  PropertyRegistry.clear();

  // CSS-wide keywords are invalid as <custom-ident>
  const keywords = ['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default'];
  
  for (const keyword of keywords) {
    assert.throws(() => {
      CSS.registerProperty({
        name: `--prop-${keyword}`,
        syntax: '<custom-ident>',
        inherits: false,
        initialValue: keyword
      });
    }, { name: 'SyntaxError' }, `Should reject keyword ${keyword}`);

    // Test case insensitivity of keywords
    const upperKeyword = keyword.toUpperCase();
    assert.throws(() => {
      CSS.registerProperty({
        name: `--prop-${upperKeyword}`,
        syntax: '<custom-ident>',
        inherits: false,
        initialValue: upperKeyword
      });
    }, { name: 'SyntaxError' }, `Should reject keyword ${upperKeyword}`);
  }

  // Valid custom-ident
  CSS.registerProperty({
    name: '--my-custom-ident',
    syntax: '<custom-ident>',
    inherits: false,
    initialValue: 'valid-ident'
  });

  const def = PropertyRegistry.get('--my-custom-ident');
  assert.ok(def);
  assert.strictEqual(def.syntax, '<custom-ident>');
  assert.strictEqual(def.initialValue, 'valid-ident');
});

test('CSS.registerProperty: reject CSS wide keywords as literal identifiers in syntax', () => {
  PropertyRegistry.clear();

  const keywords = ['initial', 'inherit', 'unset', 'revert', 'revert-layer', 'default'];
  
  for (const keyword of keywords) {
    assert.throws(() => {
      CSS.registerProperty({
        name: `--prop-${keyword}`,
        syntax: keyword,
        inherits: false,
        initialValue: keyword
      });
    }, { name: 'SyntaxError' }, `Should reject keyword ${keyword} as syntax literal`);
  }
});

test('CSS.registerProperty: ident literal case-sensitivity', () => {
  PropertyRegistry.clear();

  // Syntax has 'BIG' (uppercase)
  assert.throws(() => {
    CSS.registerProperty({
      name: '--case-sensitive-prop',
      syntax: 'BIG',
      inherits: false,
      initialValue: 'big' // lowercase should fail if case-sensitive
    });
  }, { name: 'SyntaxError' });

  // Valid match with exact case
  CSS.registerProperty({
    name: '--case-sensitive-prop-valid',
    syntax: 'BIG',
    inherits: false,
    initialValue: 'BIG'
  });

  const def = PropertyRegistry.get('--case-sensitive-prop-valid');
  assert.ok(def);
  assert.strictEqual(def.initialValue, 'BIG');
});

test('CSS.registerProperty: viewport units are computationally independent', () => {
  PropertyRegistry.clear();

  // vw should be computationally independent now
  CSS.registerProperty({
    name: '--foo-vw',
    syntax: '<length>',
    inherits: false,
    initialValue: '10vw'
  });
  
  const def = PropertyRegistry.get('--foo-vw');
  assert.ok(def);
  assert.strictEqual(def.initialValue, '10vw');

  // vh should be computationally independent now
  CSS.registerProperty({
    name: '--foo-vh',
    syntax: '<length>',
    inherits: false,
    initialValue: '10vh'
  });
  
  const defVh = PropertyRegistry.get('--foo-vh');
  assert.ok(defVh);
  assert.strictEqual(defVh.initialValue, '10vh');
});

test('CSS.registerProperty: syntax with escaped ident', () => {
  PropertyRegistry.clear();

  // foo\\bar is a valid ident (represents foo\bar)
  CSS.registerProperty({
    name: '--prop-escaped',
    syntax: 'foo\\\\bar',
    inherits: false,
    initialValue: 'foo\\\\bar'
  });

  const def = PropertyRegistry.get('--prop-escaped');
  assert.ok(def);
  assert.strictEqual(def.syntax, 'foo\\\\bar');
});

test('CSS.registerProperty: + multiplier requires at least one item', () => {
  PropertyRegistry.clear();

  assert.throws(() => {
    CSS.registerProperty({
      name: '--my-prop-plus-empty',
      syntax: '<length>+',
      inherits: false,
      initialValue: ' '
    });
  }, { name: 'SyntaxError' });
});

test('CSS.registerProperty: <transform-function> validation', () => {
  PropertyRegistry.clear();

  // Valid transform function
  CSS.registerProperty({
    name: '--my-transform-prop',
    syntax: '<transform-function>',
    inherits: false,
    initialValue: 'rotate(45deg)'
  });

  const def = PropertyRegistry.get('--my-transform-prop');
  assert.ok(def);
  assert.strictEqual(def.syntax, '<transform-function>');
  assert.strictEqual(def.initialValue, 'rotate(45deg)');

  // Invalid transform function: not a function
  assert.throws(() => {
    CSS.registerProperty({
      name: '--my-transform-prop-invalid-1',
      syntax: '<transform-function>',
      inherits: false,
      initialValue: '10px'
    });
  }, { name: 'SyntaxError' });

  // Invalid transform function: unknown function
  assert.throws(() => {
    CSS.registerProperty({
      name: '--my-transform-prop-invalid-2',
      syntax: '<transform-function>',
      inherits: false,
      initialValue: 'unknown-func(10)'
    });
  }, { name: 'SyntaxError' });
});

test('CSS.registerProperty: <transform-list> validation', () => {
  PropertyRegistry.clear();

  // Valid transform list (multiple functions)
  CSS.registerProperty({
    name: '--my-transform-list-prop',
    syntax: '<transform-list>',
    inherits: false,
    initialValue: 'rotate(45deg) translate(10px)'
  });

  const def = PropertyRegistry.get('--my-transform-list-prop');
  assert.ok(def);
  assert.strictEqual(def.syntax, '<transform-list>');
  assert.strictEqual(def.initialValue, 'rotate(45deg) translate(10px)');

  // Valid transform list (single function)
  CSS.registerProperty({
    name: '--my-transform-list-prop-single',
    syntax: '<transform-list>',
    inherits: false,
    initialValue: 'scale(2)'
  });

  // Invalid transform list: contains non-function
  assert.throws(() => {
    CSS.registerProperty({
      name: '--my-transform-list-prop-invalid-1',
      syntax: '<transform-list>',
      inherits: false,
      initialValue: 'rotate(45deg) 10px'
    });
  }, { name: 'SyntaxError' });

  // Invalid transform list: unknown function
  assert.throws(() => {
    CSS.registerProperty({
      name: '--my-transform-list-prop-invalid-2',
      syntax: '<transform-list>',
      inherits: false,
      initialValue: 'rotate(45deg) unknown-func(10)'
    });
  }, { name: 'SyntaxError' });
});

test('CSS.registerProperty: universal syntax (*) initialValue validation', () => {
  PropertyRegistry.clear();

  // Valid initialValue for * (can be anything valid as declaration value)
  CSS.registerProperty({
    name: '--universal-prop',
    syntax: '*',
    inherits: false,
    initialValue: 'any valid token stream'
  });

  // Invalid initialValue for * (contains top-level !)
  assert.throws(() => {
    CSS.registerProperty({
      name: '--universal-prop-invalid-1',
      syntax: '*',
      inherits: false,
      initialValue: 'foo ! important'
    });
  }, { name: 'SyntaxError' });

  // Invalid initialValue for * (contains top-level ;)
  assert.throws(() => {
    CSS.registerProperty({
      name: '--universal-prop-invalid-2',
      syntax: '*',
      inherits: false,
      initialValue: 'foo ; bar'
    });
  }, { name: 'SyntaxError' });

  // Invalid initialValue for * (unbalanced brackets)
  assert.throws(() => {
    CSS.registerProperty({
      name: '--universal-prop-invalid-3',
      syntax: '*',
      inherits: false,
      initialValue: 'foo ( bar'
    });
  }, { name: 'SyntaxError' });
});
