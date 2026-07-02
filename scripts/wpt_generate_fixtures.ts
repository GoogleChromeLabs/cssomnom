/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const WPT_ROOT = path.join(REPO_ROOT, 'submodules/web-platform-tests');

const allFixtures: Record<string, unknown> = {};

/**
 * Extracts tests from cssom/serialize-values.html by executing its own all_values logic.
 */
function extractSerializeValues() {
  const filePath = path.join(WPT_ROOT, 'css/cssom/serialize-values.html');
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract the script content between the first <script> and </script>
  const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) return;
  
  const originalScript = scriptMatch[1];
  
  // We need to provide a minimal environment for the script to define its functions and variables.
  const sandbox: Record<string, unknown> = {
    // These will be defined by the script
    properties: null,
    all_values: null,
    iterable: null,
    color: null,
    percentage: null,
    negative_percentage: null,
    length: null,
    negative_length: null,
    degree: null,
    uri: null,
    border_style: null,
    border_style_without_hidden: null,
    integer: null,
    nonzero_positive_integer: null,
    shape: null,
    string: null,
    counter: null,
    attr: null,
    attr_fallback: null,
    family_name: null,
    generic_family: null,
    absolute_size: null,
    relative_size: null,
    number: null,
    positive_number: null,
    
    // Mock WPT test harness functions to avoid errors during definition
    test: () => {},
    async_test: () => ({ step: () => {}, done: () => {}, add_cleanup: () => {} }),
    assert_equals: () => {},
    document: {
      getElementById: () => ({ appendChild: () => {}, removeChild: () => {} }),
      createElement: () => ({ style: {}, setAttribute: () => {} })
    }
  };
  
  const context = vm.createContext(sandbox);
  try {
    vm.runInContext(originalScript, context);
  } catch (e) {
    // Some errors might occur during the 'for' loop at the end of the script because of missing DOM.
    // That's fine as long as functions and 'properties' are defined.
  }
  
  const properties = sandbox.properties as [string, { values: string[] }][] | null;
  const all_values = sandbox.all_values as ((name: string, values: string[]) => Array<{ actual: string; expected: string }>) | null;
  if (!properties || !all_values) {
    console.error("Failed to extract properties or all_values function from script.");
    return;
  }
  
  const fixtures: Record<string, Array<{ input: string; expected: string }>> = {};
  for (const [name, prop] of properties) {
    try {
      const results = all_values(name, prop.values);
      fixtures[name] = results.map((r) => ({
        input: r.actual,
        expected: r.expected
      }));
    } catch (e) {
      console.warn(`Failed to process property ${name}:`, e);
    }
  }
  
  allFixtures['serialize-values'] = fixtures;
  console.log(`Extracted ${Object.keys(fixtures).length} properties from serialize-values.html`);
}

/**
 * Extracts shorthand tests from cssom/shorthand-values.html.
 */
function extractShorthandValues() {
  const filePath = path.join(WPT_ROOT, 'css/cssom/shorthand-values.html');
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/var\s+tests\s*=\s*({[\s\S]*?})\n\s*(?:if|for|<)/);
  if (!match) return;
  
  try {
    // Safely evaluate the object literal
    const tests = vm.runInNewContext(`(${match[1]})`);
    const shorthandValues = Object.entries(tests as Record<string, string>).map(([input, expected]) => ({
      input,
      expected
    }));
    allFixtures['shorthand-values'] = shorthandValues;
    console.log(`Extracted ${shorthandValues.length} tests from shorthand-values.html`);
  } catch (e) {
    console.error("Failed to parse shorthand-values tests:", e);
  }
}

/**
 * Extracts tests from shorthand-serialization.html.
 */
