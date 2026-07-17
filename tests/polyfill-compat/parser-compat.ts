import { CSSStyleValue, CSSColorValue, tokenize } from '../../src/index.ts';

export function parseCSSValue(property: string, value: string) {
  const parsed = CSSStyleValue.parse(property, value);
  if (parsed instanceof CSSColorValue) {
    return new CSSStyleValue(value);
  }
  return parsed;
}

export function parseAllCSSValues(property: string, value: string) {
  const parsed = CSSStyleValue.parseAll(property, value);
  return parsed.map(v => v instanceof CSSColorValue ? new CSSStyleValue(v.toString()) : v);
}

export function parseColor(color: string) {
  return CSSColorValue.parse(color);
}

export function tokenizeString(str: string) {
  return tokenize(str).filter(t => t.type !== 'EOF');
}
