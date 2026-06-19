import type { WalrusNetwork } from './types.js';

/**
 * Canonical on-chain `walrus_json` package ids published by Quadra Labs.
 *
 * Pointer operations call `${packageId}::pointer::...`, so they need a deployed
 * package. Instead of publishing your own, you can use one of these. The
 * `WalrusJsonClient` falls back to the entry for its network when you do not pass
 * a `packageId`. A network only appears here once the package is published on it.
 */
export const WALRUS_JSON_PACKAGE_IDS: Partial<Record<WalrusNetwork, string>> = {
    testnet: '0x109cb22a1e577217d24c476f64053367c19de15e31728c0d412f1e1dea468191',
};

/** The canonical package id for a network, or `undefined` if none is published yet. */
export function defaultPackageId(network: WalrusNetwork): string | undefined {
    return WALRUS_JSON_PACKAGE_IDS[network];
}