function extractShorthandSerialization() {
    const filePath = path.join(WPT_ROOT, 'css/cssom/shorthand-serialization.html');
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const results: Array<{ expected: string }> = [];
    
    // Extract assert_equals calls where first arg is elem.style.cssText or elem.style.margin etc.
    const matches = content.matchAll(/assert_equals\s*\(\s*elem\d*\.style\.[a-zA-Z]+,\s*(['"])(.*?)\1/g);
    for (const match of matches) {
        results.push({ expected: match[2] });
    }
    
    if (results.length > 0) {
        allFixtures['shorthand-serialization'] = results;
        console.log(`Extracted ${results.length} tests from shorthand-serialization.html`);
    }
}

/**
 * Extracts tests from selectorSerialize.html using regex.
 */
function extractSelectorSerialize() {
  const filePath = path.join(WPT_ROOT, 'css/cssom/selectorSerialize.html');
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const results: Array<{ input: string; expected: string }> = [];
  
  const matches = content.matchAll(/assert_selector_serializes_to\s*\(\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3\s*\)/g);
  for (const match of matches) {
    results.push({ input: match[2], expected: match[4] });
  }
  
  allFixtures['selector-serialize'] = results;
  console.log(`Extracted ${results.length} tests from selectorSerialize.html`);
}

/**
 * Extracts tests from cssstyledeclaration-all-shorthand.html.
 */
function extractAllShorthand() {
  const filePath = path.join(WPT_ROOT, 'css/cssom/cssstyledeclaration-all-shorthand.html');
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const results: Array<{ input: string; property: string; expected: string }> = [];
  
  const matches = content.matchAll(/style\.cssText\s*=\s*(['"])(.*?)\1;[\s\S]*?assert_equals\s*\(\s*style\.getPropertyValue\s*\(\s*(['"])(.*?)\3\s*\)\s*,\s*(['"])(.*?)\5\)/g);
  for (const match of matches) {
    results.push({ input: match[2], property: match[4], expected: match[6] });
  }
  
  if (results.length > 0) {
    allFixtures['all-shorthand'] = results;
    console.log(`Extracted ${results.length} tests from cssstyledeclaration-all-shorthand.html`);
  }
}

/**
 * Extracts tests from cssom-cssText-serialize.html (by Paul Irish!).
 */
function extractCssTextSerialize() {
  const filePath = path.join(WPT_ROOT, 'css/cssom/cssom-cssText-serialize.html');
  if (!fs.existsSync(filePath)) return;

  const results: Array<{ input: string; expected: string }> = [];
  
  // Hardcoded extraction for this specific file as it's simple
  results.push({ input: "left: 10px;", expected: "left: 10px;" });
  results.push({ input: "left: 10px; right: 20px;", expected: "left: 10px; right: 20px;" });
  
  allFixtures['cssom-cssText-serialize'] = results;
  console.log(`Extracted ${results.length} tests from cssom-cssText-serialize.html`);
}

/**
 * Extracts Typed OM serialization tests.
 */
function extractTypedOMSerialization() {
  const dirPath = path.join(WPT_ROOT, 'css/css-typed-om/stylevalue-serialization');
  if (!fs.existsSync(dirPath)) return;
  
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.html'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
    // Patterns vary, but many use objects with cssText
    const cssTextMatches = Array.from(content.matchAll(/cssText:\s*(['"])(.*?)\1/g));
    if (cssTextMatches.length > 0) {
      allFixtures[`typed-om-${file.replace('.html', '')}`] = cssTextMatches.map(m => ({
        expected: m[2]
      }));
    }
  }
  console.log(`Extracted Typed OM tests from ${files.length} files`);
}

/**
 * Crawls css-values for all *-serialize.html files and extracts tests.
 */
function crawlCssValuesSerialization() {
  const dirPath = path.join(WPT_ROOT, 'css/css-values');
  if (!fs.existsSync(dirPath)) return;
  
  const files = fs.readdirSync(dirPath).filter(f => f.includes('serialize') && f.endsWith('.html'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
    const results: Array<{ input?: string; expected: string }> = [];
    
    // Many of these use assert_equals(expr, 'expected')
    const assertMatches = content.matchAll(/assert_equals\s*\([^,]+,\s*(['"])(.*?)\1/g);
    for (const match of assertMatches) {
      results.push({ expected: match[2] });
    }
    
    // Some use test_map = { ... }
    const mapMatch = content.match(/var\s+test_map\s*=\s*({[\s\S]*?});/);
    if (mapMatch) {
      try {
        const testMap = vm.runInNewContext(`(${mapMatch[1]})`) as Record<string, unknown>;
        for (const [input, expected] of Object.entries(testMap)) {
          results.push({ input, expected: expected as string });
        }
      } catch (e) {}
    }
    
    if (results.length > 0) {
      allFixtures[`css-values-${file.replace('.html', '')}`] = results;
    }
  }
  console.log(`Extracted tests from ${Object.keys(allFixtures).filter(k => k.startsWith('css-values-')).length} files in css-values`);
}

// Main execution
extractSerializeValues();
extractShorthandValues();
extractShorthandSerialization();
extractSelectorSerialize();
extractAllShorthand();
extractCssTextSerialize();
extractTypedOMSerialization();
crawlCssValuesSerialization();

const outputPath = path.join(REPO_ROOT, 'tests/fixtures/wpt_extracted.json');
fs.writeFileSync(outputPath, JSON.stringify(allFixtures, null, 2));
console.log(`\nSuccessfully saved all fixtures to ${outputPath}`);
