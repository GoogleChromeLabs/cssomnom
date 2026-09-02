/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySubtestFeasibility,
  type SubtestClassificationInput
} from '../scripts/wpt/node/core/classifier.ts';

// cssom-view-1 § 6 #dom-document-caretpositionfrompoint
test('classifySubtestFeasibility: VIEWPORT_GEOMETRY category', () => {
  // caretPositionFromPoint
  const caret1 = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/cssom/caretPositionFromPoint-in-flex-container.html',
    name: 'caretPositionFromPoint in flex container',
    error: 'assert_equals: offset expected 5 but got 0'
  });
  assert.strictEqual(caret1.isBrowserOnly, true);
  assert.strictEqual(caret1.category, 'VIEWPORT_GEOMETRY');

  // caretRangeFromPoint
  const caret2 = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/cssom/caretRangeFromPoint-textarea-transform.tentative.html',
    name: 'caretRangeFromPoint with textarea transform',
    error: 'assert_not_equals: range is null'
  });
  assert.strictEqual(caret2.isBrowserOnly, true);
  assert.strictEqual(caret2.category, 'VIEWPORT_GEOMETRY');

  // getBoundingClientRect & getClientRects
  // cssom-view-1 § 4 #dom-element-getboundingclientrect
  const clientRect = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/cssom/geometry.html',
    name: 'getBoundingClientRect returns non-zero dimensions',
    error: 'assert_equals: getBoundingClientRect().width expected 100 but got 0'
  });
  assert.strictEqual(clientRect.isBrowserOnly, true);
  assert.strictEqual(clientRect.category, 'VIEWPORT_GEOMETRY');

  // elementFromPoint / elementsFromPoint
  const elFromPoint = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/cssom/element-from-point.html',
    name: 'elementsFromPoint hit-testing',
    error: 'assert_equals: elementFromPoint(50, 50) expected HTMLDivElement but got null'
  });
  assert.strictEqual(elFromPoint.isBrowserOnly, true);
  assert.strictEqual(elFromPoint.category, 'VIEWPORT_GEOMETRY');
});

// webdriver-2 § 17.4 #actions
// selectors-4 § 7.3 #the-focus-visible-pseudo
// selectors-4 § 7.2 #the-active-pseudo
test('classifySubtestFeasibility: HARDWARE_INPUT_DRIVER category', () => {
  // testdriver action sequence
  const testDriver = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/selectors/pointer-actions.html',
    name: 'Pointer action sequence synthesis',
    error: 'TypeError: test_driver.action_sequence is not a function'
  });
  assert.strictEqual(testDriver.isBrowserOnly, true);
  assert.strictEqual(testDriver.category, 'HARDWARE_INPUT_DRIVER');

  // :focus-visible hardware keyboard interaction
  const focusVisible = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/selectors/focus-visible-001.html',
    name: 'Focus visible keyboard navigation',
    error: 'assert_equals: :focus-visible matching after Tab key press expected true but got false'
  });
  assert.strictEqual(focusVisible.isBrowserOnly, true);
  assert.strictEqual(focusVisible.category, 'HARDWARE_INPUT_DRIVER');

  // :active mouse button press state
  const activeTopLayer = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/selectors/active-toplayer-001.html',
    name: ':active pseudo-class on top layer element',
    error: 'assert_equals: :active match on mouse down expected true but got false'
  });
  assert.strictEqual(activeTopLayer.isBrowserOnly, true);
  assert.strictEqual(activeTopLayer.category, 'HARDWARE_INPUT_DRIVER');

  // Scope hover / focus
  const scopeHover = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/css-cascade/scope-hover.html',
    name: '@scope with :hover state',
    error: 'assert_equals: color expected green but got red'
  });
  assert.strictEqual(scopeHover.isBrowserOnly, true);
  assert.strictEqual(scopeHover.category, 'HARDWARE_INPUT_DRIVER');
});

