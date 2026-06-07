import { describe, it, expect } from 'vitest';
import { isChunkLoadError } from './chunkReload';

describe('isChunkLoadError', () => {
  it('webpack ChunkLoadError (name) → true', () => {
    const e = new Error('Loading chunk 5 failed');
    e.name = 'ChunkLoadError';
    expect(isChunkLoadError(e)).toBe(true);
  });

  it('Vite/native dinamik import hataları → true', () => {
    for (const msg of [
      'Failed to fetch dynamically imported module: https://x/assets/EditTest-abc.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Loading chunk vendor failed.',
    ]) {
      expect(isChunkLoadError(new Error(msg))).toBe(true);
    }
  });

  it('string mesaj da kabul edilir', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(true);
  });

  it('alakasız hatalar → false (gereksiz reload yapma)', () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false);
  });

  it('null/undefined → false', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
