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
} from './ops.js';
import { getAtPath, hasAtPath, parsePath } from './path.js';
import type {
    CommitOptions,
    CommitResult,
    JsonObject,
    JsonPath,
    JsonValue,
    PatchOp,
    PointerCommitResult,
} from './types.js';

/** The slice of {@link WalrusJsonClient} that a document needs to persist itself. */
export interface DocumentBackend {
    writeDocument(value: JsonValue, options: CommitOptions): Promise<CommitResult>;
    updatePointer(pointerId: string, blobId: string): Promise<{ txDigest: string }>;
}

export interface DocumentInit {
    /** The blob this document was read from, if any. */
    sourceBlobId?: string;
    /** A Sui pointer this document is bound to; `commit()` will re-point it. */
    pointerId?: string;
}

/**
 * An in-memory JSON document with chainable, ergonomic mutations.
 *
 * Mutations never touch Walrus. Calling {@link JsonDocument.commit} serializes
 * the current value, writes it as a brand new Walrus blob (producing a new
 * `blobId`), and, if the document is bound to a pointer, re-points it.
 */
export class JsonDocument {
    #backend: DocumentBackend;
    #value: JsonValue;
    #sourceBlobId: string | undefined;
    #pointerId: string | undefined;

    constructor(backend: DocumentBackend, value: JsonValue, init: DocumentInit = {}) {
        this.#backend = backend;
        this.#value = value;
        this.#sourceBlobId = init.sourceBlobId;
        this.#pointerId = init.pointerId;
    }

    /** The blob id this document was loaded from, if any. */
    get sourceBlobId(): string | undefined {
        return this.#sourceBlobId;
    }

    /** The pointer id this document is bound to, if any. */
    get pointerId(): string | undefined {
        return this.#pointerId;
    }

    /** Bind this document to a pointer so future commits re-point it. */
    bindPointer(pointerId: string): this {
        this.#pointerId = pointerId;
        return this;
    }

    // --- reads -------------------------------------------------------------

    /** A deep clone of the current value. */
    toJSON(): JsonValue {
        return structuredClone(this.#value);
    }

    /** Read the value at a path, or `undefined` if missing. */
    get<T extends JsonValue = JsonValue>(path: JsonPath): T | undefined {
        return getAtPath(this.#value, parsePath(path)) as T | undefined;
    }

    /** Whether a value exists at a path. */
    has(path: JsonPath): boolean {
        return hasAtPath(this.#value, parsePath(path));
    }

    // --- mutations (chainable) --------------------------------------------

    set(path: JsonPath, value: JsonValue): this {
        set(this.#value, path, value);
        return this;
    }

    merge(path: JsonPath, value: JsonObject, options: { deep?: boolean } = {}): this {
        merge(this.#value, path, value, options.deep ?? false);
        return this;
    }

    append(path: JsonPath, ...values: JsonValue[]): this {
        append(this.#value, path, values);
        return this;
    }

    prepend(path: JsonPath, ...values: JsonValue[]): this {
        prepend(this.#value, path, values);
        return this;
    }

    insert(path: JsonPath, index: number, value: JsonValue): this {
        insert(this.#value, path, index, value);
        return this;
    }

    remove(path: JsonPath): this {
        remove(this.#value, path);
        return this;
    }

    increment(path: JsonPath, by = 1): this {
        increment(this.#value, path, by);
        return this;
    }

    decrement(path: JsonPath, by = 1): this {
        increment(this.#value, path, -by);
        return this;
    }

    move(from: JsonPath, to: JsonPath): this {
        move(this.#value, from, to);
        return this;
    }

    copy(from: JsonPath, to: JsonPath): this {
        copy(this.#value, from, to);
        return this;
    }

    rename(path: JsonPath, to: string): this {
        rename(this.#value, path, to);
        return this;
    }

    /** Replace the entire document value. */
    replace(value: JsonValue): this {
        this.#value = value;
        return this;
    }

    /** Apply a batch of operations in order. */
    patch(ops: ReadonlyArray<PatchOp>): this {
        applyPatch(this.#value, ops);
        return this;
    }

    // --- persistence -------------------------------------------------------

    /**
     * Write the current value as a new Walrus blob. If the document is bound to a
     * pointer, the pointer is also updated to the new blob in the same call.
     */
    async commit(options: CommitOptions): Promise<CommitResult | PointerCommitResult> {
        const result = await this.#backend.writeDocument(this.#value, options);
        this.#sourceBlobId = result.blobId;

        if (this.#pointerId !== undefined) {
            const { txDigest } = await this.#backend.updatePointer(this.#pointerId, result.blobId);
            return { ...result, pointerId: this.#pointerId, txDigest };
        }

        return result;
    }
}
