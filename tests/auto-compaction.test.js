import test from 'node:test';
import assert from 'node:assert/strict';
import { AllocationAlgorithm, BlockKind, MemoryMode, MIB } from '../src/domain/constants.js';
import { ErrorCode } from '../src/domain/errors.js';
import { assertState } from '../src/domain/invariants.js';
import { createInitialState, createMemoryBlock, createProgram } from '../src/domain/models.js';
import { allocate, terminate } from '../src/engine/simulator.js';
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

test('Auto-compaction: allocation never compacts even when free memory is fragmented', () => {
  const state = fragmentedState();
  const snapshot = structuredClone(state);
  assert.throws(() => allocate(state, 'PREQ'), { code: ErrorCode.EXTERNAL_FRAGMENTATION });
  assert.deepEqual(state, snapshot);
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

test('Auto-compaction: termination compacts and undo restores process and original addresses together', () => {
  const initialState = fragmentedState();
  const store = createStore(initialState, reduceCommand);

  const termination = store.dispatch({ type: 'TERMINATE_PROGRAM', programId: 'PA' });
  assert.equal(termination.ok, true);
  assert.equal(termination.details.autoCompacted, true);
  assert.equal(termination.details.compactionBytesMoved, 9 * MIB);
  assert.equal(store.getState().programs.find(p => p.id === 'PB').start, MIB);
  assert.equal(store.getState().lastCompaction.trigger, 'TERMINATE_PROGRAM');

  const undo = store.dispatch({ type: 'UNDO' });
  assert.equal(undo.ok, true);
  assert.deepEqual(store.getState().blocks, initialState.blocks);
  assert.deepEqual(store.getState().programs, initialState.programs);
  assert.equal(store.getState().lastCompaction, null);
});

test('Auto-compaction: middle termination immediately leaves a tail hole before any new allocation', () => {
  const programs = [2, 3, 4, 8].map((size, i) => createProgram({
    id: `P${i}`, name: `Process ${i}`, segments: [{ name: 'Code', sizeBytes: size * MIB }]
  }));
  let state = createInitialState({ mode: MemoryMode.DYNAMIC_COMPACTION }, programs);
  for (const id of ['P0', 'P1', 'P2']) state = allocate(state, id).state;
  const input = structuredClone(state);
  const freed = terminate(state, 'P1');
  assert.deepEqual(state, input);
  assert.equal(freed.programs.find(p => p.id === 'P2').start, 3 * MIB);
  assert.equal(freed.lastCompaction.bytesMoved, 4 * MIB);
  assert.deepEqual(freed.lastCompaction.relocations.map(r => r.programId), ['P2']);
  const holes = freed.blocks.filter(b => b.kind === BlockKind.HOLE);
  assert.equal(holes.length, 1);
  assert.equal(holes[0].start, 7 * MIB);
  assert.equal(holes[0].sizeBytes, 9 * MIB);
  assertState(freed);
  const assigned = allocate(freed, 'P3').state;
  assert.equal(assigned.programs.find(p => p.id === 'P3').start, 7 * MIB);
  assert.equal(assigned.lastCompaction, freed.lastCompaction);
  const tailFreed = terminate(assigned, 'P3');
  assert.equal(tailFreed.lastCompaction.bytesMoved, 0);
  assert.deepEqual(tailFreed.lastCompaction.relocations, []);
  assertState(tailFreed);
});

test('Auto-compaction: tail and last-process termination succeed with zero moved bytes', () => {
  const program = createProgram({ id: 'P', name: 'Full', segments: [{ name: 'Code', sizeBytes: 15 * MIB }] });
  const full = allocate(createInitialState({ mode: MemoryMode.DYNAMIC_COMPACTION }, [program]), 'P').state;
  const freed = terminate(full, 'P');
  assert.equal(freed.lastCompaction.bytesMoved, 0);
  assert.equal(freed.blocks.filter(b => b.kind === BlockKind.HOLE).length, 1);
  assertState(freed);
  assert.throws(() => terminate(freed, 'P'), { code: ErrorCode.PROGRAM_NOT_RESIDENT });
});

test('Auto-compaction: mode without compaction preserves other process addresses on termination', () => {
  const state = fragmentedState(MemoryMode.DYNAMIC_NO_COMPACTION);
  const freed = terminate(state, 'PA');
  assert.equal(freed.programs.find(p => p.id === 'PB').start, 7 * MIB);
  assert.equal(freed.lastCompaction, null);
  assertState(freed);
});
