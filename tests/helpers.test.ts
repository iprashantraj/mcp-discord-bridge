import { describe, it, expect } from 'vitest';
import {
  requireString,
  optionalString,
  optionalNumber,
  ok,
} from '../mcp-handlers';

// ─── requireString ───────────────────────────────────────────────────────────

describe('requireString', () => {
  it('returns trimmed string when present', () => {
    expect(requireString({ name: '  hello  ' }, 'name')).toBe('hello');
  });

  it('throws when key is missing', () => {
    expect(() => requireString({}, 'name')).toThrow(
      'Missing or invalid argument: "name" must be a non-empty string.',
    );
  });

  it('throws when value is empty string', () => {
    expect(() => requireString({ name: '   ' }, 'name')).toThrow(
      'Missing or invalid argument: "name"',
    );
  });

  it('throws when value is not a string', () => {
    expect(() => requireString({ name: 42 }, 'name')).toThrow(
      'Missing or invalid argument: "name"',
    );
  });

  it('throws when value is null', () => {
    expect(() => requireString({ name: null }, 'name')).toThrow(
      'Missing or invalid argument: "name"',
    );
  });
});

// ─── optionalString ──────────────────────────────────────────────────────────

describe('optionalString', () => {
  it('returns trimmed string when present', () => {
    expect(optionalString({ key: ' value ' }, 'key')).toBe('value');
  });

  it('returns undefined when key is missing', () => {
    expect(optionalString({}, 'key')).toBeUndefined();
  });

  it('returns undefined when value is null', () => {
    expect(optionalString({ key: null }, 'key')).toBeUndefined();
  });

  it('returns undefined when value is empty string', () => {
    expect(optionalString({ key: '  ' }, 'key')).toBeUndefined();
  });

  it('throws when value is wrong type', () => {
    expect(() => optionalString({ key: 123 }, 'key')).toThrow(
      'Argument "key" must be a string.',
    );
  });
});

// ─── optionalNumber ──────────────────────────────────────────────────────────

describe('optionalNumber', () => {
  it('returns number when present', () => {
    expect(optionalNumber({ n: 42 }, 'n')).toBe(42);
  });

  it('returns undefined when key is missing', () => {
    expect(optionalNumber({}, 'n')).toBeUndefined();
  });

  it('returns undefined when value is null', () => {
    expect(optionalNumber({ n: null }, 'n')).toBeUndefined();
  });

  it('throws when value is wrong type', () => {
    expect(() => optionalNumber({ n: 'hello' }, 'n')).toThrow(
      'Argument "n" must be a number.',
    );
  });

  it('accepts zero', () => {
    expect(optionalNumber({ n: 0 }, 'n')).toBe(0);
  });
});

// ─── ok ──────────────────────────────────────────────────────────────────────

describe('ok', () => {
  it('wraps text in MCP content format', () => {
    const result = ok('hello world');
    expect(result).toEqual({
      content: [{ type: 'text', text: 'hello world' }],
    });
  });

  it('handles empty string', () => {
    const result = ok('');
    expect(result.content[0].text).toBe('');
  });
});
