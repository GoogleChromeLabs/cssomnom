---
name: wpt-fixture-extractor
description: Extracts test cases from W3C Web Platform Tests (WPT) into JSON fixtures.
---

# WPT Fixture Extractor

This skill is used to extract test cases from the W3C WPT submodule into local JSON fixtures for test-driven development.

## Workflow
1.  **Target Directory**: Identify the target directory in \`submodules/wpt/\` (e.g., \`css/cssom/\`).
2.  **Parse Tests**: Read the HTML or JS files in the target directory to extract CSS input and expected serialization or object model state.
3.  **Generate Fixtures**: Create or update a JSON file in \`tests/fixtures/\` with the extracted test cases.
4.  **Verify**: Ensure the generated JSON is valid and structured correctly for our test harness.

## Constraints
- Do not modify WPT files.
- Ensure high fidelity in extraction.
- **DO NOT GENERATE TEST CASES**: You must ONLY extract test cases that are explicitly written or dynamically generated *within the WPT source files themselves* (e.g., by reading the arguments of `test_valid_value` calls). Do not write scripts to generate new permutations or combinations that are not present in the WPT source.
