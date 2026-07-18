/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const reportPath = path.resolve('dist/report-chrome.json');
const outputPath = path.resolve('dist/wpt-chrome-expected.txt');
const readmePath = path.resolve('README.md');

try {
  if (!fs.existsSync(reportPath)) {
    console.error(`Report file not found at: ${reportPath}`);
    process.exit(1);
  }

  console.log(`Reading report from ${reportPath}...`);
  const rawData = fs.readFileSync(reportPath, 'utf8');
  const data = JSON.parse(rawData);

  let output = '';
  let passCount = 0;
  let failCount = 0;
  let totalCount = 0;

  if (data && Array.isArray(data.results)) {
    console.log(`Processing ${data.results.length} test results...`);

    // Sort results by test path alphabetically to ensure deterministic diffs
    const sortedResults = [...data.results].sort((a, b) => {
      const pathA = (a.test || '') as string;
      const pathB = (b.test || '') as string;
      return pathA.localeCompare(pathB);
    });

    for (const result of sortedResults) {
      const testPath = result.test as string;
      const status = result.status as string;
      output += `${status}\t${testPath}\n`;

      if (!result.subtests || result.subtests.length === 0) {
        totalCount++;
        if (status === 'OK' || status === 'PASS') {
          passCount++;
        } else {
          failCount++;
        }
      }

      if (Array.isArray(result.subtests)) {
        // Sort subtests by name alphabetically
        const sortedSubtests = [...result.subtests].sort((a, b) => {
          const nameA = (a.name || '') as string;
          const nameB = (b.name || '') as string;
          return nameA.localeCompare(nameB);
        });

        for (const subtest of sortedSubtests) {
          const subtestName = subtest.name as string;
          const subtestStatus = subtest.status as string;
          output += `- ${subtestStatus}\t${subtestName}\n`;

          totalCount++;
          if (subtestStatus === 'PASS') {
            passCount++;
          } else {
            failCount++;
          }
        }
      }
    }
  } else {
    console.error('Invalid data format: "results" array not found in report.');
    process.exit(1);
  }

  console.log(`Writing expected results to ${outputPath}...`);
  fs.writeFileSync(outputPath, output, 'utf8');

  // Update WPT status in README.md
  if (fs.existsSync(readmePath)) {
    console.log(`Updating WPT status in README.md...`);
    let readmeContent = fs.readFileSync(readmePath, 'utf8');
    const startTag = '<!-- WPT_CHROME_STATUS_START -->';
    const endTag = '<!-- WPT_CHROME_STATUS_END -->';

    const startIndex = readmeContent.indexOf(startTag);
    const endIndex = readmeContent.indexOf(endTag);

    if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
      const before = readmeContent.substring(0, startIndex + startTag.length);
      const after = readmeContent.substring(endIndex);
      
      const passPercent = totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(2) : '0.00';
      const replacement = `\n### Headless Chrome Conformance\n- **Pass Rate**: ${passPercent}% (${passCount} / ${totalCount} passed)\n- **Failed Assertions**: ${failCount}\n`;

      readmeContent = before + replacement + after;
      fs.writeFileSync(readmePath, readmeContent, 'utf8');
      console.log('README.md updated successfully.');
    } else {
      console.warn('Could not find <!-- WPT_CHROME_STATUS_START --> tags in README.md');
    }
  }

  console.log(`Done! Pass rate: ${passCount} / ${totalCount} (${(passCount / totalCount * 100).toFixed(2)}%)`);
} catch (err) {
  console.error('Failed to generate WPT report:', err);
  process.exit(1);
}
