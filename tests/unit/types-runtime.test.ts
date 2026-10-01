/**
 * src/types.ts es solo tipos: importarlo no trae ningún valor en runtime.
 */
import { describe, expect, it } from 'vitest';
import * as types from '../../src/types.js';

describe('src/types.ts', () => {
  it('types.ts has no runtime exports', () => {
    expect(Object.keys(types)).toEqual([]);
  });
});
