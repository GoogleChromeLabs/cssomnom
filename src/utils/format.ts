/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

const formatter = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

export function formatNumber(val: number): string {
  if (val === 0) {
    return '0';
  }
  if (!Number.isFinite(val)) {
    if (val === Infinity) return 'infinity';
    if (val === -Infinity) return '-infinity';
    return 'nan';
  }
  const formatted = formatter.format(val);
  return formatted === '-0' ? '0' : formatted;
}
