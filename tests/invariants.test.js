import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, TOTAL_MEMORY_BYTES, MIB } from '../src/domain/constants.js';
import { createInitialState } from '../src/domain/models.js';
import { assertState } from '../src/domain/invariants.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { ErrorCode } from '../src/domain/errors.js';

test('Invariants: valid initial states for all 4 memory modes', () => {
  const programs = getDefaultPrograms();

  const modes = [
    MemoryMode.STATIC_EQUAL,
    MemoryMode.STATIC_UNEQUAL,
    MemoryMode.DYNAMIC_NO_COMPACTION,
    MemoryMode.DYNAMIC_COMPACTION
  ];

  for (const mode of modes) {
    const state = createInitialState({ mode }, programs);
    assert.doesNotThrow(() => assertState(state), `Failed for mode ${mode}`);
    assert.equal(state.blocks[0].start, 0);
    assert.equal(state.blocks[state.blocks.length - 1].end, 0xFFFFFF);
    const totalBytes = state.blocks.reduce((sum, b) => sum + b.sizeBytes, 0);
    assert.equal(totalBytes, TOTAL_MEMORY_BYTES);
  }
});

test('Invariants: fails when total memory sum is corrupted', () => {
  const state = createInitialState({ mode: MemoryMode.DYNAMIC_NO_COMPACTION });
  const corruptedBlocks = [
    state.blocks[0],
    {
      ...state.blocks[1],
      sizeBytes: state.blocks[1].sizeBytes - 100,
      end: state.blocks[1].end - 100
    }
  ];

  const corruptedState = {
    ...state,
    blocks: corruptedBlocks
  };

  assert.throws(() => assertState(corruptedState), { code: ErrorCode.STATE_INVARIANT_FAILED });
});

test('Invariants: fails when blocks have address discontinuity or overlap', () => {
  const state = createInitialState({ mode: MemoryMode.DYNAMIC_NO_COMPACTION });
  const overlappingBlocks = [
    state.blocks[0], // [0, 0x0FFFFF]
    {
      ...state.blocks[1],
      start: 0x0FFFFE // Overlaps by 1 byte
    }
  ];

  const corruptedState = {
    ...state,
    blocks: overlappingBlocks
  };

  assert.throws(() => assertState(corruptedState), { code: ErrorCode.STATE_INVARIANT_FAILED });
});

test('Invariants: fails when two adjacent holes exist without coalescing', () => {
  const state = createInitialState({ mode: MemoryMode.DYNAMIC_NO_COMPACTION });
  const twoHoles = [
    state.blocks[0],
    {
      id: 'HOLE-1',
      kind: 'HOLE',
      start: 0x100000,
      sizeBytes: 2 * MIB,
      end: 0x2FFFFF,
      programId: null
    },
    {
      id: 'HOLE-2',
      kind: 'HOLE',
      start: 0x300000,
      sizeBytes: 13 * MIB,
      end: 0xFFFFFF,
      programId: null
    }
  ];

  const corruptedState = {
    ...state,
    blocks: twoHoles
  };

  assert.throws(() => assertState(corruptedState), { code: ErrorCode.STATE_INVARIANT_FAILED });
});
