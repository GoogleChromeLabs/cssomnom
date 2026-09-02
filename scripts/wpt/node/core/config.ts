/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { WptConfig, SpecName } from './types.ts';

export const VALID_SPECS = [
  'css-typed-om',
  'selectors',
  'cssom',
  'css-variables',
  'mediaqueries',
  'css-syntax',
  'css-nesting',
  'css-cascade',
] as const satisfies readonly SpecName[];

export const SPEC_DISPLAY_NAMES: Record<string, string> = {
  'css-typed-om': 'Typed OM',
  'cssom': 'CSSOM',
  'css-nesting': 'Nesting',
  'css-syntax': 'Syntax',
  'css-variables': 'Variables',
  'selectors': 'Selectors',
  'mediaqueries': 'Media Queries',
  'css-cascade': 'Cascade',
};

export const SPEC_ORDER: readonly SpecName[] = [
  'css-typed-om',
  'cssom',
  'css-nesting',
  'css-syntax',
  'css-cascade',
  'css-variables',
  'selectors',
  'mediaqueries',
];

export interface DomainGroup {
  id: string;
  displayName: string;
  specs: readonly SpecName[];
}

export const DOMAIN_GROUPS: readonly DomainGroup[] = [
  {
    id: 'typed-om',
    displayName: 'Typed OM',
    specs: ['css-typed-om'],
  },
  {
    id: 'core-cssom',
    displayName: 'Core CSSOM',
    specs: ['cssom', 'css-syntax', 'css-nesting'],
  },
  {
    id: 'cascade-values',
    displayName: 'Cascade & Values',
    specs: ['css-cascade', 'css-variables'],
  },
  {
    id: 'selectors-mq',
    displayName: 'Selectors & MQ',
    specs: ['selectors', 'mediaqueries'],
  },
] as const;

export interface ManifestEntry {
  file: string;
  category: string;
  clusterId: string;
  description: string;
}

export function getBrowserOnlyManifestPath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'tests/fixtures/wpt-browser-only-manifest.json');
}

export function loadBrowserOnlyManifest(customPath?: string): Record<string, ManifestEntry[]> {
  const manifestPath = customPath ?? getBrowserOnlyManifestPath();
  if (!fs.existsSync(manifestPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, ManifestEntry[]>;
}

export function getBrowserOnlyFileCount(spec: string, manifest?: Record<string, ManifestEntry[]>): number {
  const data = manifest ?? loadBrowserOnlyManifest();
  return data[spec]?.length ?? 0;
}

export function isBrowserOnlyFile(spec: string, relativeFilePath: string, manifest?: Record<string, ManifestEntry[]>): boolean {
  const data = manifest ?? loadBrowserOnlyManifest();
  const entries = data[spec];
  if (!entries) return false;
  const normalized = relativeFilePath.replace(/^submodules\/web-platform-tests\//, '');
  return entries.some(e => e.file === normalized);
}
export function getConfigPath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'tests/wpt-node-config.json');
}

export function getBaselinePath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'tests/fixtures/baselines/wpt-passing-set-baseline.json');
}

export function getProgressPath(cwd = process.cwd()): string {
  return path.resolve(cwd, 'wpt-progress.md');
}

export function validateSpecName(name: string): name is SpecName {
  return (VALID_SPECS as readonly string[]).includes(name);
}

export function loadWptConfig(customPath?: string): WptConfig {
  const configPath = customPath ?? getConfigPath();
  if (!fs.existsSync(configPath)) {
    throw new Error(`WPT node config not found at: ${configPath}`);
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content) as WptConfig;
}
