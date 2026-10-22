import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, MIB, PAGE_SIZES } from '../src/domain/constants.js';
import { createInitialState } from '../src/domain/models.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { allocate, terminate } from '../src/engine/simulator.js';
import { deriveMetrics } from '../src/domain/metrics.js';
import { assertState } from '../src/domain/invariants.js';
import { translateAddress, parseAddressInput } from '../src/domain/translation.js';
import { projectFrames } from '../src/domain/paging-layout.js';
import { program, sparsePaged } from './noncontiguous-fixtures.js';

test('P01/P06: default frame numbering and all five complete programs', () => {
  let state = createInitialState({ mode: MemoryMode.PAGING }, getDefaultPrograms());
  assert.equal(state.frames.length, 4096);
  assert.equal(state.frames.filter(f => f.ownerKind === 'OS').length, 256);
  for (const id of ['P1', 'P2', 'P3', 'P4', 'P5']) { state = allocate(state, id).state; assertState(state); }
  const metrics = deriveMetrics(state);
  assert.equal(metrics.allocatedPageCount, 3264);
  assert.equal(metrics.freeFrameCount, 576);
  assert.equal(metrics.internalFragmentationBytes, 0);
  assert.equal(state.programs[0].pageTable[0].frameNumber, 256);
  assert.equal(state.blocks.at(-1).end, 0xFFFFFF);
});

test('P02/P03/P05: noncontiguous pages, crossing regions, padding rejection and exact conservation', () => {
  const base = sparsePaged(), result = allocate(base, 'TARGET'), state = result.state;
  assert.deepEqual(state.programs.at(-1).pageTable.map(p => p.frameNumber), [256, 260, 300]);
  assertState(state);
  assert.equal(deriveMetrics(state).internalFragmentationBytes, 4095);
  for (const [logicalAddress, physicalAddress] of [[0, 0x100000], [4103, 0x104007], [8192, 0x12C000]]) {
    assert.equal(translateAddress(state, { instanceId: 'TARGET', format: 'linear', logicalAddress }).physicalAddress, physicalAddress);
  }
  for (const request of [{ format: 'linear', logicalAddress: 8193 }, { format: 'pair', pageNumber: 2, offset: 1 }, { format: 'pair', pageNumber: 0, offset: 4096 }]) {
    assert.throws(() => translateAddress(state, { instanceId: 'TARGET', ...request }), { code: 'INVALID_LOGICAL_ADDRESS' });
  }
  const freed = terminate(state, 'TARGET');
  assert.deepEqual(freed.frames, base.frames);
  assertState(freed);
  const unavailable = { ...base, programs: [...base.programs, program('BIG', [4 * 4096])] };
  const snapshot = structuredClone(unavailable);
  assert.throws(() => allocate(unavailable, 'BIG'), { code: 'INSUFFICIENT_FRAMES' });
  assert.deepEqual(unavailable, snapshot);
});

test('P04/P07: page sizes, rounding boundaries, OS alignment and zero OS', () => {
  for (const Q of PAGE_SIZES) {
    for (const size of [1, Q - 1, Q, Q + 1]) {
      const state = allocate(createInitialState({ mode: MemoryMode.PAGING, pageSizeBytes: Q, osBytes: 0 }, [program('P', [size])]), 'P').state;
      assert.equal(state.programs[0].pageTable.length, Math.ceil(size / Q));
      assert.equal(deriveMetrics(state).internalFragmentationBytes, Math.ceil(size / Q) * Q - size);
      assertState(state);
    }
  }
  for (const config of [{ pageSizeBytes: 3000 }, { osBytes: 1 }, { osBytes: 16 * MIB }]) assert.throws(() => createInitialState({ mode: MemoryMode.PAGING, ...config }), { code: 'INVALID_CONFIGURATION' });
  for (const value of ['12abc', '-1', '1.1', '', '0xZZ', NaN, Infinity]) assert.throws(() => parseAddressInput(value));
  assert.equal(parseAddressInput('0xFFF'), 4095);
  assert.equal(parseAddressInput('0'), 0);
});

test('C01: highest physical byte is valid and the next logical byte is rejected', () => {
  const state = allocate(createInitialState({ mode: MemoryMode.PAGING, osBytes: 0 }, [program('FULL', [16 * MIB])]), 'FULL').state;
  assertState(state);
  assert.equal(translateAddress(state, { instanceId: 'FULL', format: 'linear', logicalAddress: 0xFFFFFF }).physicalAddress, 0xFFFFFF);
  assert.throws(() => translateAddress(state, { instanceId: 'FULL', format: 'linear', logicalAddress: 0x1000000 }), { code: 'INVALID_LOGICAL_ADDRESS' });
});
