/** Any value that survives a `JSON.parse(JSON.stringify(...))` round trip. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

/**
 * A path into a JSON document. Either:
 * - a dot-path string with optional bracket indices: `users[0].name`, `meta.count`
 * - a JSON Pointer (RFC 6901) string: `/users/0/name`
 * - an already-parsed array of segments: `['users', 0, 'name']`
 */
export type JsonPath = string | ReadonlyArray<string | number>;

/** A single mutation in a `patch([...])` batch. */
export type PatchOp =
    | { op: 'set'; path: JsonPath; value: JsonValue }
    | { op: 'merge'; path: JsonPath; value: JsonObject; deep?: boolean }
    | { op: 'append'; path: JsonPath; values: JsonValue[] }
    | { op: 'prepend'; path: JsonPath; values: JsonValue[] }
    | { op: 'insert'; path: JsonPath; index: number; value: JsonValue }
    | { op: 'remove'; path: JsonPath }
    | { op: 'increment'; path: JsonPath; by?: number }
    | { op: 'decrement'; path: JsonPath; by?: number }
    | { op: 'move'; from: JsonPath; to: JsonPath }
    | { op: 'copy'; from: JsonPath; to: JsonPath }
    | { op: 'rename'; path: JsonPath; to: string };

export type WalrusNetwork = 'testnet' | 'mainnet';

/** Options that control how a blob is written to Walrus. */
export interface CommitOptions {
    /** Number of Walrus epochs to pay storage for. */
    epochs: number;
    /** Whether the resulting blob object can be deleted by its owner. Defaults to `true`. */
    deletable?: boolean;
    /** Optional owner address for the created blob object. Defaults to the signer address. */
    owner?: string;
}

/** The minimal shape of the `blobObject` returned by the Walrus SDK. */
export interface WalrusBlobObject {
    id: string;
    blob_id: string;
    registered_epoch: number;
    certified_epoch: number | null;
    size: string;
    deletable: boolean;
    [key: string]: unknown;
}

/** Result of committing a document to Walrus. */
export interface CommitResult {
    blobId: string;
    blobObject: WalrusBlobObject;
}

/** Result of committing a document that is bound to a Sui pointer. */
export interface PointerCommitResult extends CommitResult {
    pointerId: string;
    /** Digest of the Sui transaction that updated the pointer. */
    txDigest: string;
}

/** The on-chain state of a `JsonPointer` object. */
export interface PointerState {
    pointerId: string;
    blobId: string;
    version: number;
    updatedAtMs: number;
    owner: string;
}
