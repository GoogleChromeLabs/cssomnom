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
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as CSSOM from '../src/entry/index.ts';
import * as SpecExports from '../src/entry/spec.ts';
import * as ToolsExports from '../src/entry/tools.ts';
import * as ParseEntry from '../src/parse-entry.ts';
import * as ParserApiEntry from '../src/parser-api.ts';

interface WebIDLMember {
  type: string;
  name?: string;
  special?: string;
  readonly?: boolean;
}

interface WebIDLDefinition {
  type: string;
  name: string;
  partial?: boolean;
  inheritance?: string | null;
  members?: WebIDLMember[];
  target?: string;
  includes?: string;
}

function loadWebIDLParser(webidl2Path: string): (idl: string) => WebIDLDefinition[] {
  const sandbox: { WebIDL2?: { parse: (idl: string) => WebIDLDefinition[] } } = {};
  vm.runInNewContext(fs.readFileSync(webidl2Path, 'utf8'), sandbox);
  if (!sandbox.WebIDL2?.parse) {
    throw new Error(`Failed to load WebIDL2.parse from ${webidl2Path}`);
  }
  return sandbox.WebIDL2.parse;
}

/**
 * Explicit, reason-annotated registry of intentional deviations between `src/entry/spec.ts`
 * and the vendored W3C WebIDL definitions in `submodules/web-platform-tests/interfaces/*.idl`.
 */
const INTENTIONAL_WEBIDL_DEVIATIONS = {
  interfaces: {
    CSSCustomMediaRule: {
      reason: 'Media Queries Level 5 @custom-media rule interface (submodules/csswg-drafts/mediaqueries-5/Overview.bs).',
    },
    CSSMarginDescriptors: {
      reason: 'CSSOM 1 / CSS Page 3 margin rule style descriptor subclass of CSSStyleDeclaration.',
    },
    CSSMathFunction: {
      reason: 'CSS Values 4 math functions (sin, cos, abs, sign, etc.) represented as a CSSMathValue subclass.',
    },
    CSSMathRound: {
      reason: 'CSS Values 4 round() math operation represented as a CSSMathValue subclass.',
    },
    CSSPositionValue: {
      reason: 'CSS Typed OM Level 1 <position> value class retained for Typed OM 1 grammar reification.',
    },
  } as Record<string, { reason: string }>,

  inheritance: {
    CSSStyleDeclaration: {
      expected: 'CSSStyleProperties',
      reason: 'Extends generated CSSStyleProperties base class to inherit TypeScript camelCase/kebab-case property declarations and cssFloat.',
    },
    CSSStyleProperties: {
      expected: null,
      reason: 'Generated base class holding standard CSS property declarations.',
    },
    CSSTransformComponent: {
      expected: 'CSSStyleValue',
      reason: 'Inherits from CSSStyleValue per README § Intentional Spec Deviations to align with Blink/WebKit reification.',
    },
  } as Record<string, { expected: string | null; reason: string }>,

  extraMembers: {
    'CSS.x': {
      reason: 'CSS Typed OM Level 1 resolution unit factory (submodules/css-houdini-drafts/css-typed-om/Overview.bs).',
    },
    'CSSRule.prototype.location': {
      reason: 'Non-enumerable 1-based line/column/offset source location for static analysis and coverage pruning.',
    },
    'CSSStyleDeclaration.prototype.onChange': {
      reason: 'Host DOM style attribute synchronization callback required by linkedom.',
    },
  } as Record<string, { reason: string }>,

  unimplementedMembers: {
    'CSSContainerRule.prototype.conditions': {
      reason: 'CSS Conditional 5 draft FrozenArray<CSSContainerCondition> not yet implemented.',
    },
    'CSSViewTransitionRule.prototype.types': {
      reason: 'CSS View Transitions 2 FrozenArray<CSSOMString> types descriptor not yet implemented.',
    },
    'CSSMediaRule.prototype.matches': {
      reason: 'CSS Conditional 4 live viewport media match boolean requires a browser window.',
    },
  } as Record<string, { reason: string }>,
};

test('Root Entrypoint: cssomnom (.)', (t) => {
  const exports = Object.keys(CSSOM).filter(k => k !== 'default').sort();
  t.assert.snapshot(exports);
});

test('W3C WebIDL Barrel: src/entry/spec.ts', (t) => {
  const exports = Object.keys(SpecExports).filter(k => k !== 'default').sort();
  t.assert.snapshot(exports);
});

