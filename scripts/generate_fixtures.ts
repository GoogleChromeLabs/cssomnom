/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const FIXTURES_DIR = path.resolve(import.meta.dirname, 'fixtures');

function main() {
    console.log('Starting full fixture generation...');
    
    const scripts = fs.readdirSync(FIXTURES_DIR)
        .filter(file => file.endsWith('.ts'))
        .sort();

    for (const script of scripts) {
        const scriptPath = path.join(FIXTURES_DIR, script);
        console.log(`\nRunning ${scriptPath}...`);
        
        const result = spawnSync('node', [scriptPath], {
            stdio: 'inherit',
            shell: true
        });

        if (result.status !== 0) {
            console.error(`Error: ${scriptPath} failed with exit code ${result.status}`);
            process.exit(1);
        }
    }

    console.log('\nAll fixture generation scripts completed successfully.');
}

main();
