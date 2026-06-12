// Copyright (c), Quadra.
// SPDX-License-Identifier: Apache-2.0

/// A stable, mutable handle to a JSON document stored on Walrus.
///
/// Walrus blobs are immutable and content-addressed: changing the JSON yields a
/// new `blob_id`. A `JsonPointer` holds the id of the *current* blob and a
/// monotonically increasing `version`. Producers update the pointer to a new
/// blob; readers (e.g. the Quadra Indexer) watch `PointerUpdated` events and
/// resolve the latest `blob_id`.
module walrus_json::pointer;

use std::string::String;
use sui::clock::Clock;
use sui::event;

/// The caller is not the owner allowed to update this pointer.
const ENotOwner: u64 = 0;

/// Stable handle to the latest Walrus blob for one logical JSON document.
public struct JsonPointer has key, store {
    id: UID,
    /// The Walrus blob id (the SDK string form) of the current document.
    blob_id: String,
    /// Incremented on every update; gives readers a total order.
    version: u64,
    /// Timestamp of the last write, in epoch milliseconds.
    updated_at_ms: u64,
    /// The only address allowed to update this pointer.
    owner: address,
}

/// Emitted when a pointer is first created.
public struct PointerCreated has copy, drop {
    pointer_id: ID,
    blob_id: String,
    owner: address,
    updated_at_ms: u64,
}

/// Emitted on every pointer update; the Indexer subscribes to this.
public struct PointerUpdated has copy, drop {
    pointer_id: ID,
    blob_id: String,
    version: u64,
    updated_at_ms: u64,
}

/// Create a pointer owned by the transaction sender. Returns the object so the
/// caller can decide whether to share, transfer, or wrap it.
public fun create(blob_id: String, clock: &Clock, ctx: &mut TxContext): JsonPointer {
    let owner = ctx.sender();
    let now = clock.timestamp_ms();
    let pointer = JsonPointer {
        id: object::new(ctx),
        blob_id,
        version: 0,
        updated_at_ms: now,
        owner,
    };
    event::emit(PointerCreated {
        pointer_id: object::id(&pointer),
        blob_id: pointer.blob_id,
        owner,
        updated_at_ms: now,
    });
    pointer
}

/// Point the document at a new blob. Only the owner may call this.
public fun update(self: &mut JsonPointer, blob_id: String, clock: &Clock, ctx: &TxContext) {
    assert!(ctx.sender() == self.owner, ENotOwner);
    self.blob_id = blob_id;
    self.version = self.version + 1;
    self.updated_at_ms = clock.timestamp_ms();
    event::emit(PointerUpdated {
        pointer_id: object::id(self),
        blob_id: self.blob_id,
        version: self.version,
        updated_at_ms: self.updated_at_ms,
    });
}

/// Create a pointer and share it. Sharing makes the latest `blob_id` publicly
/// readable while `update` stays gated to the owner. This is the recommended
/// entry for the Indexer read path. The object is freshly created in this same
/// transaction, so sharing it cannot abort.
#[allow(lint(share_owned))]
public entry fun create_and_share(blob_id: String, clock: &Clock, ctx: &mut TxContext) {
    transfer::share_object(create(blob_id, clock, ctx));
}

/// Create a pointer and transfer it to the sender (owner-held, not public).
public entry fun create_and_keep(blob_id: String, clock: &Clock, ctx: &mut TxContext) {
    let pointer = create(blob_id, clock, ctx);
    transfer::transfer(pointer, ctx.sender());
}

public fun blob_id(self: &JsonPointer): String { self.blob_id }

public fun version(self: &JsonPointer): u64 { self.version }

public fun updated_at_ms(self: &JsonPointer): u64 { self.updated_at_ms }

public fun owner(self: &JsonPointer): address { self.owner }
