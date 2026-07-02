/** @license Copyright 2026 Google LLC. SPDX-License-Identifier: Apache-2.0 */
import type { Token, ParseError } from './types.ts';

export abstract class AbstractTokenizer {
  public unicodeRangesAllowed: boolean = false;
  protected abstract get cp(): number;
  protected abstract peek(offset: number): number;
  protected abstract consume(): number;
  protected abstract reconsume(): void;
  protected abstract slice(start: number, end: number): string;
  protected abstract getPosition(): number;
  
  public errors: ParseError[] = [];

  protected parseError(message: string): void {
    this.errors.push({ message });
    console.warn(`CSS Parse Error: ${message}`);
  }

  // 4.3.1 Consume a token
  protected consumeToken(): Token {
    while (true) {
      this.consumeComments();
      const cp = this.consume();

      if (cp === -1) {
        return { type: 'EOF', value: '' };
      }

      if (this.isWhitespace(cp)) {
        while (this.isWhitespace(this.cp)) {
          this.consume();
        }
        return { type: 'whitespace', value: ' ' };
      }

    switch (cp) {
      case 0x0022: // "
        return this.consumeStringToken(0x0022);

      case 0x0023: // #
        if (this.isIdentCodePoint(this.cp) || this.isValidEscape(this.cp, this.peek(1))) {
          const token: Token = { type: 'hash', value: '', hashType: 'unrestricted' };
          if (this.wouldStartIdentSequence(this.cp, this.peek(1), this.peek(2))) {
            token.hashType = 'id';
          }
          token.value = this.consumeIdentSequence();
          return token;
        }
        return { type: 'delim', value: String.fromCodePoint(cp) };

      case 0x0027: // '
        return this.consumeStringToken(0x0027);

      case 0x0028: // (
        return { type: '(', value: '(' };

      case 0x0029: // )
        return { type: ')', value: ')' };

      case 0x002B: // +
        if (this.wouldStartNumber(cp, this.cp, this.peek(1))) {
          this.reconsume();
          return this.consumeNumericToken();
        }
        return { type: 'delim', value: '+' };

      case 0x002C: // ,
        return { type: 'comma', value: ',' };

      case 0x002D: // -
        if (this.wouldStartNumber(cp, this.cp, this.peek(1))) {
          this.reconsume();
          return this.consumeNumericToken();
        }
        if (this.cp === 0x002D && this.peek(1) === 0x003E) { // ->
          this.consume();
          this.consume();
          return { type: 'CDC', value: '-->' };
        }
        if (this.wouldStartIdentSequence(cp, this.cp, this.peek(1))) {
          this.reconsume();
          return this.consumeIdentLikeToken();
        }
        return { type: 'delim', value: '-' };

      case 0x002E: // .
        if (this.wouldStartNumber(cp, this.cp, this.peek(1))) {
          this.reconsume();
          return this.consumeNumericToken();
        }
        return { type: 'delim', value: '.' };

      case 0x002F: // /
        return { type: 'delim', value: '/' };

      case 0x003A: // :
        return { type: 'colon', value: ':' };

      case 0x003B: // ;
        return { type: 'semicolon', value: ';' };

      case 0x003C: // <
        if (this.cp === 0x0021 && this.peek(1) === 0x002D && this.peek(2) === 0x002D) { // <!--
          this.consume();
          this.consume();
          this.consume();
          return { type: 'CDO', value: '<!--' };
        }
        return { type: 'delim', value: '<' };

      case 0x0040: // @
        if (this.wouldStartIdentSequence(this.cp, this.peek(1), this.peek(2))) {
          const value = this.consumeIdentSequence();
          return { type: 'at-keyword', value };
        }
        return { type: 'delim', value: '@' };

      case 0x005B: // [
        return { type: '[', value: '[' };

      case 0x005C: // \
        if (this.isValidEscape(cp, this.cp)) {
          this.reconsume();
          return this.consumeIdentLikeToken();
        }
        this.parseError('Invalid escape sequence');
        return { type: 'delim', value: '\\' };

      case 0x005D: // ]
        return { type: ']', value: ']' };

      case 0x007B: // {
        return { type: '{', value: '{' };

      case 0x007D: // }
        return { type: '}', value: '}' };
    }

    if (this.isDigit(cp)) {
      this.reconsume();
      return this.consumeNumericToken();
    }

    if (this.isIdentStartCodePoint(cp)) {
      this.reconsume();
      if (this.unicodeRangesAllowed && this.wouldStartUnicodeRange(this.cp, this.peek(1), this.peek(2))) {
        this.consume(); // U
        this.consume(); // +
        return this.consumeUnicodeRangeToken();
      }
      return this.consumeIdentLikeToken();
    }

    return { type: 'delim', value: String.fromCodePoint(cp) };
    }
  }

