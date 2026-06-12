import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { Signer } from '@mysten/sui/cryptography';
import {
    MAINNET_WALRUS_PACKAGE_CONFIG,
    TESTNET_WALRUS_PACKAGE_CONFIG,
    walrus,
    type WalrusClientExtensionOptions,
} from '@mysten/walrus';

import { JsonDocument } from './document.js';
import { MissingConfigError } from './errors.js';
import {
    executeCreatePointer,
    executeUpdatePointer,
    readPointer,
    type CreatePointerOptions,
} from './pointer.js';
import { readJson, writeJson, type WalrusApi } from './walrusIO.js';
import type {
    CommitOptions,
    CommitResult,
    JsonValue,
    PointerState,
    WalrusNetwork,
} from './types.js';

const DEFAULT_BASE_URLS: Record<WalrusNetwork, string> = {
    testnet: 'https://fullnode.testnet.sui.io:443',
    mainnet: 'https://fullnode.mainnet.sui.io:443',
};

export interface WalrusJsonClientOptions {
    /** Sui/Walrus network. Defaults to `testnet`. */
    network?: WalrusNetwork;
    /** Sui full node base URL. Defaults to the public node for `network`. */
    baseUrl?: string;
    /**
     * Sui RPC transport. `jsonRpc` (default) is the most compatible across
     * environments; `grpc` can be faster but requires a gRPC-web capable network
     * path (some proxies break it).
     */
    transport?: 'jsonRpc' | 'grpc';
    /** Signer that pays for and authorizes blob writes and pointer transactions. */
    signer: Signer;
    /** Object id of the published `walrus_json` Move package. Required for pointer operations. */
    packageId?: string;
    /** Extra options forwarded to the Walrus client extension (upload relay, wasmUrl, etc.). */
    walrus?: WalrusClientExtensionOptions;
    /** Default number of epochs to store blobs for. */
    defaultEpochs?: number;
    /** Default deletability for written blobs. Defaults to `true`. */
    defaultDeletable?: boolean;
}

/**
 * Entry point for walrus-json. Wraps a Sui client extended with the Walrus SDK,
 * and exposes ergonomic JSON documents plus on-chain pointer management.
 */
export class WalrusJsonClient {
    readonly sui: SuiGrpcClient;
    readonly network: WalrusNetwork;

    #signer: Signer;
    #packageId: string | undefined;
    #defaultEpochs: number | undefined;
    #defaultDeletable: boolean;

    constructor(options: WalrusJsonClientOptions) {
        this.network = options.network ?? 'testnet';
        this.#signer = options.signer;
        this.#packageId = options.packageId;
        this.#defaultEpochs = options.defaultEpochs;
        this.#defaultDeletable = options.defaultDeletable ?? true;

        const baseUrl = options.baseUrl ?? DEFAULT_BASE_URLS[this.network];
        const walrusOptions: WalrusClientExtensionOptions = {
            ...(this.network === 'mainnet'
                ? { packageConfig: MAINNET_WALRUS_PACKAGE_CONFIG }
                : { packageConfig: TESTNET_WALRUS_PACKAGE_CONFIG }),
            ...options.walrus,
        };

        // Both clients implement the same unified core API, so the rest of the
        // library treats either as a `SuiGrpcClient`-shaped client.
        const extended =
            (options.transport ?? 'jsonRpc') === 'grpc'
                ? new SuiGrpcClient({ network: this.network, baseUrl }).$extend(
                      walrus(walrusOptions),
                  )
                : new SuiJsonRpcClient({ network: this.network, url: baseUrl }).$extend(
                      walrus(walrusOptions),
                  );

        this.sui = extended as unknown as SuiGrpcClient;
    }

    /** The Walrus client surface used for blob reads/writes. */
    get walrusClient(): WalrusApi {
        return (this.sui as unknown as { walrus: WalrusApi }).walrus;
    }

