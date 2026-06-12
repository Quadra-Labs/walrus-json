import { describe, expect, it } from 'vitest';

import {
    append,
    applyPatch,
    copy,
    increment,
    insert,
    merge,
    move,
    prepend,
    remove,
    rename,
    set,
} from '../src/ops.js';
import type { JsonValue } from '../src/types.js';

describe('set', () => {
    it('sets nested values, creating intermediate objects', () => {
        const doc: JsonValue = {};
        set(doc, 'a.b.c', 1);
        expect(doc).toEqual({ a: { b: { c: 1 } } });
    });

    it('creates arrays when the next segment is an index', () => {
        const doc: JsonValue = {};
        set(doc, 'list[0].id', 7);
        expect(doc).toEqual({ list: [{ id: 7 }] });
    });

    it('throws when descending through a primitive', () => {
        const doc: JsonValue = { a: 1 };
        expect(() => set(doc, 'a.b', 2)).toThrow();
    });
});

describe('merge', () => {
    it('shallow merges by default', () => {
        const doc: JsonValue = { meta: { a: 1, nested: { x: 1 } } };
        merge(doc, 'meta', { b: 2, nested: { y: 2 } });
        expect(doc).toEqual({ meta: { a: 1, b: 2, nested: { y: 2 } } });
    });

    it('deep merges when asked', () => {
        const doc: JsonValue = { meta: { nested: { x: 1 } } };
        merge(doc, 'meta', { nested: { y: 2 } }, true);
        expect(doc).toEqual({ meta: { nested: { x: 1, y: 2 } } });
    });

    it('creates the target if missing', () => {
        const doc: JsonValue = {};
        merge(doc, 'meta', { a: 1 });
        expect(doc).toEqual({ meta: { a: 1 } });
    });
});

describe('array operations', () => {
    it('appends and prepends, creating the array if missing', () => {
        const doc: JsonValue = {};
        append(doc, 'xs', [2, 3]);
        prepend(doc, 'xs', [0, 1]);
        expect(doc).toEqual({ xs: [0, 1, 2, 3] });
    });

    it('inserts at an index, clamping out-of-range', () => {
        const doc: JsonValue = { xs: [1, 3] };
        insert(doc, 'xs', 1, 2);
        insert(doc, 'xs', 99, 4);
        expect(doc).toEqual({ xs: [1, 2, 3, 4] });
    });

    it('throws when the target is not an array', () => {
        const doc: JsonValue = { xs: 5 };
        expect(() => append(doc, 'xs', [1])).toThrow();
    });
});

describe('remove', () => {
    it('removes object keys', () => {
        const doc: JsonValue = { a: 1, b: 2 };
        expect(remove(doc, 'a')).toBe(true);
        expect(doc).toEqual({ b: 2 });
    });

    it('removes array elements by index', () => {
        const doc: JsonValue = { xs: [1, 2, 3] };
        expect(remove(doc, 'xs[1]')).toBe(true);
        expect(doc).toEqual({ xs: [1, 3] });
    });

    it('returns false for missing targets', () => {
        const doc: JsonValue = { a: 1 };
        expect(remove(doc, 'b')).toBe(false);
    });
});

describe('increment', () => {
    it('increments and decrements numbers', () => {
        const doc: JsonValue = { count: 5 };
        expect(increment(doc, 'count')).toBe(6);
        expect(increment(doc, 'count', -2)).toBe(4);
    });

    it('treats missing values as zero', () => {
        const doc: JsonValue = {};
        expect(increment(doc, 'count', 3)).toBe(3);
        expect(doc).toEqual({ count: 3 });
    });

    it('throws on non-numbers', () => {
        const doc: JsonValue = { count: 'x' };
        expect(() => increment(doc, 'count')).toThrow();
    });
});

describe('move / copy / rename', () => {
    it('copies a deep clone', () => {
        const doc: JsonValue = { a: { n: 1 } };
        copy(doc, 'a', 'b');
        (doc.a as { n: number }).n = 99;
        expect(doc.b).toEqual({ n: 1 });
    });

    it('moves a value, removing the source', () => {
        const doc: JsonValue = { a: 1 };
        move(doc, 'a', 'b');
        expect(doc).toEqual({ b: 1 });
    });

    it('renames an object key in place', () => {
        const doc: JsonValue = { old: 1, other: 2 };
        rename(doc, 'old', 'fresh');
        expect(doc).toEqual({ fresh: 1, other: 2 });
    });
});

describe('applyPatch', () => {
    it('applies a batch of operations in order', () => {
        const doc: JsonValue = { users: [], meta: { count: 0 } };
        applyPatch(doc, [
            { op: 'append', path: 'users', values: [{ id: 1 }] },
            { op: 'increment', path: 'meta.count' },
            { op: 'set', path: 'meta.updatedAt', value: 123 },
            { op: 'merge', path: 'meta', value: { tag: 'x' } },
        ]);
        expect(doc).toEqual({
            users: [{ id: 1 }],
            meta: { count: 1, updatedAt: 123, tag: 'x' },
        });
    });
});
