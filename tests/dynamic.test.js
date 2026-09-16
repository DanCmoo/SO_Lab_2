import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, MIB, BlockKind, AllocationAlgorithm } from '../src/domain/constants.js';
import { createInitialState, createMemoryBlock, createProgram } from '../src/domain/models.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { allocateDynamic, terminateDynamic, coalesce } from '../src/engine/dynamic.js';
import { assertState } from '../src/domain/invariants.js';
import { ErrorCode } from '../src/domain/errors.js';

test('Dynamic: AC-08 Hole splitting creates process block and residual hole', () => {
  // Setup: Initial state with 15 MiB hole, allocate P1 (2 MiB)
  const programs = getDefaultPrograms();
  const state = createInitialState({ mode: MemoryMode.DYNAMIC_NO_COMPACTION }, programs);

  const result = allocateDynamic(state, 'P1');
  assert.doesNotThrow(() => assertState(result.state));

  const p1Block = result.state.blocks.find(b => b.programId === 'P1');
  assert.equal(p1Block.sizeBytes, 2 * MIB);
  assert.equal(p1Block.start, 0x100000);
  assert.equal(p1Block.end, 0x100000 + 2 * MIB - 1);

  const residualHole = result.state.blocks.find(b => b.kind === BlockKind.HOLE);
  assert.equal(residualHole.start, p1Block.end + 1);
  assert.equal(residualHole.sizeBytes, 13 * MIB);
});

test('Dynamic: AC-09 Hole merging coalesces bilateral free holes on termination', () => {
  // Allocate P1 (2 MiB), P2 (3 MiB), P3 (1.25 MiB)
  const programs = getDefaultPrograms();
  let state = createInitialState({ mode: MemoryMode.DYNAMIC_NO_COMPACTION }, programs);

  state = allocateDynamic(state, 'P1').state;
  state = allocateDynamic(state, 'P2').state;
  state = allocateDynamic(state, 'P3').state;

  // Terminate P1 -> converts P1 to 2 MiB hole at [0x100000, 0x2FFFFF]
  state = terminateDynamic(state, 'P1');
  // P2 is at [0x300000, 0x5FFFFF]
  // Terminate P3 -> converts P3 to hole, which immediately coalesces with the remaining tail hole
  state = terminateDynamic(state, 'P3');

  // Now terminate P2 (the process between two holes) -> all three adjacent holes should merge into 1 hole
  state = terminateDynamic(state, 'P2');
  assert.doesNotThrow(() => assertState(state));

  // Blocks should be: OS block + 1 single hole of 15 MiB
  assert.equal(state.blocks.length, 2);
  assert.equal(state.blocks[0].kind, BlockKind.OS);
  assert.equal(state.blocks[1].kind, BlockKind.HOLE);
  assert.equal(state.blocks[1].sizeBytes, 15 * MIB);
});

test('Dynamic: AC-10 External fragmentation identified when total free is sufficient but largest hole is too small', () => {
  // Setup: 2 non-adjacent holes of 2 MiB each (total free = 4 MiB), request = 3 MiB
  const progA = createProgram({
    id: 'PA',
    name: 'ProgA',
    segments: [{ id: 'PA-1', name: 'Code', sizeBytes: 2 * MIB }]
  });
  const progB = createProgram({
    id: 'PB',
    name: 'ProgB',
    segments: [{ id: 'PB-1', name: 'Code', sizeBytes: 9 * MIB }]
  });
  const progReq = createProgram({
    id: 'PREQ',
    name: 'ProgReq',
    segments: [{ id: 'PREQ-1', name: 'Code', sizeBytes: 3 * MIB }]
  });

  const state = {
    schemaVersion: 1,
    phase: 'RUNNING',
    config: {
      mode: MemoryMode.DYNAMIC_COMPACTION,
      algorithm: AllocationAlgorithm.FIRST_FIT,
      totalBytes: 16 * MIB,
      osBytes: 1 * MIB,
      equalPartitionCount: null,
      unequalPartitionSizes: []
    },
    programs: [
      { ...progA, status: 'allocated', start: 0x300000, end: 0x4FFFFF },
      { ...progB, status: 'allocated', start: 0x700000, end: 0xFFFFFF },
      progReq
    ],
    partitions: [],
    blocks: [
      createMemoryBlock({ id: 'OS', kind: BlockKind.OS, start: 0, sizeBytes: 1 * MIB }),
      createMemoryBlock({ id: 'H1', kind: BlockKind.HOLE, start: 0x100000, sizeBytes: 2 * MIB }),
      createMemoryBlock({ id: 'PA', kind: BlockKind.PROCESS, start: 0x300000, sizeBytes: 2 * MIB, programId: 'PA' }),
      createMemoryBlock({ id: 'H2', kind: BlockKind.HOLE, start: 0x500000, sizeBytes: 2 * MIB }),
      createMemoryBlock({ id: 'PB', kind: BlockKind.PROCESS, start: 0x700000, sizeBytes: 9 * MIB, programId: 'PB' })
    ],
    history: [],
    nextSequence: 1,
    selectedId: null,
    lastTrace: null
  };

  assert.doesNotThrow(() => assertState(state));

  // Attempt to allocate 3 MiB ProgReq: total free is 2 + 2 = 4 MiB, but largest hole is 2 MiB
  assert.throws(() => allocateDynamic(state, 'PREQ'), {
    code: ErrorCode.EXTERNAL_FRAGMENTATION
  });
});
