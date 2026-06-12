import { bcs } from '@mysten/sui/bcs';
import type { SuiGrpcClient } from '@mysten/sui/grpc';
import type { Signer } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';

import { WalrusJsonError } from './errors.js';
import type { PointerState } from './types.js';

/** BCS layout of `walrus_json::pointer::JsonPointer` for decoding object content. */
const JsonPointerBcs = bcs.struct('JsonPointer', {
    id: bcs.Address,
    blob_id: bcs.string(),
    version: bcs.u64(),
    updated_at_ms: bcs.u64(),
    owner: bcs.Address,
});

/** Thrown when a pointer transaction fails on chain. */
export class PointerTransactionError extends WalrusJsonError {}

export interface CreatePointerOptions {
    /**
     * Share the pointer object so its `blob_id` is publicly readable (recommended
     * for the Indexer read path). Updates remain gated to the owner. When `false`,
     * the pointer is transferred to the signer instead. Defaults to `true`.
     */
    share?: boolean;
}

function pointerTypeMatches(type: string): boolean {
    return type.endsWith('::pointer::JsonPointer');
}

/** Build a transaction that creates a `JsonPointer` for `blobId`. */
export function buildCreatePointerTx(packageId: string, blobId: string, share = true): Transaction {
    const tx = new Transaction();
    tx.moveCall({
        target: `${packageId}::pointer::${share ? 'create_and_share' : 'create_and_keep'}`,
        arguments: [tx.pure.string(blobId), tx.object(SUI_CLOCK_OBJECT_ID)],
    });
    return tx;
}

/** Build a transaction that points an existing `JsonPointer` at `blobId`. */
export function buildUpdatePointerTx(
    packageId: string,
    pointerId: string,
    blobId: string,
): Transaction {
    const tx = new Transaction();
    tx.moveCall({
        target: `${packageId}::pointer::update`,
        arguments: [tx.object(pointerId), tx.pure.string(blobId), tx.object(SUI_CLOCK_OBJECT_ID)],
    });
    return tx;
}

/** Create a pointer on chain and return its object id and the tx digest. */
export async function executeCreatePointer(
    client: SuiGrpcClient,
    signer: Signer,
    packageId: string,
    blobId: string,
    options: CreatePointerOptions = {},
): Promise<{ pointerId: string; txDigest: string }> {
    const tx = buildCreatePointerTx(packageId, blobId, options.share ?? true);
    const result = await client.core.signAndExecuteTransaction({
        transaction: tx,
        signer,
        include: { effects: true, objectTypes: true },
    });

    if (result.$kind === 'FailedTransaction') {
        throw new PointerTransactionError(
            `Pointer creation failed: ${describeError(result.FailedTransaction.status)}`,
        );
    }

    const txn = result.Transaction;
    const objectTypes = txn.objectTypes ?? {};
    let pointerId: string | undefined;
    for (const [objectId, type] of Object.entries(objectTypes)) {
        if (pointerTypeMatches(type)) {
            pointerId = objectId;
            break;
        }
    }
    if (pointerId === undefined) {
        const created = (txn.effects?.changedObjects ?? []).find(
            (o) => o.idOperation === 'Created',
        );
        pointerId = created?.objectId;
    }
    if (pointerId === undefined) {
        throw new PointerTransactionError(
            'Pointer creation succeeded but no JsonPointer object was found',
        );
    }

    // Wait for the full node to index the tx so an immediate read is consistent.
    await client.core.waitForTransaction({ digest: txn.digest });

    return { pointerId, txDigest: txn.digest };
}

/** Update an existing pointer on chain and return the tx digest. */
export async function executeUpdatePointer(
    client: SuiGrpcClient,
    signer: Signer,
    packageId: string,
    pointerId: string,
    blobId: string,
): Promise<{ txDigest: string }> {
    const tx = buildUpdatePointerTx(packageId, pointerId, blobId);
    const result = await client.core.signAndExecuteTransaction({
        transaction: tx,
        signer,
        include: { effects: true },
    });

    if (result.$kind === 'FailedTransaction') {
        throw new PointerTransactionError(
            `Pointer update failed: ${describeError(result.FailedTransaction.status)}`,
        );
    }

    // Wait for the full node to index the tx so an immediate read is consistent.
    await client.core.waitForTransaction({ digest: result.Transaction.digest });

    return { txDigest: result.Transaction.digest };
}

/** Read the current on-chain state of a `JsonPointer` object. */
export async function readPointer(client: SuiGrpcClient, pointerId: string): Promise<PointerState> {
    const { object } = await client.core.getObject({
        objectId: pointerId,
        include: { content: true },
    });

    const content = object.content;
    if (!content) {
        throw new PointerTransactionError(`Object ${pointerId} has no readable content`);
    }

    const parsed = JsonPointerBcs.parse(content);
    return {
        pointerId,
        blobId: parsed.blob_id,
        version: Number(parsed.version),
        updatedAtMs: Number(parsed.updated_at_ms),
        owner: parsed.owner,
    };
}

function describeError(status: { success: boolean; error: unknown }): string {
    if (status.success) return 'unknown error';
    return JSON.stringify(status.error);
}