  // 4.3.2 Consume comments
  protected consumeComments(): void {
    while (this.cp === 0x002F && this.peek(1) === 0x002A) { // /*
      this.consume();
      this.consume();
      while (true) {
        const cp = this.consume();
        if (cp === -1) {
          this.parseError('EOF reached before comment was closed');
          return;
        }
        if (cp === 0x002A && this.cp === 0x002F) { // */
          this.consume();
          break;
        }
      }
    }
  }

  // 4.3.3 Consume a numeric token
  protected consumeNumericToken(): Token {
    const number = this.consumeNumber();
    if (this.wouldStartIdentSequence(this.cp, this.peek(1), this.peek(2))) {
      const unit = this.consumeIdentSequence();
      return { type: 'dimension', value: number.value, unit, numberType: number.type, sign: number.sign };
    }
    if (this.cp === 0x0025) { // %
      this.consume();
      // Spec cites: "Note that percentage tokens, intentionally, don't preserve the integer/number distinction."
      return { type: 'percentage', value: number.value, sign: number.sign };
    }
    return { type: 'number', value: number.value, numberType: number.type, sign: number.sign };
  }


  // 4.3.4 Consume an ident-like token
  protected consumeIdentLikeToken(): Token {
    const string = this.consumeIdentSequence();
    if (string.toLowerCase() === 'url' && this.cp === 0x0028) { // (
      this.consume();
      while (this.isWhitespace(this.cp) && this.isWhitespace(this.peek(1))) {
        this.consume();
      }
      const currentCp = this.cp as number;
      if (currentCp === 0x0022 || currentCp === 0x0027 ||
          (this.isWhitespace(currentCp) && (this.peek(1) === 0x0022 || this.peek(1) === 0x0027))) {
        return { type: 'function', value: string };
      }
      return this.consumeUrlToken();
    }
    if (this.cp === 0x0028) { // (
      this.consume();
      return { type: 'function', value: string };
    }
    return { type: 'ident', value: string };
  }

  // 4.3.5 Consume a string token
  protected consumeStringToken(endingCodePoint: number): Token {
    const startPos = this.getPosition();
    let hasEscapes = false;
    let result = '';

    while (true) {
      const cp = this.consume();
      if (cp === endingCodePoint || cp === -1) {
        if (cp === -1) {
          this.parseError('EOF reached before string was closed');
        }
        if (!hasEscapes) {
          // We don't include the ending quote
          // But wait! getPosition() - 1 gets the position before the quote
          // Wait, if it's EOF, we don't subtract 1
          const lengthOffset = cp === -1 ? 0 : 1;
          const str = this.slice(startPos, this.getPosition() - lengthOffset);
          return { type: 'string', value: str };
        }
        return { type: 'string', value: result };
      }
      if (this.isNewline(cp)) {
        this.parseError('Newline reached before string was closed');
        this.reconsume();
        if (!hasEscapes) {
          return { type: 'bad-string', value: this.slice(startPos, this.getPosition()) };
        }
        return { type: 'bad-string', value: result };
      }
      if (cp === 0x005C) { // \
        if (!hasEscapes) {
          hasEscapes = true;
          this.reconsume();
          result = this.slice(startPos, this.getPosition());
          this.consume(); // Consume '\' again
        }
        if (this.cp === -1) {
          // Do nothing
        } else if (this.isNewline(this.cp)) {
          this.consume();
        } else {
          result += String.fromCodePoint(this.consumeEscapedCodePoint());
        }
      } else {
        if (hasEscapes) {
          result += String.fromCodePoint(cp);
        }
      }
    }
  }

