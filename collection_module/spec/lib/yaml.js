'use strict';

/**
 * Strict YAML-subset parser for provider specs.
 *
 * This repo ships no YAML dependency and the spec slice may not add one, so the
 * parser is hand-rolled. It is deliberately a *strict subset*: anything it does
 * not understand is a parse error with a line number, never a silent
 * mis-parse. Narrowing the dialect is a feature — a provider spec that later
 * slices generate code from must not contain anchors, aliases, merge keys or
 * multiple documents.
 *
 * Supported
 *   - block mappings (`key: value`), nested by space indentation
 *   - block sequences (`- item`, `- key: value`), at or below the parent indent
 *   - scalars: plain, 'single-quoted', "double-quoted" (\\ \" \n \t escapes)
 *   - block scalars: `|`, `|-`, `>`, `>-`
 *   - single-line flow sequences of scalars: `[a, b, c]`
 *   - comments (`#` at line start, or preceded by whitespace outside quotes)
 *   - a leading `---` document marker
 *   - plain `true` / `false` / `null` / `~` / integers / floats
 *
 * Rejected (with a line number)
 *   - tabs in indentation, anchors (`&`), aliases (`*`), merge keys (`<<`),
 *     flow mappings (`{}`), multiple documents, complex keys (`? `),
 *     duplicate keys in the same mapping
 *
 * Dates are *not* coerced: `2026-10-19` stays the string "2026-10-19", which is
 * what the JSON Schema `format: date` checks expect.
 */

class SpecParseError extends Error {
  constructor(message, line) {
    super(line ? `line ${line}: ${message}` : message);
    this.name = 'SpecParseError';
    this.line = line || null;
  }
}

const KEY_CHARS = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*$/;

/** Strip an inline `#` comment, respecting quotes. A `#` not preceded by
 *  whitespace is part of the scalar (URL fragments depend on this). */
function stripInlineComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') { i += 1; continue; }
      if (ch === quote && quote === "'" && text[i + 1] === "'") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i);
  }
  return text;
}

function isBlank(raw) {
  const body = raw.replace(/^ */, '');
  return body === '' || body.startsWith('#');
}

/** Split `key: value` at the first colon that is followed by a space or EOL
 *  and sits outside quotes. Returns null when the line is not a mapping entry. */
function splitKey(content) {
  let quote = null;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (quote) {
      if (ch === '\\' && quote === '"') { i += 1; continue; }
      if (ch === quote && quote === "'" && content[i + 1] === "'") { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ':' && (i + 1 === content.length || content[i + 1] === ' ')) {
      return { rawKey: content.slice(0, i).trim(), rest: content.slice(i + 1).trim() };
    }
  }
  return null;
}

function parseQuoted(text, line) {
  const quote = text[0];
  let out = '';
  for (let i = 1; i < text.length; i += 1) {
    const ch = text[i];
    if (quote === '"' && ch === '\\') {
      const next = text[i + 1];
      if (next === 'n') out += '\n';
      else if (next === 't') out += '\t';
      else if (next === '"' || next === '\\') out += next;
      else throw new SpecParseError(`unsupported escape "\\${next}" in double-quoted scalar`, line);
      i += 1;
      continue;
    }
    if (ch === quote) {
      // YAML escapes a single quote inside a single-quoted scalar by doubling it.
      if (quote === "'" && text[i + 1] === "'") {
        out += "'";
        i += 1;
        continue;
      }
      if (i !== text.length - 1) {
        throw new SpecParseError('trailing characters after a quoted scalar', line);
      }
      return out;
    }
    out += ch;
  }
  throw new SpecParseError('unterminated quoted scalar', line);
}

function parseScalar(text, line) {
  const value = text.trim();
  if (value === '') return null;
  if (value[0] === '"' || value[0] === "'") return parseQuoted(value, line);
  if (value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value[0] === '&' || value[0] === '*') {
    throw new SpecParseError('YAML anchors and aliases are not supported in provider specs', line);
  }
  if (value[0] === '{') {
    throw new SpecParseError('flow mappings ({...}) are not supported — use an indented block mapping, or quote the value if it is a literal string', line);
  }
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
  return value;
}