// web-animations-1 § 5 #the-animation-interface
// css-animations-1 § 4 #keyframes
test('classifySubtestFeasibility: ANIMATION_SCHEDULER category', () => {
  // CSS Variable animation
  const varAnim = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/css-variables/variable-animation-from-to.html',
    name: 'CSS variable animated from 10px to 50px',
    error: 'assert_equals: computed value expected "30px" but got "10px"'
  });
  assert.strictEqual(varAnim.isBrowserOnly, true);
  assert.strictEqual(varAnim.category, 'ANIMATION_SCHEDULER');

  // Revert animation rollback
  const revertLayer = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/css-cascade/revert-layer-008.html',
    name: 'revert-layer in keyframe animation',
    error: 'assert_equals: animated color expected rgb(0, 128, 0) but got rgb(255, 0, 0)'
  });
  assert.strictEqual(revertLayer.isBrowserOnly, true);
  assert.strictEqual(revertLayer.category, 'ANIMATION_SCHEDULER');

  // element.animate() call
  const elementAnimate = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/css-animations/script-animation.html',
    name: 'element.animate scheduling',
    error: 'TypeError: element.animate is not a function'
  });
  assert.strictEqual(elementAnimate.isBrowserOnly, true);
  assert.strictEqual(elementAnimate.category, 'ANIMATION_SCHEDULER');
});

// html § 6.13.3 #top-layer
// selectors-4 § 7.4 #the-modal-pseudo
test('classifySubtestFeasibility: MODAL_TOP_LAYER category', () => {
  const showModal = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/selectors/modal-pseudo-class.html',
    name: ':modal pseudo-class on dialog with showModal()',
    error: 'assert_equals: dialog:modal matched expected true but got false'
  });
  assert.strictEqual(showModal.isBrowserOnly, true);
  assert.strictEqual(showModal.category, 'MODAL_TOP_LAYER');

  const backdrop = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/selectors/backdrop-test.html',
    name: 'dialog::backdrop styling in top layer',
    error: 'assert_equals: dialog::backdrop background-color expected green but got transparent'
  });
  assert.strictEqual(backdrop.isBrowserOnly, true);
  assert.strictEqual(backdrop.category, 'MODAL_TOP_LAYER');
});

// css-contain-3 § 3 #container-queries
test('classifySubtestFeasibility: CONTAINER_LAYOUT category', () => {
  const containerQuery = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/css-contain/container-query.html',
    name: '@container (min-width: 300px) inline layout query',
    error: 'assert_equals: @container (min-width: 300px) matched expected true but got false'
  });
  assert.strictEqual(containerQuery.isBrowserOnly, true);
  assert.strictEqual(containerQuery.category, 'CONTAINER_LAYOUT');

  const cqwQuery = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/css-contain/cq-units.html',
    name: 'Container query length unit cqw evaluation',
    error: 'assert_equals: width in cqw expected 50px but got 0px'
  });
  assert.strictEqual(cqwQuery.isBrowserOnly, true);
  assert.strictEqual(cqwQuery.category, 'CONTAINER_LAYOUT');
});

// css-syntax-3 § 4.3 #charset-rule
test('classifySubtestFeasibility: HTTP_CHARSET_STREAM category', () => {
  const charsetTest = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/css-syntax/charset/page-windows-1251-css-at-charset-utf16.html',
    name: 'HTTP Windows-1251 vs @charset UTF-16 byte decode',
    error: 'assert_equals: color from decoded charset expected green but got red'
  });
  assert.strictEqual(charsetTest.isBrowserOnly, true);
  assert.strictEqual(charsetTest.category, 'HTTP_CHARSET_STREAM');

  const perfResource = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/css-syntax/resource-timing.html',
    name: 'Performance resource timing for CSS @import',
    error: 'assert_equals: performance.getEntriesByName() found entry for the import url expected 1 but got 0'
  });
  assert.strictEqual(perfResource.isBrowserOnly, true);
  assert.strictEqual(perfResource.category, 'HTTP_CHARSET_STREAM');
});

