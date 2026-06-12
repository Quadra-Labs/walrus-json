import { InvalidPathError } from './errors.js';
import type { JsonPath, JsonValue } from './types.js';

export type Segment = string | number;

/**
 * Normalize a {@link JsonPath} into an array of segments.
 *
 * - Arrays are validated and returned as-is.
 * - Strings starting with `/` (or empty) are parsed as JSON Pointers (RFC 6901).
 * - Everything else is parsed as a dot-path: `users[0].name`, `a.b["x.y"]`.
 */
export function parsePath(path: JsonPath): Segment[] {
    if (Array.isArray(path)) {
        return path.map((segment) => {
            if (typeof segment === 'number') {
                if (!Number.isInteger(segment) || segment < 0) {
                    throw new InvalidPathError(
                        path,
                        `array index must be a non-negative integer, got ${segment}`,
                    );
                }
                return segment;
            }
            if (typeof segment === 'string') return segment;
            throw new InvalidPathError(path, 'segments must be strings or numbers');
        });
    }

    if (typeof path !== 'string') {
        throw new InvalidPathError(path, 'path must be a string or an array of segments');
    }

    if (path === '') return [];
    if (path.startsWith('/')) return parseJsonPointer(path);
    return parseDotPath(path);
}

/** Parse a JSON Pointer (RFC 6901) into segments. */
function parseJsonPointer(pointer: string): Segment[] {
    return pointer
        .split('/')
        .slice(1)
        .map((token) => unescapePointerToken(token));
}

function unescapePointerToken(token: string): Segment {
    // ~1 -> "/", ~0 -> "~"; order matters (decode ~1 before ~0).
    return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Parse a dot-path with optional bracket accessors into segments. */
function parseDotPath(path: string): Segment[] {
    const segments: Segment[] = [];
    let i = 0;
    const n = path.length;

    const pushKey = (key: string) => {
        if (key.length === 0) throw new InvalidPathError(path, 'empty path segment');
        segments.push(key);
    };

    let current = '';
    // Tracks whether the previous token was a bracket accessor, so that `a[0].b`
    // is valid while consecutive dots (`a..b`) or a leading dot are rejected.
    let lastWasBracket = false;
    while (i < n) {
        const ch = path[i];

        if (ch === '.') {
            if (current.length > 0) {
                pushKey(current);
                current = '';
            } else if (!lastWasBracket) {
                throw new InvalidPathError(path, 'empty path segment');
            }
            lastWasBracket = false;
            i++;
            continue;
        }

        if (ch === '[') {
            if (current.length > 0) {
                pushKey(current);
                current = '';
            }
            const close = path.indexOf(']', i);
            if (close === -1) throw new InvalidPathError(path, "unmatched '['");
            let inner = path.slice(i + 1, close);
            const quoted =
                (inner.startsWith('"') && inner.endsWith('"')) ||
                (inner.startsWith("'") && inner.endsWith("'"));
            if (quoted) {
                segments.push(inner.slice(1, -1));
            } else {
                inner = inner.trim();
                if (!/^\d+$/.test(inner)) {
                    throw new InvalidPathError(path, `invalid array index '${inner}'`);
                }
                segments.push(Number(inner));
            }
            i = close + 1;
            lastWasBracket = true;
            continue;
        }

        current += ch;
        lastWasBracket = false;
        i++;
    }

    if (current.length > 0) pushKey(current);
    return segments;
}

/** Render segments back into a readable dot-path, used for error messages. */
export function formatPath(segments: ReadonlyArray<Segment>): string {
    if (segments.length === 0) return '<root>';
    let out = '';
    for (const segment of segments) {
        if (typeof segment === 'number') {
            out += `[${segment}]`;
        } else if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
            out += out.length === 0 ? segment : `.${segment}`;
        } else {
            out += `[${JSON.stringify(segment)}]`;
        }
    }
    return out;
}

/** Read the value at `segments`, or `undefined` if any step is missing. */
export function getAtPath(
    root: JsonValue,
    segments: ReadonlyArray<Segment>,
): JsonValue | undefined {
    let node: JsonValue | undefined = root;
    for (const segment of segments) {
        if (node === null || node === undefined || typeof node !== 'object') return undefined;
        if (Array.isArray(node)) {
            const index = toIndex(segment);
            if (index === undefined) return undefined;
            node = node[index];
        } else {
            node = (node as Record<string, JsonValue>)[String(segment)];
        }
    }
    return node;
}

/** Whether a value exists at `segments`. */
export function hasAtPath(root: JsonValue, segments: ReadonlyArray<Segment>): boolean {
    let node: JsonValue | undefined = root;
    for (const segment of segments) {
        if (node === null || node === undefined || typeof node !== 'object') return false;
        if (Array.isArray(node)) {
            const index = toIndex(segment);
            if (index === undefined || index < 0 || index >= node.length) return false;
            node = node[index];
        } else {
            const key = String(segment);
            if (!Object.prototype.hasOwnProperty.call(node, key)) return false;
            node = (node as Record<string, JsonValue>)[key];
        }
    }
    return true;
}

/** Coerce a segment into an array index, or `undefined` if it is not one. */
export function toIndex(segment: Segment): number | undefined {
    if (typeof segment === 'number')
        return Number.isInteger(segment) && segment >= 0 ? segment : undefined;
    if (/^\d+$/.test(segment)) return Number(segment);
    return undefined;
}
