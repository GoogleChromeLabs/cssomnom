/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  banner: {
    js: '// @ts-nocheck',
  },
});
