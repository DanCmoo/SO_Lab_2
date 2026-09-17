import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, MIB, AllocationAlgorithm } from '../src/domain/constants.js';
import { createInitialState } from '../src/domain/models.js';
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

  // P1 (2 MiB) con mejor ajuste debe elegir PART-2 (2 MiB), sin fragmentación interna.
  const result = allocateStaticUnequal(state, 'P1');
  assert.equal(result.partitionId, 'PART-2');
  assert.equal(result.internalFragmentationBytes, 0);
  assert.doesNotThrow(() => assertState(result.state));
});
