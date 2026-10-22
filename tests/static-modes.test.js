import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, MIB, AllocationAlgorithm } from '../src/domain/constants.js';
import { createInitialState, createSimulationConfig } from '../src/domain/models.js';
import { deriveMetrics } from '../src/domain/metrics.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { allocateStaticEqual, terminateStatic } from '../src/engine/static-equal.js';
import { allocateStaticUnequal } from '../src/engine/static-unequal.js';
import { assertState } from '../src/domain/invariants.js';

test('Static Equal: AC-02 5 equal partitions of 3 MiB cover 15 MiB user space', () => {
  const state = createInitialState({ mode: MemoryMode.STATIC_EQUAL });
  assert.equal(state.partitions.length, 5);
  for (const part of state.partitions) {
    assert.equal(part.sizeBytes, 3 * MIB);
  }
  assert.equal(state.partitions[0].start, 0x100000);
  assert.equal(state.partitions[4].end, 0xFFFFFF);
});

test('Static Equal: AC-03 2 MiB program in 3 MiB partition reports 1 MiB internal fragmentation', () => {
  const programs = getDefaultPrograms(); // P1 tiene 2 MiB.
  const state = createInitialState({ mode: MemoryMode.STATIC_EQUAL }, programs);

  const result = allocateStaticEqual(state, 'P1');
  assert.equal(result.internalFragmentationBytes, 1 * MIB);
  assert.equal(result.partitionId, 'PART-1');
  assert.equal(result.state.programs.find(p => p.id === 'P1').start, 0x100000);
  assert.equal(result.state.programs.find(p => p.id === 'P1').end, 0x100000 + 2 * MIB - 1);

  assert.doesNotThrow(() => assertState(result.state));

  // Termina P1.
  const terminatedState = terminateStatic(result.state, 'P1');
  assert.equal(terminatedState.programs.find(p => p.id === 'P1').status, 'terminated');
  assert.equal(terminatedState.partitions.find(p => p.id === 'PART-1').programId, null);
  assert.doesNotThrow(() => assertState(terminatedState));
});

test('Static Unequal: allocates according to algorithm policy', () => {
  const programs = getDefaultPrograms(); // P1: 2 MiB, P2: 3 MiB
  // Particiones desiguales: 1 MiB, 2 MiB, 3 MiB, 4 MiB y 5 MiB.
  const state = createInitialState(
    { mode: MemoryMode.STATIC_UNEQUAL, algorithm: AllocationAlgorithm.BEST_FIT },
    programs
  );

  // El mapa es descendente: P1 cabe exactamente en PART-4 (2 MiB).
  const result = allocateStaticUnequal(state, 'P1');
  assert.equal(result.partitionId, 'PART-4');
  assert.equal(result.internalFragmentationBytes, 0);
  assert.doesNotThrow(() => assertState(result.state));
});

test('Static Equal: chosen partition size determines count and leaves an unassignable remainder', () => {
  const state = createInitialState({ mode: MemoryMode.STATIC_EQUAL, equalPartitionSizeBytes: 4 * MIB });
  assert.equal(state.partitions.length, 3);
  assert.equal(state.config.equalPartitionCount, 3);
  assert.ok(state.partitions.every(p => p.sizeBytes === 4 * MIB));
  assert.equal(state.blocks.at(-1).kind, 'UNPARTITIONED');
  assert.equal(state.blocks.at(-1).sizeBytes, 3 * MIB);
  assert.equal(deriveMetrics(state).freeBytes, 12 * MIB);
  assert.equal(deriveMetrics(state).unpartitionedBytes, 3 * MIB);
  assertState(state);
});

test('Static Equal: rejects invalid sizes and keeps the chosen size when OS memory changes', () => {
  for (const size of [0, -1, 1.5, NaN, Infinity, 16 * MIB]) {
    assert.throws(() => createSimulationConfig({ equalPartitionSizeBytes: size }), { code: 'INVALID_CONFIGURATION' });
  }
  const state = createInitialState({ osBytes: 2 * MIB, equalPartitionSizeBytes: 3 * MIB });
  assert.equal(state.partitions.length, 4);
  assert.equal(state.blocks.at(-1).sizeBytes, 2 * MIB);
  assertState(state);
  assertState(createInitialState({ osBytes: 0, equalPartitionSizeBytes: 4 * MIB }));
});

test('Static Unequal: builds a descending physical map with repeated sizes without mutating input', () => {
  const sizes = [4, 2, 1, 3, 4].map(size => size * MIB);
  const expected = [4, 4, 3, 2, 1].map(size => size * MIB);
  const state = createInitialState({ mode: MemoryMode.STATIC_UNEQUAL, osBytes: 2 * MIB, unequalPartitionSizes: sizes });
  assert.deepEqual(sizes, [4, 2, 1, 3, 4].map(size => size * MIB));
  assert.deepEqual(state.config.unequalPartitionSizes, expected);
  assert.deepEqual(state.partitions.map(p => p.sizeBytes), expected);
  assert.deepEqual(state.blocks.filter(b => b.kind === 'PARTITION').map(b => b.sizeBytes), expected);
  let cursor = 2 * MIB;
  for (const part of state.partitions) {
    assert.equal(part.start, cursor);
    assert.equal(part.end, cursor + part.sizeBytes - 1);
    cursor = part.end + 1;
  }
  assert.equal(cursor, 16 * MIB);
  assertState(state);
});

test('Static Unequal: descending layout preserves fit policies and search costs', () => {
  const state = createInitialState({ mode: MemoryMode.STATIC_UNEQUAL }, getDefaultPrograms());
  for (const [algorithm, partitionId, probes] of [
    [AllocationAlgorithm.FIRST_FIT, 'PART-1', 1],
    [AllocationAlgorithm.BEST_FIT, 'PART-4', 5],
    [AllocationAlgorithm.WORST_FIT, 'PART-1', 5]
  ]) {
    const result = allocateStaticUnequal(state, 'P1', algorithm);
    assert.equal(result.partitionId, partitionId);
    assert.equal(result.trace.probes, probes);
    assertState(result.state);
  }
});
