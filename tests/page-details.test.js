import test from 'node:test';
import assert from 'node:assert/strict';
import { getPageDetails } from '../src/domain/page-details.js';
import { createInitialState } from '../src/domain/models.js';
import { allocate } from '../src/engine/simulator.js';
import { MemoryMode } from '../src/domain/constants.js';
import { program } from './noncontiguous-fixtures.js';

function resident() {
  const target = program('MIXED', [3000, 3000], { heapBytes: 2193, stackBytes: 0 });
  return allocate(createInitialState({ mode: MemoryMode.PAGING }, [target]), target.id).state.programs[0];
}

test('page inspection splits a page at logical region boundaries', () => {
  const p = resident();
  assert.deepEqual(getPageDetails(p, 0, 4096).regions, [
    { name: 'Code', start: 0, end: 2999, bytes: 3000 },
    { name: 'Data', start: 3000, end: 4095, bytes: 1096 }
  ]);
  assert.deepEqual(getPageDetails(p, 1, 4096).regions, [
    { name: 'Data', start: 4096, end: 5999, bytes: 1904 },
    { name: 'Heap', start: 6000, end: 8191, bytes: 2192 }
  ]);
});

test('page inspection excludes padding from all logical regions', () => {
  const p = resident();
  const snapshot = structuredClone(p);
  assert.deepEqual(getPageDetails(p, 2, 4096), {
    logicalStart: 8192, logicalEnd: 8192, usedBytes: 1, paddingBytes: 4095,
    regions: [{ name: 'Heap', start: 8192, end: 8192, bytes: 1 }]
  });
  assert.equal(getPageDetails(p, 3, 4096), null);
  assert.deepEqual(p, snapshot);
});
