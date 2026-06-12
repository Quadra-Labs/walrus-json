/**
 * End-to-end walrus-json example: create a JSON document, commit it to Walrus,
 * wrap it in a Sui pointer, mutate it (writing a new blob), and resolve the
 * pointer back to the latest JSON.
 *
 * Requires a funded keypair (SUI for gas, WAL for storage) on the target network.
 *
 *   WALRUS_JSON_SECRET_KEY=suiprivkey1... \
 *   WALRUS_JSON_PACKAGE_ID=0x...          \
 *   npx tsx examples/quickstart.ts
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

import { WalrusJsonClient, type PointerCommitResult } from '../src/index.js';

async function main() {
    const secretKey = process.env.WALRUS_JSON_SECRET_KEY;
    const packageId = process.env.WALRUS_JSON_PACKAGE_ID;
    if (!secretKey || !packageId) {
        throw new Error('Set WALRUS_JSON_SECRET_KEY and WALRUS_JSON_PACKAGE_ID');
    }

    const signer = Ed25519Keypair.fromSecretKey(secretKey);
    const wj = new WalrusJsonClient({
        network: 'testnet',
        signer,
        packageId,
        defaultEpochs: 5,
    });

    // 1. Create a document and commit it as the first blob.
    const doc = wj.create({ users: [], meta: { count: 0 } });
    doc.append('users', { id: 1, name: 'ada' })
        .set('meta.updatedAt', Date.now())
        .increment('meta.count');

    const first = await doc.commit({ epochs: 5, deletable: true });
    console.log('first blob:', first.blobId);

    // 2. Create a stable pointer to that blob.
    const pointerId = await wj.createPointer(first.blobId);
    console.log('pointer:', pointerId);

    // 3. Open via the pointer, mutate, and commit again. This writes a NEW blob
    //    and re-points the pointer in one call.
    const live = await wj.openPointer(pointerId);
    live.append('users', { id: 2, name: 'linus' }).increment('meta.count');
    const next = (await live.commit({ epochs: 5 })) as PointerCommitResult;
    console.log('second blob:', next.blobId, 'pointer tx:', next.txDigest);

    // 4. Resolve the pointer to the latest JSON (what the Indexer serves publicly).
    const latest = await wj.resolvePointer(pointerId);
    console.log('latest document:', JSON.stringify(latest, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