  // 4.3.6 Consume a url token
  protected consumeUrlToken(): Token {
    let value = '';
    while (this.isWhitespace(this.cp)) {
      this.consume();
    }
    while (true) {
      const cp = this.consume();
      if (cp === 0x0029 || cp === -1) { // )
        if (cp === -1) {
          this.parseError('EOF reached before URL was closed');
        }
        return { type: 'url', value };
      }
      if (this.isWhitespace(cp)) {
        while (this.isWhitespace(this.cp)) {
          this.consume();
        }
        if (this.cp === 0x0029 || this.cp === -1) {
          if (this.cp === -1) {
            this.parseError('EOF reached before URL was closed');
          }
          this.consume();
          return { type: 'url', value };
        }
        this.consumeRemnantsOfBadUrl();
        return { type: 'bad-url', value };
      }
      if (cp === 0x0022 || cp === 0x0027 || cp === 0x0028 || this.isNonPrintable(cp)) {
        this.parseError('Invalid character in URL');
        this.consumeRemnantsOfBadUrl();
        return { type: 'bad-url', value };
      }
      if (cp === 0x005C) { // \
        if (this.isValidEscape(cp, this.cp)) {
          value += String.fromCodePoint(this.consumeEscapedCodePoint());
        } else {
          this.parseError('Invalid escape sequence in URL');
          this.consumeRemnantsOfBadUrl();
          return { type: 'bad-url', value };
        }
      } else {
        value += String.fromCodePoint(cp);
      }
    }
  }

  // 4.3.7 Consume an escaped code point
  protected consumeEscapedCodePoint(): number {
    const cp = this.consume();
    if (this.isHexDigit(cp)) {
      let hex = String.fromCodePoint(cp);
      let count = 1;
      while (count < 6 && this.isHexDigit(this.cp)) {
        hex += String.fromCodePoint(this.consume());
        count++;
      }
      if (this.isWhitespace(this.cp)) {
        this.consume();
      }
      const value = parseInt(hex, 16);
      if (value === 0 || (value >= 0xD800 && value <= 0xDFFF) || value > 0x10FFFF) {
        return 0xFFFD;
      }
      return value;
    }
    if (cp === -1) {
      return 0xFFFD;
    }
    return cp;
  }

  // 4.3.8 Check if two code points are a valid escape
  protected isValidEscape(cp1: number, cp2: number): boolean {
    if (cp1 !== 0x005C) return false; // \
    if (this.isNewline(cp2)) return false;
    return true;
  }

  // 4.3.9 Check if three code points would start an ident sequence
  protected wouldStartIdentSequence(cp1: number, cp2: number, cp3: number): boolean {
    if (cp1 === 0x002D) { // -
      if (this.isIdentStartCodePoint(cp2) || cp2 === 0x002D) return true;
      if (this.isValidEscape(cp2, cp3)) return true;
      return false;
    }
    if (this.isIdentStartCodePoint(cp1)) return true;
    if (cp1 === 0x005C) { // \
      if (this.isValidEscape(cp1, cp2)) return true;
      return false;
    }
    return false;
  }

  // 4.3.10 Check if three code points would start a number
  protected wouldStartNumber(cp1: number, cp2: number, cp3: number): boolean {
    if (cp1 === 0x002B || cp1 === 0x002D) { // + or -
      if (this.isDigit(cp2)) return true;
      if (cp2 === 0x002E && this.isDigit(cp3)) return true; // .
      return false;
    }
    if (cp1 === 0x002E) { // .
      if (this.isDigit(cp2)) return true;
      return false;
    }
    if (this.isDigit(cp1)) return true;
    return false;
  }

