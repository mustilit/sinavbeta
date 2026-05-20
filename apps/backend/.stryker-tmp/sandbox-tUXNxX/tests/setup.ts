/**
 * Jest setup: polyfill global crypto for @nestjs/schedule and other deps.
 * Node 18+ has crypto in some contexts, but Jest may not expose it.
 */
// @ts-nocheck

import { webcrypto } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto;
}
