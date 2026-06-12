import { RetryableWalrusClientError } from '@mysten/walrus';
import type { Signer } from '@mysten/sui/cryptography';

import { InvalidJsonBlobError } from './errors.js';
import type { JsonValue, WalrusBlobObject } from './types.js';

/**
 * The subset of the `@mysten/walrus` client surface that walrus-json relies on.
 * Declared structurally so the library is not coupled to the SDK's internal
 * extension types.
 */
export interface WalrusApi {
    readBlob(options: { blobId: string; signal?: AbortSignal }): Promise<Uint8Array>;
    writeBlob(options: {
        blob: Uint8Array;
        deletable: boolean;
        epochs: number;
        signer: Signer;
        owner?: string;
    }): Promise<{ blobId: string; blobObject: WalrusBlobObject }>;
    reset(): void;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Run a Walrus operation, transparently resetting the client and retrying once
 * when it throws a {@link RetryableWalrusClientError} (e.g. stale epoch cache).
 */
async function withRetry<T>(walrus: WalrusApi, run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (error) {
        if (error instanceof RetryableWalrusClientError) {
            walrus.reset();
            return await run();
        }
        throw error;
    }
}

/** Read a blob and parse it as JSON. */
export async function readJson(
    walrus: WalrusApi,
    blobId: string,
    signal?: AbortSignal,
): Promise<JsonValue> {
    const bytes = await withRetry(walrus, () => walrus.readBlob({ blobId, signal }));
    const text = decoder.decode(bytes);
    try {
        return JSON.parse(text) as JsonValue;
    } catch (cause) {
        throw new InvalidJsonBlobError(blobId, cause);
    }
}

/** Serialize a JSON value and write it as a new Walrus blob. */
export async function writeJson(
    walrus: WalrusApi,
    signer: Signer,
    value: JsonValue,
    options: { epochs: number; deletable?: boolean; owner?: string },
): Promise<{ blobId: string; blobObject: WalrusBlobObject }> {
    const blob = encoder.encode(JSON.stringify(value));
    return withRetry(walrus, () =>
        walrus.writeBlob({
            blob,
            epochs: options.epochs,
            deletable: options.deletable ?? true,
            signer,
            ...(options.owner !== undefined ? { owner: options.owner } : {}),
        }),
    );
}

/** Encode a JSON value to the exact bytes that would be written to a blob. */
export function encodeJson(value: JsonValue): Uint8Array {
    return encoder.encode(JSON.stringify(value));
}
