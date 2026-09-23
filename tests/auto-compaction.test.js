import test from 'node:test';
import assert from 'node:assert/strict';
import { AllocationAlgorithm, BlockKind, MemoryMode, MIB } from '../src/domain/constants.js';
import { ErrorCode } from '../src/domain/errors.js';
import { assertState } from '../src/domain/invariants.js';
import { createMemoryBlock, createProgram } from '../src/domain/models.js';
import { allocate } from '../src/engine/simulator.js';
import { reduceCommand } from '../src/state/commands.js';
import { createStore } from '../src/state/store.js';

function fragmentedState(mode = MemoryMode.DYNAMIC_COMPACTION) {
  const programA = createProgram({
    id: 'PA', name: 'ProgA', segments: [{ id: 'PA-1', name: 'Code', sizeBytes: 2 * MIB }]
  });
  const programB = createProgram({
    id: 'PB', name: 'ProgB', segments: [{ id: 'PB-1', name: 'Code', sizeBytes: 9 * MIB }]
  });
  const requestedProgram = createProgram({
    id: 'PREQ', name: 'ProgReq', segments: [{ id: 'PREQ-1', name: 'Code', sizeBytes: 3 * MIB }]
  });

  return {
    schemaVersion: 1,
    phase: 'RUNNING',
    config: {
      mode,
      algorithm: AllocationAlgorithm.FIRST_FIT,
      totalBytes: 16 * MIB,
      osBytes: 1 * MIB,
      equalPartitionCount: null,
      unequalPartitionSizes: []
    },
    programs: [
      { ...programA, status: 'allocated', start: 0x300000, end: 0x4FFFFF },
      { ...programB, status: 'allocated', start: 0x700000, end: 0xFFFFFF },
      requestedProgram
    ],
    partitions: [],
    blocks: [
      createMemoryBlock({ id: 'OS', kind: BlockKind.OS, start: 0, sizeBytes: 1 * MIB }),
      createMemoryBlock({ id: 'H1', kind: BlockKind.HOLE, start: 0x100000, sizeBytes: 2 * MIB }),
      createMemoryBlock({ id: 'PA', kind: BlockKind.PROCESS, start: 0x300000, sizeBytes: 2 * MIB, programId: 'PA' }),
      createMemoryBlock({ id: 'H2', kind: BlockKind.HOLE, start: 0x500000, sizeBytes: 2 * MIB }),
      createMemoryBlock({ id: 'PB', kind: BlockKind.PROCESS, start: 0x700000, sizeBytes: 9 * MIB, programId: 'PB' })
    ],
    nextSequence: 1,
    selectedId: null,
    lastTrace: null,
    lastCompaction: null
  };
}

test('Auto-compaction: allocation resolves external fragmentation atomically', () => {
  const result = allocate(fragmentedState(), 'PREQ');

  assert.equal(result.autoCompacted, true);
  assert.equal(result.compactionBytesMoved, 11 * MIB);
  assert.equal(result.compactionRelocations.length, 2);
  assert.equal(result.state.programs.find(p => p.id === 'PREQ').status, 'allocated');
  assert.equal(result.state.programs.find(p => p.id === 'PREQ').start, 0xC00000);
  assert.deepEqual(result.state.lastCompaction, {
    bytesMoved: 11 * MIB,
    relocations: result.compactionRelocations,
    triggeredByProgramId: 'PREQ'
  });
  assert.doesNotThrow(() => assertState(result.state));
});

test('Auto-compaction: insufficient total memory is propagated without compacting', () => {
  const state = fragmentedState();
  const tooLarge = createProgram({
    id: 'PLARGE', name: 'Too large', segments: [{ id: 'PLARGE-1', name: 'Code', sizeBytes: 5 * MIB }]
  });
  const stateWithLargeRequest = { ...state, programs: [...state.programs, tooLarge] };

  assert.throws(() => allocate(stateWithLargeRequest, 'PLARGE'), {
    code: ErrorCode.INSUFFICIENT_TOTAL_MEMORY
  });
});

test('Auto-compaction: dynamic mode without compaction still rejects external fragmentation', () => {
  assert.throws(() => allocate(fragmentedState(MemoryMode.DYNAMIC_NO_COMPACTION), 'PREQ'), {
    code: ErrorCode.EXTERNAL_FRAGMENTATION
  });
});

test('Auto-compaction: undo restores the original fragmented state in one step', () => {
  const initialState = fragmentedState();
  const store = createStore(initialState, reduceCommand);

  const allocation = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'PREQ' });
  assert.equal(allocation.ok, true);
  assert.equal(allocation.details.autoCompacted, true);

  const undo = store.dispatch({ type: 'UNDO' });
  assert.equal(undo.ok, true);
  assert.deepEqual(store.getState().blocks, initialState.blocks);
  assert.deepEqual(store.getState().programs, initialState.programs);
  assert.equal(store.getState().lastCompaction, null);
});