    /** The signer used for writes and pointer transactions. */
    get signer(): Signer {
        return this.#signer;
    }

    // --- documents ---------------------------------------------------------

    /** Create a new in-memory document. Nothing is written until `commit()`. */
    create(initial: JsonValue = {}): JsonDocument {
        return new JsonDocument(this.#backend(), structuredClone(initial));
    }

    /** Load an existing blob into a document. */
    async open(blobId: string): Promise<JsonDocument> {
        const value = await readJson(this.walrusClient, blobId);
        return new JsonDocument(this.#backend(), value, { sourceBlobId: blobId });
    }

    /** Load the document a pointer currently references, bound for re-pointing on commit. */
    async openPointer(pointerId: string): Promise<JsonDocument> {
        const state = await readPointer(this.sui, pointerId);
        const value = await readJson(this.walrusClient, state.blobId);
        return new JsonDocument(this.#backend(), value, {
            sourceBlobId: state.blobId,
            pointerId,
        });
    }

    // --- raw blob helpers --------------------------------------------------

    /** Read and parse a blob as JSON. */
    async readJson(blobId: string): Promise<JsonValue> {
        return readJson(this.walrusClient, blobId);
    }

    /** Write a JSON value as a new blob without any document/pointer wrapping. */
    async writeJson(value: JsonValue, options?: Partial<CommitOptions>): Promise<CommitResult> {
        return this.writeDocument(value, this.#resolveCommit(options));
    }

    // --- pointers ----------------------------------------------------------

    /** Create a Sui pointer object referencing `blobId`. Returns its object id. */
    async createPointer(blobId: string, options?: CreatePointerOptions): Promise<string> {
        const { pointerId } = await executeCreatePointer(
            this.sui,
            this.#signer,
            this.#requirePackageId(),
            blobId,
            options,
        );
        return pointerId;
    }

    /** Point an existing pointer at a new blob. */
    async updatePointer(pointerId: string, blobId: string): Promise<{ txDigest: string }> {
        return executeUpdatePointer(
            this.sui,
            this.#signer,
            this.#requirePackageId(),
            pointerId,
            blobId,
        );
    }

    /** Read the current on-chain state of a pointer. */
    async readPointer(pointerId: string): Promise<PointerState> {
        return readPointer(this.sui, pointerId);
    }

    /** Resolve a pointer to the JSON of the blob it currently references. */
    async resolvePointer(pointerId: string): Promise<JsonValue> {
        const state = await readPointer(this.sui, pointerId);
        return readJson(this.walrusClient, state.blobId);
    }

    // --- internals ---------------------------------------------------------

    /** Backend handed to documents so they can persist themselves. */
    #backend() {
        return {
            writeDocument: (value: JsonValue, options: CommitOptions) =>
                this.writeDocument(value, options),
            updatePointer: (pointerId: string, blobId: string) =>
                this.updatePointer(pointerId, blobId),
        };
    }

    private async writeDocument(value: JsonValue, options: CommitOptions): Promise<CommitResult> {
        return writeJson(this.walrusClient, this.#signer, value, {
            epochs: options.epochs,
            deletable: options.deletable ?? this.#defaultDeletable,
            ...(options.owner !== undefined ? { owner: options.owner } : {}),
        });
    }

    #resolveCommit(options?: Partial<CommitOptions>): CommitOptions {
        const epochs = options?.epochs ?? this.#defaultEpochs;
        if (epochs === undefined) {
            throw new MissingConfigError(
                'epochs is required: pass it to the call or set defaultEpochs on the client',
            );
        }
        return {
            epochs,
            deletable: options?.deletable ?? this.#defaultDeletable,
            ...(options?.owner !== undefined ? { owner: options.owner } : {}),
        };
    }

    #requirePackageId(): string {
        if (this.#packageId === undefined) {
            throw new MissingConfigError(
                'packageId is required for pointer operations; pass it to the WalrusJsonClient constructor',
            );
        }
        return this.#packageId;
    }
}