function parseFlowSequence(text, line) {
  const body = text.trim();
  if (!body.endsWith(']')) {
    throw new SpecParseError('unterminated flow sequence — a flow sequence must open and close on one line', line);
  }
  const inner = body.slice(1, -1).trim();
  if (inner === '') return [];
  const items = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (quote) {
      current += ch;
      if (ch === '\\' && quote === '"') { current += inner[i + 1]; i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === '[' || ch === '{') {
      throw new SpecParseError('nested flow collections are not supported', line);
    }
    if (ch === ',') { items.push(current); current = ''; continue; }
    current += ch;
  }
  if (quote) throw new SpecParseError('unterminated quoted scalar in flow sequence', line);
  items.push(current);
  return items.map((item) => parseScalar(item, line));
}

class Parser {
  constructor(text) {
    this.raw = String(text).split(/\r?\n/);
    this.i = 0;
    this.lines = new Map();
    this.sawDocMarker = false;
  }

  /** Next significant line, without consuming it. */
  peek() {
    while (this.i < this.raw.length) {
      const raw = this.raw[this.i];
      const lineNo = this.i + 1;
      if (isBlank(raw)) { this.i += 1; continue; }
      if (/^ *\t/.test(raw)) {
        throw new SpecParseError('tab character in indentation — provider specs are indented with spaces', lineNo);
      }
      const indent = raw.length - raw.replace(/^ */, '').length;
      const content = stripInlineComment(raw.slice(indent)).trimEnd();
      if (content === '---') {
        if (this.sawDocMarker) {
          throw new SpecParseError('multiple YAML documents are not supported — one spec per file', lineNo);
        }
        this.sawDocMarker = true;
        this.i += 1;
        continue;
      }
      if (content === '...') {
        throw new SpecParseError('the "..." document-end marker is not supported', lineNo);
      }
      if (content.startsWith('? ')) {
        throw new SpecParseError('complex mapping keys ("? ") are not supported', lineNo);
      }
      if (content === '') { this.i += 1; continue; }
      return { indent, content, lineNo };
    }
    return null;
  }

  record(path, lineNo) {
    if (!this.lines.has(path)) this.lines.set(path, lineNo);
  }

  /** Read a `|` / `>` block scalar whose header sits on `headerLine`. */
  readBlockScalar(header, parentIndent, headerLine) {
    const style = header[0];
    const chomp = header.slice(1).trim();
    if (chomp !== '' && chomp !== '-') {
      throw new SpecParseError(`unsupported block scalar indicator "${header}" — only | , |- , > and >- are supported`, headerLine);
    }
    const collected = [];
    let blockIndent = null;
    while (this.i < this.raw.length) {
      const raw = this.raw[this.i];
      if (raw.replace(/^ */, '') === '') { collected.push(''); this.i += 1; continue; }
      const indent = raw.length - raw.replace(/^ */, '').length;
      if (indent <= parentIndent) break;
      if (blockIndent === null) blockIndent = indent;
      if (indent < blockIndent) break;
      collected.push(raw.slice(blockIndent));
      this.i += 1;
    }
    while (collected.length && collected[collected.length - 1] === '') collected.pop();
    let text;
    if (style === '|') {
      text = collected.join('\n');
    } else {
      // Folded: blank lines become paragraph breaks, single newlines become spaces.
      text = collected
        .reduce((acc, line) => {
          if (line === '') { acc.push(''); return acc; }
          const last = acc[acc.length - 1];
          if (acc.length === 0 || last === '') acc.push(line);
          else acc[acc.length - 1] = `${last} ${line}`;
          return acc;
        }, [])
        .join('\n');
    }
    return chomp === '-' ? text : `${text}\n`.replace(/\n+$/, '\n');
  }

  parseDocument() {
    const first = this.peek();
    if (!first) return null;
    if (first.indent !== 0) {
      throw new SpecParseError('the spec must start at column 0', first.lineNo);
    }
    const value = this.parseBlock(0, '');
    const trailing = this.peek();
    if (trailing) {
      throw new SpecParseError('unexpected content after the end of the spec', trailing.lineNo);
    }
    return value;
  }

  parseBlock(indent, path) {
    const next = this.peek();
    if (!next) return null;
    if (next.content === '-' || next.content.startsWith('- ')) {
      return this.parseSequence(indent, path);
    }
    return this.parseMapping(indent, path);
  }

