/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */

/**
 * Serializes an identifier per CSSOM Level 1 § 3 and § 2.3.
 * @see https://drafts.csswg.org/cssom-1/#the-css.escape()-method
 * @see https://drafts.csswg.org/cssom-1/#serialize-an-identifier
 */
// cssom-1 § 3 #the-css.escape()-method
// cssom-1 § 2.3 #serialize-an-identifier
export function escape(ident: unknown): string {
  if (arguments.length === 0) {
    throw new TypeError("Failed to execute 'escape' on 'CSS': 1 argument required, but only 0 present.");
  }
  const string = String(ident);
  const length = string.length;
  let result = '';

  for (let index = 0; index < length; index++) {
    const codeUnit = string.charCodeAt(index);

    // 1. If the character is NULL (U+0000), then the REPLACEMENT CHARACTER (U+FFFD).
    // cssom-1 § 2.3 #serialize-an-identifier
    if (codeUnit === 0x0000) {
      result += '\uFFFD';
      continue;
    }

    // 2. If the character is in the range [\1-\1f] (U+0001 to U+001F) or is U+007F, then the character escaped as code point.
    // cssom-1 § 2.3 #serialize-an-identifier
    if ((codeUnit >= 0x0001 && codeUnit <= 0x001F) || codeUnit === 0x007F) {
      result += '\\' + codeUnit.toString(16) + ' ';
      continue;
    }

    // 3. If the character is the first character and is in the range [0-9] (U+0030 to U+0039), then the character escaped as code point.
    // cssom-1 § 2.3 #serialize-an-identifier
    if (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) {
      result += '\\' + codeUnit.toString(16) + ' ';
      continue;
    }

    // 4. If the character is the second character and is in the range [0-9] (U+0030 to U+0039) and the first character is a "-" (U+002D), then the character escaped as code point.
    // cssom-1 § 2.3 #serialize-an-identifier
    if (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && string.charCodeAt(0) === 0x002D) {
      result += '\\' + codeUnit.toString(16) + ' ';
      continue;
    }

    // 5. If the character is the first character and is a "-" (U+002D), and there is no second character, then the escaped character.
    // cssom-1 § 2.3 #serialize-an-identifier
    if (index === 0 && codeUnit === 0x002D && length === 1) {
      result += '\\' + string.charAt(index);
      continue;
    }

    // 6. If the character is not handled by one of the above rules and is greater than or equal to U+0080, is "-" (U+002D) or "_" (U+005F), or is in one of the ranges [0-9] (U+0030 to U+0039), [A-Z] (U+0041 to U+005A), or [a-z] (U+0061 to U+007A), then the character itself.
    // cssom-1 § 2.3 #serialize-an-identifier
    if (
      codeUnit >= 0x0080 ||
      codeUnit === 0x002D ||
      codeUnit === 0x005F ||
      (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (codeUnit >= 0x0041 && codeUnit <= 0x005A) ||
      (codeUnit >= 0x0061 && codeUnit <= 0x007A)
    ) {
      result += string.charAt(index);
      continue;
    }

    // 7. Otherwise, the escaped character.
    // cssom-1 § 2.3 #serialize-an-identifier
    result += '\\' + string.charAt(index);
  }

  return result;
}