test('Static Analysis & Cascade Tools Barrel: src/entry/tools.ts', (t) => {
  const exports = Object.keys(ToolsExports).filter(k => k !== 'default').sort();
  t.assert.snapshot(exports);
});

test('Lightweight Parse Subpath: cssomnom/parse (./parse)', (t) => {
  const exports = Object.keys(ParseEntry).filter(k => k !== 'default').sort();
  t.assert.snapshot(exports);
});

test('WICG Parser API Subpath: cssomnom/parser-api (./parser-api)', (t) => {
  const exports = Object.keys(ParserApiEntry).filter(k => k !== 'default').sort();
  t.assert.snapshot(exports);
});

test('CSS namespace methods', (t) => {
  const methods = Object.keys(CSSOM.CSS)
    .filter(k => typeof (CSSOM.CSS as unknown as Record<string, unknown>)[k] === 'function')
    .sort();
  t.assert.snapshot(methods);
});

test('CSSStyleDeclaration prototype does not leak internal helpers as enumerable WebIDL attributes', () => {
  const keys = Object.keys(CSSOM.CSSStyleDeclaration.prototype);
  assert.strictEqual(
    keys.includes('declarations'),
    false,
    'declarations is an internal helper and must not be enumerable on CSSStyleDeclaration.prototype per CSSOM 1 § 6.6'
  );
});

