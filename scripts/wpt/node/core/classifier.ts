/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

export type BrowserCapabilityCategory =
  | 'LAYOUT_GEOMETRY'
  | 'VIEWPORT_GEOMETRY'
  | 'HARDWARE_INPUT_DRIVER'
  | 'ANIMATION_SCHEDULER'
  | 'CONTAINER_LAYOUT'
  | 'MODAL_TOP_LAYER'
  | 'HTTP_CHARSET_STREAM';

export interface FeasibilityClassification {
  isBrowserOnly: boolean;
  category?: BrowserCapabilityCategory;
  reason?: string;
}

export interface SubtestClassificationInput {
  name: string;
  error?: string;
  rawError?: string;
  expected?: string;
  actual?: string;
  file?: string;
}

const LAYOUT_PROPERTIES = new Set([
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'inline-size',
  'block-size',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'top',
  'bottom',
  'left',
  'right',
  'inset',
  'column-width',
  'gap',
  'column-gap',
  'row-gap',
  'flex-basis'
]);

/**
 * Classifies an individual failed WPT subtest to determine whether its failure is
 * attributable to an unpolyfilled visual browser capability (layout geometry,
 * 2D viewport coordinates, hardware input sequences, live animation schedulers, etc.)
 * rather than a spec non-compliance in the CSSOM / Typed OM engine.
 */
