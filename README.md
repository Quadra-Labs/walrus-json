# walrus-json

Ergonomic JSON manipulation over [Walrus](https://www.walrus.xyz/) blobs, with a Sui **pointer object** that serves as the stable, mutable handle to the latest blob.

Walrus blobs are immutable and content-addressed: a `blobId` is a hash of the
content, so any change to the JSON yields a **new** `blobId`. `walrus-json`
embraces this. Every mutation reads the current blob, applies in-memory JSON
operations, writes a **new** blob, and re-points an on-chain `JsonPointer` at the
new `blobId`. Nothing is ever rewritten in place; old blobs simply expire when
their paid storage period ends.

This is the storage primitive behind the Quadra Indexer:

```
mutate JSON -> writeBlob (new blobId) -> pointer::update(blobId) on Sui -> Indexer serves reads
```

## Install

```bash
npm install walrus-json @mysten/walrus @mysten/sui
```

## Quick start

```ts
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { WalrusJsonClient } from 'walrus-json';

const wj = new WalrusJsonClient({
    network: 'testnet',
    signer: Ed25519Keypair.generate(),
    packageId: '0x...', // published walrus_json Move package
});

// Create a new document and commit it as a Walrus blob.
const doc = wj.create({ users: [], meta: { count: 0 } });
doc.append('users', { id: 1, name: 'ada' })
    .set('meta.updatedAt', Date.now())
    .increment('meta.count');

const { blobId } = await doc.commit({ epochs: 5, deletable: true });

// Open an existing blob, mutate it, write a brand new blob.
const next = await wj.open(blobId);
next.merge('meta', { tag: 'release' });
const { blobId: newBlobId } = await next.commit({ epochs: 5 });

// Stable pointer: one id that always resolves to the latest blob.
const pointerId = await wj.createPointer(newBlobId);
const live = await wj.openPointer(pointerId);
live.append('users', { id: 2, name: 'linus' });
await live.commit({ epochs: 5 }); // writes new blob AND updates the pointer

const latest = await wj.resolvePointer(pointerId); // latest JSON, for public reads
```

## JSON operations

All operations accept either a dot-path (`users[0].name`, `meta.count`) or a
JSON Pointer (`/users/0/name`).

| Method                                          | Description                                                |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `get(path)`                                     | Read a value at a path.                                    |
| `has(path)`                                     | Whether a path exists.                                     |
| `set(path, value)`                              | Set/replace a value, creating intermediate objects/arrays. |
| `merge(path, partial, { deep })`                | Shallow or deep merge an object into the target.           |
| `append(path, ...items)`                        | Push items onto an array.                                  |
| `prepend(path, ...items)`                       | Unshift items onto an array.                               |
| `insert(path, index, item)`                     | Insert into an array at an index.                          |
| `remove(path)`                                  | Delete an object key or array element.                     |
| `increment(path, by?)` / `decrement(path, by?)` | Add/subtract from a number.                                |
| `move(from, to)` / `copy(from, to)`             | Move/copy a value between paths.                           |
| `rename(path, key)`                             | Rename an object key in place.                             |
| `replace(value)`                                | Replace the entire document.                               |
| `patch(ops)`                                    | Apply a batch of the above operations.                     |

Mutations are chainable and applied in memory; nothing touches Walrus until you
call `commit()`.

## On-chain pointer

The `walrus_json::pointer` Move package (in [`move/walrus_json`](move/walrus_json))
defines a `JsonPointer` object that stores the current `blobId`, a monotonically
increasing `version`, and emits `PointerCreated` / `PointerUpdated` events for the
Indexer to subscribe to. Build and publish it with `sui move build` /
`sui client publish`, then pass the resulting `packageId` to `WalrusJsonClient`.

## Requirements

Writing blobs uses the `@mysten/walrus` SDK directly with a Sui keypair signer.
The signer's address needs SUI (for transactions) and WAL (for storage) on the
target network.

## Development

```bash
npm install
npm run build      # tsup -> dist/ (ESM + d.ts)
npm test           # vitest (pure path/ops unit tests, no network)
npm run typecheck  # tsc --noEmit
```