  // 4.3.11 Consume an ident sequence
  protected consumeIdentSequence(): string {
    const startPos = this.getPosition();
    let hasEscapes = false;
    let result = '';

    while (true) {
      const cp = this.consume();
      if (this.isIdentCodePoint(cp)) {
        if (hasEscapes) {
          result += String.fromCodePoint(cp);
        }
      } else if (this.isValidEscape(cp, this.cp)) {
        if (!hasEscapes) {
          // We found an escape. Grab everything before it.
          // Note: The '\' was just consumed, so startPos to getPosition() - 1 is the literal part.
          // Wait, if we use slice, we need the exact indices.
          hasEscapes = true;
          // Step back to before the '\' to slice the valid literal string prefix
          this.reconsume();
          result = this.slice(startPos, this.getPosition());
          this.consume(); // Consume '\' again
        }
        result += String.fromCodePoint(this.consumeEscapedCodePoint());
      } else {
        if (cp !== -1) {
          this.reconsume();
        }
        break;
      }
    }
    
    if (!hasEscapes) {
      return this.slice(startPos, this.getPosition());
    }
    return result;
  }

  // 4.3.12 Consume a number
  protected consumeNumber(): { value: number; type: 'integer' | 'number'; sign: '+' | '-' | null } {
    let type: 'integer' | 'number' = 'integer';
    let sign: '+' | '-' | null = null;
    
    if (this.cp === 0x002B) { // +
      sign = '+';
      this.consume();
    } else if (this.cp === 0x002D) { // -
      sign = '-';
      this.consume();
    }
    
    let value = 0;
    let power = 0;
    
    while (this.isDigit(this.cp)) {
      value = value * 10 + (this.cp - 0x0030);
      this.consume();
    }
    
    if (this.cp === 0x002E && this.isDigit(this.peek(1))) { // .
      this.consume();
      type = 'number';
      while (this.isDigit(this.cp)) {
        value = value * 10 + (this.cp - 0x0030);
        power--;
        this.consume();
      }
    }
    
    let exp = 0;
    let expSign = 1;
    if ((this.cp === 0x0045 || this.cp === 0x0065) && 
        ((this.isDigit(this.peek(1))) || 
         ((this.peek(1) === 0x002B || this.peek(1) === 0x002D) && this.isDigit(this.peek(2))))) { // E or e
      this.consume();
      const nextCp = this.cp as unknown as number;
      if (nextCp === 0x002B) {
        this.consume();
      } else if (nextCp === 0x002D) {
        expSign = -1;
        this.consume();
      }
      while (this.isDigit(this.cp)) {
        exp = exp * 10 + (this.cp - 0x0030);
        this.consume();
      }
      type = 'number';
    }
    
    value = value * Math.pow(10, power + expSign * exp);
    
    if (sign === '-') {
      value = -value;
    }
    
    return { value, type, sign };
  }

  // 4.3.14 Consume the remnants of a bad url
  protected consumeRemnantsOfBadUrl(): void {
    while (true) {
      const cp = this.consume();
      if (cp === 0x0029 || cp === -1) { // )
        break;
      }
      if (this.isValidEscape(cp, this.cp)) {
        this.consumeEscapedCodePoint();
      }
    }
  }

  
  protected wouldStartUnicodeRange(cp1: number, cp2: number, cp3: number): boolean {
    if (cp1 !== 0x0055 && cp1 !== 0x0075) return false; // U or u
    if (cp2 !== 0x002B) return false; // +
    if (cp3 === 0x003F || this.isHexDigit(cp3)) return true; // ? or hex digit
    return false;
  }

