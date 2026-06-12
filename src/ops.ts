import { InvalidPathError, PathResolutionError, TypeMismatchError } from './errors.js';
import { formatPath, parsePath, type Segment, toIndex } from './path.js';
import type { JsonObject, JsonPath, JsonValue, PatchOp } from './types.js';

type Container = JsonObject | JsonValue[];

function isContainer(value: JsonValue | undefined): value is Container {
    return typeof value === 'object' && value !== null;
}

function typeName(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

/**
 * Walk to the container that holds the final segment, creating intermediate
 * objects/arrays when `create` is set. Returns the parent container and the
 * final segment to operate on.
 */
function resolveParent(
    root: JsonValue,
    segments: ReadonlyArray<Segment>,
    create: boolean,
): { parent: Container; last: Segment } {
    if (segments.length === 0) {
        throw new InvalidPathError(segments, 'operation requires a non-empty path');
    }
    if (!isContainer(root)) {
        throw new TypeMismatchError('<root>', 'object or array', typeName(root));
    }

    let node: Container = root;
    for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i]!;
        const next = segments[i + 1]!;
        const child = readChild(node, segment);

        if (child === undefined || child === null) {
            if (!create) {
                throw new PathResolutionError(
                    `No value at "${formatPath(segments.slice(0, i + 1))}"`,
                );
            }
            const created: Container = toIndex(next) !== undefined ? [] : {};
            writeChild(node, segment, created);
            node = created;
        } else if (isContainer(child)) {
            node = child;
        } else {
            throw new TypeMismatchError(
                formatPath(segments.slice(0, i + 1)),
                'object or array',
                typeName(child),
            );
        }
    }

    return { parent: node, last: segments[segments.length - 1]! };
}

function readChild(node: Container, segment: Segment): JsonValue | undefined {
    if (Array.isArray(node)) {
        const index = toIndex(segment);
        return index === undefined ? undefined : node[index];
    }
    return node[String(segment)];
}

function writeChild(node: Container, segment: Segment, value: JsonValue): void {
    if (Array.isArray(node)) {
        const index = toIndex(segment);
        if (index === undefined) {
            throw new TypeMismatchError(String(segment), 'array index', 'object key');
        }
        node[index] = value;
    } else {
        node[String(segment)] = value;
    }
}

export function set(root: JsonValue, path: JsonPath, value: JsonValue): void {
    const segments = parsePath(path);
    const { parent, last } = resolveParent(root, segments, true);
    writeChild(parent, last, value);
}

export function merge(root: JsonValue, path: JsonPath, value: JsonObject, deep = false): void {
    const segments = parsePath(path);
    if (segments.length === 0) {
        throw new InvalidPathError(
            path,
            'merge requires a non-empty path; use replace() for the root',
        );
    }
    const { parent, last } = resolveParent(root, segments, true);
    const existing = readChild(parent, last);
    const base = isContainer(existing) && !Array.isArray(existing) ? existing : {};
    writeChild(parent, last, deep ? deepMerge(base, value) : { ...base, ...value });
}

function deepMerge(target: JsonObject, source: JsonObject): JsonObject {
    const out: JsonObject = { ...target };
    for (const [key, value] of Object.entries(source)) {
        const prev = out[key];
        if (isPlainObject(prev) && isPlainObject(value)) {
            out[key] = deepMerge(prev, value);
        } else {
            out[key] = value;
        }
    }
    return out;
}

function isPlainObject(value: JsonValue | undefined): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getArray(root: JsonValue, path: JsonPath, createIfMissing: boolean): JsonValue[] {
    const segments = parsePath(path);
    const { parent, last } = resolveParent(root, segments, true);
    let target = readChild(parent, last);
    if (target === undefined && createIfMissing) {
        target = [];
        writeChild(parent, last, target);
    }
    if (!Array.isArray(target)) {
        throw new TypeMismatchError(formatPath(segments), 'array', typeName(target));
    }
    return target;
}

export function append(root: JsonValue, path: JsonPath, values: JsonValue[]): void {
    getArray(root, path, true).push(...values);
}

export function prepend(root: JsonValue, path: JsonPath, values: JsonValue[]): void {
    getArray(root, path, true).unshift(...values);
}

export function insert(root: JsonValue, path: JsonPath, index: number, value: JsonValue): void {
    const array = getArray(root, path, true);
    const at = Math.max(0, Math.min(index, array.length));
    array.splice(at, 0, value);
}

export function remove(root: JsonValue, path: JsonPath): boolean {
    const segments = parsePath(path);
    const { parent, last } = resolveParent(root, segments, false);
    if (Array.isArray(parent)) {
        const index = toIndex(last);
        if (index === undefined || index < 0 || index >= parent.length) return false;
        parent.splice(index, 1);
        return true;
    }
    const key = String(last);
    if (!Object.prototype.hasOwnProperty.call(parent, key)) return false;
    delete parent[key];
    return true;
}

export function increment(root: JsonValue, path: JsonPath, by = 1): number {
    const segments = parsePath(path);
    const { parent, last } = resolveParent(root, segments, true);
    const current = readChild(parent, last);
    const base = current === undefined ? 0 : current;
    if (typeof base !== 'number') {
        throw new TypeMismatchError(formatPath(segments), 'number', typeName(base));
    }
    const updated = base + by;
    writeChild(parent, last, updated);
    return updated;
}

export function copy(root: JsonValue, from: JsonPath, to: JsonPath): void {
    const fromSegments = parsePath(from);
    const { parent, last } = resolveParent(root, fromSegments, false);
    const value = readChild(parent, last);
    if (value === undefined) {
        throw new PathResolutionError(`No value at "${formatPath(fromSegments)}"`);
    }
    set(root, to, structuredClone(value));
}

export function move(root: JsonValue, from: JsonPath, to: JsonPath): void {
    copy(root, from, to);
    remove(root, from);
}

export function rename(root: JsonValue, path: JsonPath, to: string): void {
    const segments = parsePath(path);
    const { parent, last } = resolveParent(root, segments, false);
    if (Array.isArray(parent)) {
        throw new TypeMismatchError(formatPath(segments), 'object key', 'array index');
    }
    const key = String(last);
    if (!Object.prototype.hasOwnProperty.call(parent, key)) {
        throw new PathResolutionError(`No value at "${formatPath(segments)}"`);
    }
    parent[to] = parent[key]!;
    delete parent[key];
}

/** Apply a batch of operations in order, mutating `root` in place. */
export function applyPatch(root: JsonValue, ops: ReadonlyArray<PatchOp>): void {
    for (const op of ops) {
        switch (op.op) {
            case 'set':
                set(root, op.path, op.value);
                break;
            case 'merge':
                merge(root, op.path, op.value, op.deep);
                break;
            case 'append':
                append(root, op.path, op.values);
                break;
            case 'prepend':
                prepend(root, op.path, op.values);
                break;
            case 'insert':
                insert(root, op.path, op.index, op.value);
                break;
            case 'remove':
                remove(root, op.path);
                break;
            case 'increment':
                increment(root, op.path, op.by ?? 1);
                break;
            case 'decrement':
                increment(root, op.path, -(op.by ?? 1));
                break;
            case 'move':
                move(root, op.from, op.to);
                break;
            case 'copy':
                copy(root, op.from, op.to);
                break;
            case 'rename':
                rename(root, op.path, op.to);
                break;
            default: {
                const exhaustive: never = op;
                throw new InvalidPathError(exhaustive, 'unknown patch operation');
            }
        }
    }
}
