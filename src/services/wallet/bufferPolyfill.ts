import { Buffer } from 'buffer';

// The Wallet API dependency graph uses Buffer during module evaluation,
// before a client or transport can be constructed.
if (typeof globalThis.Buffer === 'undefined') {
    Object.assign(globalThis, { Buffer });
}