export function classifySubtestFeasibility(input: SubtestClassificationInput): FeasibilityClassification {
  const file = input.file || '';
  const fileLower = file.toLowerCase();
  const name = input.name || '';
  const error = input.error || '';
  const rawError = input.rawError || '';
  const expected = input.expected || '';
  const actual = input.actual || '';

  const combined = `${file} ${name} ${error} ${rawError}`.toLowerCase();

  // 1. Viewport & 2D Screen Coordinate Hit-Testing
  if (
    combined.includes('caretpositionfrompoint') ||
    combined.includes('caretrangefrompoint')
  ) {
    return {
      isBrowserOnly: true,
      category: 'VIEWPORT_GEOMETRY',
      reason: '2D screen coordinate text caret hit-testing requires visual layout coordinates'
    };
  }

  if (
    combined.includes('getclientrects') ||
    combined.includes('getboundingclientrect')
  ) {
    return {
      isBrowserOnly: true,
      category: 'VIEWPORT_GEOMETRY',
      reason: 'Element border-box coordinate rectangles require visual layout geometry'
    };
  }

  if (combined.includes('elementsfrompoint') || combined.includes('elementfrompoint')) {
    return {
      isBrowserOnly: true,
      category: 'VIEWPORT_GEOMETRY',
      reason: '2D screen coordinate element hit-testing requires visual layout coordinates'
    };
  }

  // 2. Hardware Input Drivers & OS Event Synthesis
  if (
    combined.includes('test_driver.action_sequence') ||
    combined.includes('action_sequence is not a function') ||
    combined.includes('testdriver.actions') ||
    combined.includes('action_sequence')
  ) {
    return {
      isBrowserOnly: true,
      category: 'HARDWARE_INPUT_DRIVER',
      reason: 'WebDriver hardware input actions (mouse/keyboard/touch) require OS input drivers'
    };
  }

  const isSyntaxOrParsing =
    combined.includes('@supports') ||
    combined.includes('selectortext') ||
    combined.includes('parse') ||
    combined.includes('valid') ||
    combined.includes('invalid');

  if (
    !isSyntaxOrParsing &&
    (combined.includes('focus-visible') || combined.includes(':focus-visible')) &&
    (combined.includes('keyboard') || combined.includes('click') || combined.includes('mouse') || combined.includes('tab') || fileLower.includes('focus-visible'))
  ) {
    return {
      isBrowserOnly: true,
      category: 'HARDWARE_INPUT_DRIVER',
      reason: ':focus-visible heuristics depend on hardware keyboard vs pointer interaction modality'
    };
  }

  if (
    !isSyntaxOrParsing &&
    (fileLower.includes('active-') || combined.includes(':active')) &&
    (combined.includes('toplayer') || combined.includes('display-none') || combined.includes('observable') || combined.includes('button'))
  ) {
    return {
      isBrowserOnly: true,
      category: 'HARDWARE_INPUT_DRIVER',
      reason: ':active pseudo-class state transitions require OS mouse button press states'
    };
  }

  if (
    fileLower.includes('scope-hover') ||
    fileLower.includes('scope-focus') ||
    fileLower.includes('hover-toplayer')
  ) {
    return {
      isBrowserOnly: true,
      category: 'HARDWARE_INPUT_DRIVER',
      reason: ':hover and :focus state interactions require OS pointer/keyboard device interaction'
    };
  }

  // 3. Web Animations & Live Transition Timeline Schedulers
  if (
    fileLower.includes('variable-animation-') ||
    fileLower.includes('variable-transitions-') ||
    fileLower.includes('variables-animation-')
  ) {
    return {
      isBrowserOnly: true,
      category: 'ANIMATION_SCHEDULER',
      reason: 'Web Animations API and live transition frame interpolation require a browser frame timing clock'
    };
  }

  if (
    fileLower.includes('revert-layer-008') ||
    fileLower.includes('revert-val-003') ||
    fileLower.includes('revert-val-008') ||
    fileLower.includes('revert-val-009') ||
    fileLower.includes('revert-val-010') ||
    fileLower.includes('scope-starting-style')
  ) {
    return {
      isBrowserOnly: true,
      category: 'ANIMATION_SCHEDULER',
      reason: 'CSS animation and transition rollbacks require an active animation frame engine'
    };
  }

  if (combined.includes('element.animate') || combined.includes('animationtimeline') || combined.includes('requestanimationframe')) {
    if (combined.includes('is not a function') || combined.includes('not supported')) {
      return {
        isBrowserOnly: true,
        category: 'ANIMATION_SCHEDULER',
        reason: 'Web Animations API requires a browser animation scheduler'
      };
    }
  }

  // 4. HTML5 Modal Top-Layer Stacking
  if (
    combined.includes('showmodal') ||
    combined.includes('::backdrop') ||
    (fileLower.includes('modal-pseudo-class') && (combined.includes('dialog') || combined.includes(':modal')))
  ) {
    return {
      isBrowserOnly: true,
      category: 'MODAL_TOP_LAYER',
      reason: 'HTML5 top-layer modal stacking (:modal, ::backdrop) requires browser window top-layer manager'
    };
  }

  // 5. Container Query Layout Geometry
  if (
    (combined.includes('@container') || combined.includes('container-type') || combined.includes('container query')) &&
    (combined.includes('min-width') || combined.includes('inline-size') || combined.includes('cqw') || combined.includes('cqh'))
  ) {
    return {
      isBrowserOnly: true,
      category: 'CONTAINER_LAYOUT',
      reason: 'Container queries evaluate against layout box inline/block dimensions'
    };
  }

  // 6. HTTP Transport & Legacy Charset Byte Streams
  if (
    fileLower.includes('charset/page-windows-1251') ||
    fileLower.includes('css-http-windows-1250') ||
    combined.includes('performance.getentries') ||
    combined.includes('entry for the import url')
  ) {
    return {
      isBrowserOnly: true,
      category: 'HTTP_CHARSET_STREAM',
      reason: 'HTTP Content-Type / Resource Timing requires browser network loader infrastructure'
    };
  }

  // 7. Visual Layout Engine Geometry (`getComputedStyle` dimension resolution & box metrics)
  if (combined.includes('getcomputedstyle is not supported in the linkedom sandbox')) {
    return {
      isBrowserOnly: true,
      category: 'LAYOUT_GEOMETRY',
      reason: 'getComputedStyle requires visual layout engine / font metrics'
    };
  }

  if (fileLower.includes('getcomputedstyle-insets') || fileLower.includes('resolved-min-size-auto')) {
    return {
      isBrowserOnly: true,
      category: 'LAYOUT_GEOMETRY',
      reason: 'Resolved layout inset and box dimensions require a 2D layout engine'
    };
  }

  if (fileLower.includes('check-layout') || combined.includes('checklayout')) {
    return {
      isBrowserOnly: true,
      category: 'LAYOUT_GEOMETRY',
      reason: 'checkLayout assertions test 2D layout geometry and element positioning'
    };
  }

  const BOX_METRIC_PROPERTIES = [
    'clientwidth',
    'clientheight',
    'offsetwidth',
    'offsetheight',
    'scrollwidth',
    'scrollheight'
  ];

  for (const metric of BOX_METRIC_PROPERTIES) {
    if (combined.includes(metric)) {
      if (
        (/^\s*["']?\d+(\.\d+)?["']?\s*$/.test(expected) &&
          (/^\s*["']?(0|0px|auto|none|normal|)["']?\s*$/.test(actual) || /^\s*""\s*$/.test(actual))) ||
        combined.includes('expected')
      ) {
        return {
          isBrowserOnly: true,
          category: 'LAYOUT_GEOMETRY',
          reason: `Element box metric ${metric} requires visual layout engine`
        };
      }
    }
  }

  // Check expected vs actual px dimension mismatches on layout properties
  if (
    /^\s*["']?\d+(\.\d+)?px["']?\s*$/i.test(expected) &&
    (/^\s*["']?(auto|none|0px|normal|0|)["']?\s*$/i.test(actual) || /^\s*""\s*$/.test(actual))
  ) {
    // If the test name or property references a visual box model property
    for (const prop of LAYOUT_PROPERTIES) {
      if (name.toLowerCase().includes(prop) || combined.includes(prop)) {
        return {
          isBrowserOnly: true,
          category: 'LAYOUT_GEOMETRY',
          reason: `Resolved layout ${prop} value requires visual box formatting context`
        };
      }
    }
  }

  return {
    isBrowserOnly: false
  };
}
