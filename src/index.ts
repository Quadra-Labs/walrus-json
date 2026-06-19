export { WalrusJsonClient } from './client.js';
export type { WalrusJsonClientOptions } from './client.js';

export { WALRUS_JSON_PACKAGE_IDS, defaultPackageId } from './deployments.js';

export { JsonDocument } from './document.js';
export type { DocumentBackend, DocumentInit } from './document.js';

export {
    buildCreatePointerTx,
    buildUpdatePointerTx,
    executeCreatePointer,
    executeUpdatePointer,
    readPointer,
    PointerTransactionError,
} from './pointer.js';
export type { CreatePointerOptions } from './pointer.js';

export { readJson, writeJson, encodeJson } from './walrusIO.js';
export type { WalrusApi } from './walrusIO.js';

export * as ops from './ops.js';
export { parsePath, formatPath, getAtPath, hasAtPath } from './path.js';
export type { Segment } from './path.js';

export {
    WalrusJsonError,
    InvalidPathError,
    PathResolutionError,
    TypeMismatchError,
    InvalidJsonBlobError,
    MissingConfigError,
} from './errors.js';

export type {
    JsonValue,
    JsonPrimitive,
    JsonObject,
    JsonArray,
    JsonPath,
    PatchOp,
    WalrusNetwork,
    CommitOptions,
    CommitResult,
    PointerCommitResult,
    PointerState,
    WalrusBlobObject,
} from './types.js';
