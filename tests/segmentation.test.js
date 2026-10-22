import test from 'node:test';
import assert from 'node:assert/strict';
import { MIB, KIB, MemoryMode } from '../src/domain/constants.js';
import { createInitialState } from '../src/domain/models.js';
import { allocate, terminate } from '../src/engine/simulator.js';
import { assertState } from '../src/domain/invariants.js';
import { deriveMetrics } from '../src/domain/metrics.js';
import { translateAddress } from '../src/domain/translation.js';
import { program, segmentedHoles } from './noncontiguous-fixtures.js';

test('S01: segment placement distinguishes all fit policies and records probes', () => {
  const base = segmentedHoles([MIB, KIB, 768 * KIB, KIB, 2 * MIB, 15 * MIB - (3 * MIB + 770 * KIB)]);
  const request = program('REQUEST', [512 * KIB]);
  const expected = { FIRST_FIT: MIB, BEST_FIT: 2 * MIB + KIB, WORST_FIT: 2 * MIB + 770 * KIB };
  for (const [algorithm, start] of Object.entries(expected)) {
    const result = allocate({ ...base, programs: [...base.programs, request] }, request.id, algorithm);
    assert.equal(result.state.programs.at(-1).segmentTable[0].base, start);
    assert.ok(result.trace.steps[0].inspectedCandidates.length > 0);
    assertState(result.state);
  }
});

test('S02: P4 loads across two separate 2 MiB holes without a 4 MiB hole', () => {
  const state = segmentedHoles([2 * MIB, MIB, 2 * MIB, 10 * MIB]);
  const result = allocate(state, 'P4');
  assert.deepEqual(result.state.programs.find(p => p.id === 'P4').segmentTable.map(d => d.base / MIB), [1, 4, 2, 5.5]);
  assert.equal(deriveMetrics(result.state).internalFragmentationBytes, 0);
  assertState(result.state);
  const freed = terminate(result.state, 'P4');
  assert.deepEqual(freed.blocks.filter(b => b.kind === 'HOLE').map(b => b.sizeBytes), [2 * MIB, 2 * MIB]);
  assertState(freed);
});

test('S03: partial placement failure is atomic; Best Fit can succeed where First Fit fails', () => {
  const base = segmentedHoles([6 * KIB, KIB, 4 * KIB, 15 * MIB - 11 * KIB]);
  const request = program('REQUEST', [4 * KIB, 6 * KIB]);
  const state = { ...base, programs: [...base.programs, request] }, snapshot = structuredClone(state);
  assert.throws(() => allocate(state, request.id, 'FIRST_FIT'), error => error.code === 'EXTERNAL_FRAGMENTATION' && error.details.trace.steps.length === 2 && error.details.trace.probes > 0);
  assert.deepEqual(state, snapshot);
  assertState(allocate(state, request.id, 'BEST_FIT').state);
});

test('S04/S05: own table, exact limits and R/W/X permissions govern translation', () => {
  let state = createInitialState({ mode: MemoryMode.SEGMENTATION }, [program('P', [4096, 1024]), program('OTHER', [64])]);
  state = allocate(state, 'P').state;
  const request = { instanceId: 'P', segmentNumber: 0, operation: 'READ' };
  assert.equal(translateAddress(state, { ...request, offset: 0 }).physicalAddress, MIB);
  assert.equal(translateAddress(state, { ...request, offset: 4095 }).physicalAddress, MIB + 4095);
  for (const offset of [-1, 4096, 0.5, NaN]) assert.throws(() => translateAddress(state, { ...request, offset }), { code: 'INVALID_LOGICAL_ADDRESS' });
  assert.throws(() => translateAddress(state, { ...request, offset: 0, operation: 'WRITE' }), { code: 'ACCESS_DENIED' });
  assert.throws(() => translateAddress(state, { ...request, segmentNumber: 2, offset: 0 }), { code: 'INVALID_SELECTOR' });
  assert.throws(() => translateAddress(state, { ...request, instanceId: 'OTHER', offset: 0 }), { code: 'PROGRAM_NOT_RESIDENT' });
  assert.equal(translateAddress(state, { ...request, segmentNumber: 1, offset: 0, operation: 'WRITE' }).physicalAddress, MIB + 4096);
});