// cssom-view-1 § 7 #resolved-values
// css-cascade-5 § 8 #computed-values
test('classifySubtestFeasibility: LAYOUT_GEOMETRY category', () => {
  // getcomputedstyle-insets file
  const insetsTest = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/cssom/getComputedStyle-insets-absolute.html',
    name: 'Resolved layout inset top/left',
    error: 'assert_equals: getComputedStyle(target).top expected "120px" but got "auto"'
  });
  assert.strictEqual(insetsTest.isBrowserOnly, true);
  assert.strictEqual(insetsTest.category, 'LAYOUT_GEOMETRY');

  // getComputedStyle dimension mismatch (expected px vs actual 0px/auto)
  const dimensionMismatch = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/cssom/computed-dimensions.html',
    name: 'Resolved box inline-size layout computation',
    expected: '"250px"',
    actual: '"0px"',
    error: 'assert_equals: expected "250px" but got "0px"'
  });
  assert.strictEqual(dimensionMismatch.isBrowserOnly, true);
  assert.strictEqual(dimensionMismatch.category, 'LAYOUT_GEOMETRY');

  // Linkedom sandbox limitation error
  const linkedomSandbox = classifySubtestFeasibility({
    file: 'submodules/web-platform-tests/css/cssom/test.html',
    name: 'Computed style in sandbox',
    error: 'Error: getComputedStyle is not supported in the linkedom sandbox without element attachment'
  });
  assert.strictEqual(linkedomSandbox.isBrowserOnly, true);
  assert.strictEqual(linkedomSandbox.category, 'LAYOUT_GEOMETRY');
});

// cssom-1 § 6.5 #the-cssstylesheet-interface
// css-typed-om-1 § 2 #cssstylevalue
test('classifySubtestFeasibility: Pure CSSOM failures are NOT classified as browser-only (Zero False Positives)', () => {
  const pureCases: SubtestClassificationInput[] = [
    {
      file: 'submodules/web-platform-tests/css/cssom/cssstyledeclaration-setproperty.html',
      name: 'CSSStyleDeclaration.setProperty() priority parsing',
      error: 'assert_equals: sheet.cssRules[0].style.getPropertyPriority("color") expected "important" but got ""'
    },
    {
      file: 'submodules/web-platform-tests/css/cssom/cssrule-seralization.html',
      name: 'CSSStyleRule.selectorText serialization',
      error: 'assert_equals: rule.selectorText expected ".a, .b" but got ".b, .a"'
    },
    {
      file: 'submodules/web-platform-tests/css/css-typed-om/the-stylepropertymap/declared/declared.tentative.html',
      name: 'StylePropertyMapReadOnly.get() with CSSUnitValue',
      error: 'assert_equals: map.get("z-index").value expected 10 but got 0'
    },
    {
      file: 'submodules/web-platform-tests/css/css-syntax/parse-component-value.html',
      name: 'CSS component value parsing for custom property',
      error: 'assert_equals: var(--custom) serialization expected "var(--custom)" but got "var( --custom )"'
    },
    {
      file: 'submodules/web-platform-tests/css/css-nesting/cssom.html',
      name: 'CSSNestedDeclarations rule ordering in CSSOM',
      error: 'assert_equals: sheet.cssRules[0].cssRules.length expected 3 but got 2'
    },
    {
      file: 'submodules/web-platform-tests/css/mediaqueries/mq-parse.html',
      name: 'Media query list parsing and serialization',
      error: 'assert_equals: mediaList.mediaText expected "(min-width: 500px)" but got "all"'
    }
  ];

  for (const input of pureCases) {
    const result = classifySubtestFeasibility(input);
    assert.strictEqual(
      result.isBrowserOnly,
      false,
      `Expected pure CSSOM test "${input.name}" to NOT be classified as browser-only`
    );
    assert.strictEqual(result.category, undefined);
  }
});