test('W3C WebIDL conformance: src/entry/spec.ts matches submodules/web-platform-tests/interfaces/*.idl via webidl2.js', (t) => {
  const idlDir = path.resolve(import.meta.dirname, '../submodules/web-platform-tests/interfaces');
  const webidl2Path = path.resolve(
    import.meta.dirname,
    '../submodules/web-platform-tests/resources/webidl2/lib/webidl2.js'
  );
  if (!fs.existsSync(idlDir) || !fs.existsSync(webidl2Path)) {
    t.skip('submodules/web-platform-tests not initialized');
    return;
  }
  const parseWebIDL = loadWebIDLParser(webidl2Path);
  const idlFiles = fs
    .readdirSync(idlDir)
    .filter(f => f.startsWith('css') || f === 'geometry.idl' || f === 'web-animations.idl');

  const interfaces = new Map<
    string,
    {
      name: string;
      inheritance: string | null;
      members: Set<string>;
      constants: Set<string>;
    }
  >();
  const mixins = new Map<string, Set<string>>();
  const includes: { target: string; includes: string }[] = [];
  const cssNamespaceMembers = new Set<string>();
  const requiredCssNamespaceSpecs = new Set([
    'cssom.idl',
    'css-conditional.idl',
    'css-properties-values-api.idl',
    'css-typed-om.idl',
  ]);
  const requiredCssNamespaceMembers = new Set<string>();

  for (const file of idlFiles) {
    const text = fs.readFileSync(path.join(idlDir, file), 'utf8');
    const ast = parseWebIDL(text);
    for (const def of ast) {
      if (def.type === 'interface') {
        let entry = interfaces.get(def.name);
        if (!entry) {
          entry = { name: def.name, inheritance: null, members: new Set(), constants: new Set() };
          interfaces.set(def.name, entry);
        }
        if (!def.partial && def.inheritance) {
          entry.inheritance = def.inheritance;
        }
        for (const m of def.members ?? []) {
          if (m.type === 'attribute' || m.type === 'operation') {
            if (m.name && m.special !== 'static') entry.members.add(m.name);
            if (m.special === 'stringifier') entry.members.add('toString');
          } else if (m.type === 'stringifier') {
            entry.members.add('toString');
          } else if (m.type === 'const' && m.name) {
            entry.constants.add(m.name);
          } else if (m.type === 'iterable') {
            for (const k of ['entries', 'keys', 'values', 'forEach']) entry.members.add(k);
          } else if (m.type === 'maplike') {
            for (const k of ['size', 'get', 'has', 'entries', 'keys', 'values', 'forEach']) entry.members.add(k);
            if (!m.readonly) {
              for (const k of ['set', 'delete', 'clear']) entry.members.add(k);
            }
          }
        }
      } else if (def.type === 'interface mixin') {
        let mixinMembers = mixins.get(def.name);
        if (!mixinMembers) {
          mixinMembers = new Set();
          mixins.set(def.name, mixinMembers);
        }
        for (const m of def.members ?? []) {
          if (m.name) mixinMembers.add(m.name);
        }
      } else if (def.type === 'includes' && def.target && def.includes) {
        includes.push({ target: def.target, includes: def.includes });
      } else if (def.type === 'namespace' && def.name === 'CSS') {
        for (const m of def.members ?? []) {
          if (m.name) {
            cssNamespaceMembers.add(m.name);
            if (requiredCssNamespaceSpecs.has(file)) {
              requiredCssNamespaceMembers.add(m.name);
            }
          }
        }
      }
    }
  }

  for (const inc of includes) {
    const iface = interfaces.get(inc.target);
    const mixin = mixins.get(inc.includes);
    if (iface && mixin) {
      for (const m of mixin) iface.members.add(m);
    }
  }

  function hasIdlMemberInChain(ifaceName: string, member: string): boolean {
    let curr = interfaces.get(ifaceName);
    while (curr) {
      if (curr.members.has(member) || curr.constants.has(member)) return true;
      curr = curr.inheritance ? interfaces.get(curr.inheritance) : undefined;
    }
    return false;
  }

  for (const [name, exportedVal] of Object.entries(SpecExports)) {
    if (name === 'CSS') {
      for (const fnName of Object.keys(CSSOM.CSS)) {
        const qualified = `CSS.${fnName}`;
        assert.ok(
          cssNamespaceMembers.has(fnName) || qualified in INTENTIONAL_WEBIDL_DEVIATIONS.extraMembers,
          `${qualified} is exported on CSS namespace but missing from W3C CSS namespace IDL`
        );
      }
      for (const idlFn of requiredCssNamespaceMembers) {
        assert.ok(
          idlFn in CSSOM.CSS,
          `W3C CSS namespace member CSS.${idlFn} is missing from implementation`
        );
      }
      continue;
    }

    assert.equal(typeof exportedVal, 'function', `Expected ${name} in src/entry/spec.ts to be a class constructor`);
    const ctor = exportedVal as Function & { prototype: object };
    const idl = interfaces.get(name);

    if (!idl) {
      assert.ok(
        name in INTENTIONAL_WEBIDL_DEVIATIONS.interfaces,
        `Exported class "${name}" in src/entry/spec.ts does not exist in W3C .idl files and is not in INTENTIONAL_WEBIDL_DEVIATIONS.interfaces`
      );
      continue;
    }

    // 1. Check prototype inheritance chain
    const parentProto = Object.getPrototypeOf(ctor.prototype);
    const actualParent = parentProto === Object.prototype ? null : parentProto.constructor.name;
    const expectedParent =
      name in INTENTIONAL_WEBIDL_DEVIATIONS.inheritance
        ? INTENTIONAL_WEBIDL_DEVIATIONS.inheritance[name].expected
        : idl.inheritance;
    assert.equal(
      actualParent,
      expectedParent,
      `Inheritance mismatch on ${name}: extends ${actualParent}, expected ${expectedParent} per WebIDL`
    );

    // 2. Outward check: every own property on prototype must be in WebIDL or allowlisted (and _ fields must be non-enumerable)
    for (const prop of Object.getOwnPropertyNames(ctor.prototype)) {
      if (prop === 'constructor') continue;
      const desc = Object.getOwnPropertyDescriptor(ctor.prototype, prop);
      if (prop.startsWith('_')) {
        assert.equal(
          desc?.enumerable,
          false,
          `Internal method ${name}.prototype.${prop} must not be enumerable`
        );
        continue;
      }
      const qualified = `${name}.prototype.${prop}`;
      if (!hasIdlMemberInChain(name, prop)) {
        assert.ok(
          qualified in INTENTIONAL_WEBIDL_DEVIATIONS.extraMembers,
          `Non-standard member ${qualified} is not in W3C WebIDL and not in INTENTIONAL_WEBIDL_DEVIATIONS.extraMembers`
        );
      }
    }

    // 3. Inward check: every IDL member on this interface must be implemented on prototype (or Proxy-backed descriptor / allowlisted)
    if (name === 'CSSFontFaceDescriptors' || name === 'CSSPageDescriptors') {
      // Descriptor properties on CSSStyleDeclaration subclasses are handled by CSSStyleDeclaration's Proxy
      continue;
    }
    for (const member of idl.members) {
      const qualified = `${name}.prototype.${member}`;
      if (
        !(member in ctor.prototype) &&
        !(qualified in INTENTIONAL_WEBIDL_DEVIATIONS.unimplementedMembers)
      ) {
        assert.fail(`W3C WebIDL member ${qualified} is missing from implementation`);
      }
    }
  }
});
