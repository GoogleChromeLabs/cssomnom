/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'cssomnom.iife': 'src/browser-entry.ts',
  },
  format: ['iife'],
  minify: false,
  clean: false,
  dts: false,
  outDir: 'dist',
  platform: 'browser',
});
