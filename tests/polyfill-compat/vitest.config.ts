import path from 'path';
import fs from 'fs';

const cssomnomIndex = path.resolve(__dirname, '../../src/index.ts');
const testsDir = path.resolve(__dirname, '../../submodules/css-typed-om-polyfill/tests/unit');

// Exclude clamp.test.ts because cssomnom eagerly simplifies math functions (spec-compliant),
// whereas the polyfill tests expect unsimplified CSSMathClamp instances.
const testFiles = fs.readdirSync(testsDir)
  .filter(file => file.endsWith('.test.ts') && file !== 'clamp.test.ts')
  .map(file => path.resolve(testsDir, file));

// RegExp that matches the entire import path if it ends with one of our target modules (with optional extension)
const aliasRegex = /^.*(?:css-numeric-value|css-color-value|css-style-value|css-transform-value|style-property-map|index)(?:\.ts|\.js)?$/;

// RegExp to redirect polyfill parser imports to our compatibility wrapper
const parserAliasRegex = /^.*parser\/(css-value-parser|tokenizer)(?:\.ts|\.js)?$/;
const parserCompat = path.resolve(__dirname, './parser-compat.ts');

export default {
  resolve: {
    alias: [
      {
        find: parserAliasRegex,
        replacement: parserCompat,
      },
      {
        find: aliasRegex,
        replacement: cssomnomIndex,
      }
    ],
  },
  test: {
    setupFiles: [path.resolve(__dirname, './vitest.setup.ts')],
    include: testFiles,
  },
};
