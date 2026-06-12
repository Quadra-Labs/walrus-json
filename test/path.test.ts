import { describe, expect, it } from 'vitest';

import { formatPath, getAtPath, hasAtPath, parsePath } from '../src/path.js';

describe('parsePath', () => {
    it('parses dot paths', () => {
        expect(parsePath('a.b.c')).toEqual(['a', 'b', 'c']);
    });

    it('parses bracket indices as numbers', () => {
        expect(parsePath('users[0].name')).toEqual(['users', 0, 'name']);
        expect(parsePath('m[2][3]')).toEqual(['m', 2, 3]);
    });

    it('parses quoted bracket keys with dots inside', () => {
        expect(parsePath('a["b.c"].d')).toEqual(['a', 'b.c', 'd']);
        expect(parsePath("a['b.c']")).toEqual(['a', 'b.c']);
    });

    it('parses JSON Pointers, including escapes', () => {
        expect(parsePath('/users/0/name')).toEqual(['users', '0', 'name']);
        expect(parsePath('/a~1b/c~0d')).toEqual(['a/b', 'c~d']);
    });

    it('treats empty string as the root', () => {
        expect(parsePath('')).toEqual([]);
    });

    it('passes through segment arrays', () => {
        expect(parsePath(['users', 0, 'name'])).toEqual(['users', 0, 'name']);
    });

    it('throws on malformed paths', () => {
        expect(() => parsePath('a[')).toThrow();
        expect(() => parsePath('a[x]')).toThrow();
        expect(() => parsePath('a..b')).toThrow();
    });
});

describe('getAtPath / hasAtPath', () => {
    const doc = { users: [{ name: 'ada' }, { name: 'linus' }], meta: { count: 2 } };

    it('reads nested values via dot path and pointer', () => {
        expect(getAtPath(doc, parsePath('users[1].name'))).toBe('linus');
        expect(getAtPath(doc, parsePath('/meta/count'))).toBe(2);
    });

    it('returns undefined for missing paths', () => {
        expect(getAtPath(doc, parsePath('users[5].name'))).toBeUndefined();
        expect(getAtPath(doc, parsePath('nope.deep'))).toBeUndefined();
    });

    it('distinguishes existence from undefined values', () => {
        expect(hasAtPath(doc, parsePath('meta.count'))).toBe(true);
        expect(hasAtPath(doc, parsePath('meta.missing'))).toBe(false);
        expect(hasAtPath(doc, parsePath('users[1]'))).toBe(true);
        expect(hasAtPath(doc, parsePath('users[9]'))).toBe(false);
    });
});

describe('formatPath', () => {
    it('renders readable paths', () => {
        expect(formatPath(['users', 0, 'name'])).toBe('users[0].name');
        expect(formatPath(['a', 'b.c'])).toBe('a["b.c"]');
        expect(formatPath([])).toBe('<root>');
    });
});
