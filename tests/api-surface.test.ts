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
import assert from 'node:assert';
import * as CSSOM from '../src/index.ts';
import { UNITS } from '../src/data/gen/units.ts';

test('API Surface Area', () => {
  const expectedExports = [
    // This package's unique exports
    'Parser',
    'StreamingTokenizer',
    'serialize',
    'tokenize',
    'parse',
    'getCascadedStyle',

    // CSSOM Rules
    'CSSContainerRule',
    'CSSCounterStyleRule',
    'CSSFontFaceRule',
    'CSSFontFeatureValuesRule',
    'CSSGroupingRule',
    'CSSImportRule',
    'CSSKeyframeRule',
    'CSSKeyframesRule',
    'CSSLayerBlockRule',
    'CSSLayerStatementRule',
    'CSSMarginRule',
    'CSSMediaRule',
    'CSSNamespaceRule',
    'CSSNestedDeclarations',
    'CSSPageRule',
    'CSSPropertyRule',
    'CSSRule',
    'CSSRuleList',
    'CSSScopeRule',
    'CSSStartingStyleRule',
    'CSSStyleRule',
    'CSSStyleSheet',
    'CSSSupportsRule',
    'CSSAtRule',
    'CSSViewTransitionRule',

    // CSSOM Declarations & Media
    'CSSFontFaceDescriptors',
    'CSSMarginDescriptors',
    'CSSPageDescriptors',
    'CSSStyleDeclaration',
    'CSSStyleProperties',
    'MediaList',
    'StyleSheet',
    'StyleSheetList',


    // Typed OM Values & Math
    'CSSKeywordValue',
    'CSSMathClamp',
    'CSSMathFunction',
    'CSSMathInvert',
    'CSSMathMax',
    'CSSMathMin',
    'CSSMathNegate',
    'CSSMathProduct',
    'CSSMathRound',
    'CSSMathSum',
    'CSSMathValue',
    'CSSNumericValue',
    'CSSNumericArray',
    'CSSPositionValue',
    'CSSStyleValue',
    'CSSUnitValue',
    'CSSUnparsedValue',
    'CSSVariableReferenceValue',
    'CSSImageValue',
    'CSSColor',
    'CSSColorValue',
    'CSSRGB',
    'CSSHSL',
    'CSSHWB',
    'CSSLab',
    'CSSLCH',
    'CSSOKLab',
    'CSSOKLCH',
    'StylePropertyMap',
    'StylePropertyMapReadOnly',
    'createCSSStyleValue',
    'DOMMatrix',
    'DOMMatrixReadOnly',

    // Typed OM Transforms
    'CSSMatrixComponent',
    'CSSPerspective',
    'CSSRotate',
    'CSSScale',
    'CSSSkew',
    'CSSSkewX',
    'CSSSkewY',
    'CSSTransformComponent',
    'CSSTransformValue',
    'CSSTranslate',

    // Parser API (Houdini Draft)
    'CSS',
    'CSSParserAtRule',
    'CSSParserBlock',
    'CSSParserDeclaration',
    'CSSParserFunction',
    'CSSParserQualifiedRule',
    'CSSParserRule',
    'CSSParserToken',
    'CSSParserValue',

    // CSS.* methods, exposed for tree-shaking
    'parseCommaValueListSync',
    'parseComponentValue',
    'parseComponentValueSync',
    'parseDeclaration',
    'parseDeclarationList',
    'parseDeclarationListSync',
    'parseDeclarationSync',
    'parseRule',
    'parseRuleList',
    'parseRuleListSync',
    'parseRuleSync',
    'parseStylesheet',
    'parseStylesheetSync',
    'parseValueListSync',
    'parseValueSync'
  ];

  const actualExports = Object.keys(CSSOM).filter(k => k !== 'default');
  assert.deepStrictEqual(new Set(actualExports), new Set(expectedExports), 'API surface area mismatch');
});

test('Parser static methods', () => {
  const expectedMethods = [
    'parseSelectorAST',
    'parseSelector',
    'parseRuleText',
    'parseStyleSheetText',
    'parseRuleInBlockText',
    'calculateSpecificity',
    'getCascadedStyle',
    'resolveVariables',
    'validateCustomPropertyValue',
    'isValidDashedIdent',
    'isCustomPropertyDeclaration',
  ];
  
  const actualMethods = Object.getOwnPropertyNames(CSSOM.Parser).filter(k => typeof (CSSOM.Parser as unknown as Record<string, unknown>)[k] === 'function');
  
  assert.deepStrictEqual(new Set(actualMethods), new Set(expectedMethods), 'Parser static methods mismatch');
});

test('CSS methods', () => {
  const expectedMethods = [
    ...UNITS.map(u => {
      if (u === 'hz') return 'Hz';
      if (u === 'khz') return 'kHz';
      if (u === 'q') return 'Q';
      return u;
    }),
    // Parser
    'parseStylesheet', 'parseStylesheetSync', 'parseRuleList', 'parseRule', 'parseDeclarationList', 'parseDeclaration', 'parseValue', 'parseValueList', 'parseCommaValueList', 'parseComponentValue', 'registerProperty',
    // Tooling Extensions
    'resolveNestedSelector',
  ];
  
  const actualMethods = Object.keys(CSSOM.CSS).filter(k => typeof (CSSOM.CSS as unknown as Record<string, unknown>)[k] === 'function');
  assert.deepStrictEqual(new Set(actualMethods), new Set(expectedMethods), 'CSS methods mismatch');
});