  // 4.3.13 Consume a unicode-range token
  protected consumeUnicodeRangeToken(): Token {
    let hex = '';
    let hasQuestionMarks = false;

    // Consume up to 6 hex digits
    while (hex.length < 6 && this.isHexDigit(this.cp)) {
      hex += String.fromCodePoint(this.consume());
    }

    // If less than 6 hex digits, consume up to remaining question marks
    let questionMarks = '';
    while (hex.length + questionMarks.length < 6 && this.cp === 0x003F) { // ?
      questionMarks += String.fromCodePoint(this.consume());
      hasQuestionMarks = true;
    }

    if (hasQuestionMarks) {
      const startStr = hex + questionMarks.replace(/\?/g, '0');
      const endStr = hex + questionMarks.replace(/\?/g, 'F');
      const start = parseInt(startStr, 16);
      const end = parseInt(endStr, 16);
      return { 
        type: 'unicode-range', 
        value: `U+${startStr.toUpperCase().padStart(4, '0')}-${endStr.toUpperCase().padStart(4, '0')}`,
        unicodeRangeStart: start,
        unicodeRangeEnd: end
      };
    }

    const start = parseInt(hex, 16);

    if (this.cp === 0x002D && this.isHexDigit(this.peek(1))) { // -
      this.consume(); // -
      let endHex = '';
      while (endHex.length < 6 && this.isHexDigit(this.cp)) {
        endHex += String.fromCodePoint(this.consume());
      }
      const end = parseInt(endHex, 16);
      return { 
        type: 'unicode-range', 
        value: `U+${hex.toUpperCase().padStart(4, '0')}-${endHex.toUpperCase().padStart(4, '0')}`,
        unicodeRangeStart: start,
        unicodeRangeEnd: end
      };
    }

    return { 
      type: 'unicode-range', 
      value: `U+${hex.toUpperCase().padStart(4, '0')}`,
      unicodeRangeStart: start,
      unicodeRangeEnd: start
    };
  }

  protected startsComment(): boolean {
    return this.cp === 0x002F && this.peek(1) === 0x002A;
  }

  protected isWhitespace(cp: number): boolean {
    return cp === 0x000A || cp === 0x0009 || cp === 0x0020;
  }

  protected isNewline(cp: number): boolean {
    return cp === 0x000A;
  }

  protected isDigit(cp: number): boolean {
    return cp >= 0x0030 && cp <= 0x0039;
  }

  protected isHexDigit(cp: number): boolean {
    return this.isDigit(cp) || 
           (cp >= 0x0041 && cp <= 0x0046) || 
           (cp >= 0x0061 && cp <= 0x0066);
  }

  protected isIdentStartCodePoint(cp: number): boolean {
    return (cp >= 0x0041 && cp <= 0x005A) || // A-Z
           (cp >= 0x0061 && cp <= 0x007A) || // a-z
           cp === 0x005F || // _
           this.isNonAsciiIdentCodePoint(cp);
  }

  protected isIdentCodePoint(cp: number): boolean {
    return this.isIdentStartCodePoint(cp) || 
           this.isDigit(cp) || 
           cp === 0x002D; // -
  }

  protected isNonAsciiIdentCodePoint(cp: number): boolean {
    return cp === 0x00B7 ||
           (cp >= 0x00C0 && cp <= 0x00D6) ||
           (cp >= 0x00D8 && cp <= 0x00F6) ||
           (cp >= 0x00F8 && cp <= 0x037D) ||
           (cp >= 0x037F && cp <= 0x1FFF) ||
           cp === 0x200C ||
           cp === 0x200D ||
           cp === 0x203F ||
           cp === 0x2040 ||
           (cp >= 0x2070 && cp <= 0x218F) ||
           (cp >= 0x2C00 && cp <= 0x2FEF) ||
           (cp >= 0x3001 && cp <= 0xD7FF) ||
           (cp >= 0x00F900 && cp <= 0x00FDCF) ||
           (cp >= 0x00FDF0 && cp <= 0x00FFFD) ||
           cp >= 0x10000;
  }

  protected isNonPrintable(cp: number): boolean {
    return (cp >= 0x0000 && cp <= 0x0008) ||
           cp === 0x000B ||
           (cp >= 0x000E && cp <= 0x001F) ||
           cp === 0x007F;
  }
}