  parseMapping(indent, path) {
    const result = {};
    const seen = new Set();
    for (;;) {
      const token = this.peek();
      if (!token || token.indent < indent) break;
      if (token.indent > indent) {
        throw new SpecParseError('unexpected indentation — this line is indented further than its sibling keys', token.lineNo);
      }
      if (token.content.startsWith('- ') || token.content === '-') {
        throw new SpecParseError('a list item appears where a mapping key was expected', token.lineNo);
      }
      const split = splitKey(token.content);
      if (!split) {
        throw new SpecParseError(`expected "key: value" but found "${token.content}"`, token.lineNo);
      }
      const key = split.rawKey[0] === '"' || split.rawKey[0] === "'"
        ? parseQuoted(split.rawKey, token.lineNo)
        : split.rawKey;
      if (key.startsWith('<<')) {
        throw new SpecParseError('YAML merge keys ("<<") are not supported in provider specs', token.lineNo);
      }
      if (!KEY_CHARS.test(key)) {
        throw new SpecParseError(`unsupported key "${key}" — keys must be alphanumeric with _ . or -`, token.lineNo);
      }
      if (seen.has(key)) {
        throw new SpecParseError(`duplicate key "${key}" in the same mapping`, token.lineNo);
      }
      seen.add(key);
      const childPath = `${path}/${key}`;
      this.record(childPath, token.lineNo);
      this.i += 1;
      result[key] = this.parseValue(split.rest, indent, childPath, token.lineNo);
    }
    return result;
  }

  parseSequence(indent, path) {
    const result = [];
    for (;;) {
      const token = this.peek();
      if (!token || token.indent < indent) break;
      if (token.indent > indent) {
        throw new SpecParseError('unexpected indentation inside a list', token.lineNo);
      }
      if (token.content !== '-' && !token.content.startsWith('- ')) break;
      const childPath = `${path}/${result.length}`;
      this.record(childPath, token.lineNo);
      if (token.content === '-') {
        this.i += 1;
        const nested = this.peek();
        if (!nested || nested.indent <= indent) {
          result.push(null);
          continue;
        }
        result.push(this.parseBlock(nested.indent, childPath));
        continue;
      }
      const dashOffset = token.content.length - token.content.slice(1).replace(/^ */, '').length;
      const itemIndent = indent + dashOffset;
      const itemContent = token.content.slice(dashOffset);
      const isNestedMap = splitKey(itemContent) !== null;
      const isNestedSeq = itemContent.startsWith('- ');
      if (isNestedMap || isNestedSeq) {
        // Blank the dash so the nested parser sees a normal block at itemIndent.
        const raw = this.raw[this.i];
        const dashIndex = raw.indexOf('-', indent);
        this.raw[this.i] = `${raw.slice(0, dashIndex)} ${raw.slice(dashIndex + 1)}`;
        result.push(this.parseBlock(itemIndent, childPath));
        continue;
      }
      this.i += 1;
      result.push(this.parseValue(itemContent, itemIndent - 1, childPath, token.lineNo));
    }
    return result;
  }

  parseValue(rest, indent, path, lineNo) {
    if (rest.startsWith('|') || rest.startsWith('>')) {
      return this.readBlockScalar(rest, indent, lineNo);
    }
    if (rest.startsWith('[')) {
      return parseFlowSequence(rest, lineNo);
    }
    if (rest !== '') {
      return parseScalar(rest, lineNo);
    }
    const child = this.peek();
    if (!child) return null;
    if (child.indent > indent) return this.parseBlock(child.indent, path);
    if (child.indent === indent && (child.content === '-' || child.content.startsWith('- '))) {
      return this.parseSequence(indent, path);
    }
    return null;
  }
}

/**
 * Parse a provider spec.
 * @returns {{ value: unknown, lines: Map<string, number> }} `lines` maps a
 *   JSON-pointer path (e.g. `/webhooks/events/0/name`) to its source line.
 * @throws {SpecParseError}
 */
function parseSpecYaml(text) {
  const parser = new Parser(text);
  const value = parser.parseDocument();
  return { value, lines: parser.lines };
}

module.exports = { parseSpecYaml, SpecParseError };
