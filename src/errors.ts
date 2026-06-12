/** Base class for all errors thrown by walrus-json. */
export class WalrusJsonError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}

/** A path could not be parsed or is otherwise invalid. */
export class InvalidPathError extends WalrusJsonError {
    constructor(path: unknown, reason?: string) {
        super(`Invalid JSON path: ${JSON.stringify(path)}${reason ? ` (${reason})` : ''}`);
    }
}

/** A path expected to exist did not, or its parent was the wrong type. */
export class PathResolutionError extends WalrusJsonError {}

/** An operation expected a value of a certain type but found another. */
export class TypeMismatchError extends WalrusJsonError {
    constructor(path: string, expected: string, actual: string) {
        super(`Expected ${expected} at "${path}" but found ${actual}`);
    }
}

/** A blob's bytes could not be parsed as JSON. */
export class InvalidJsonBlobError extends WalrusJsonError {
    constructor(blobId: string, cause?: unknown) {
        super(`Blob ${blobId} does not contain valid JSON`);
        if (cause !== undefined) this.cause = cause;
    }
}

/** A configuration value required for an operation was missing. */
export class MissingConfigError extends WalrusJsonError {}
