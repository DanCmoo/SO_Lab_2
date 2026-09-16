import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, MIB, BlockKind, AllocationAlgorithm } from '../src/domain/constants.js';
import { createMemoryBlock, createProgram } from '../src/domain/models.js';
import { compactMemory, layoutSegments } from '../src/engine/compaction.js';
import { assertState } from '../src/domain/invariants.js';

test('Compaction: AC-11 preserves process order, shifts to low addresses, creates one tail hole', () => {
  const progA = createProgram({
    id: 'PA',
    name: 'ProgA',
    segments: [
      { id: 'PA-S1', name: 'Code', sizeBytes: 1 * MIB },
      { id: 'PA-S2', name: 'Data', sizeBytes: 1 * MIB }
    ]
  });
  const progB = createProgram({
    id: 'PB',
    name: 'ProgB',
    segments: [
      { id: 'PB-S1', name: 'Code', sizeBytes: 2 * MIB },
      { id: 'PB-S2', name: 'Data', sizeBytes: 1 * MIB }
    ]
  });

  // Layout with holes: OS (1M) | Hole1 (1M) | PA (2M) | Hole2 (3M) | PB (3M) | Hole3 (6M)
  // Total: 1 + 1 + 2 + 3 + 3 + 6 = 16 MiB
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
      { ...progA, status: 'allocated', start: 0x200000, end: 0x3FFFFF },
      { ...progB, status: 'allocated', start: 0x700000, end: 0x9FFFFF }
    ],
    partitions: [],
    blocks: [
      createMemoryBlock({ id: 'OS', kind: BlockKind.OS, start: 0, sizeBytes: 1 * MIB }),
      createMemoryBlock({ id: 'H1', kind: BlockKind.HOLE, start: 0x100000, sizeBytes: 1 * MIB }),
      createMemoryBlock({ id: 'PA', kind: BlockKind.PROCESS, start: 0x200000, sizeBytes: 2 * MIB, programId: 'PA' }),
      createMemoryBlock({ id: 'H2', kind: BlockKind.HOLE, start: 0x400000, sizeBytes: 3 * MIB }),
      createMemoryBlock({ id: 'PB', kind: BlockKind.PROCESS, start: 0x700000, sizeBytes: 3 * MIB, programId: 'PB' }),
      createMemoryBlock({ id: 'H3', kind: BlockKind.HOLE, start: 0xA00000, sizeBytes: 6 * MIB })
    ],
    history: [],
    nextSequence: 1,
    selectedId: null,
    lastTrace: null
  };

  assert.doesNotThrow(() => assertState(state));

  const result = compactMemory(state);
  const compacted = result.state;

  assert.doesNotThrow(() => assertState(compacted));

  // Verify PA shifted to start right after OS (0x100000)
  const compactedPA = compacted.programs.find(p => p.id === 'PA');
  assert.equal(compactedPA.start, 0x100000);
  assert.equal(compactedPA.end, 0x100000 + 2 * MIB - 1);

  // Verify PB shifted to start right after PA (0x300000)
  const compactedPB = compacted.programs.find(p => p.id === 'PB');
  assert.equal(compactedPB.start, 0x300000);
  assert.equal(compactedPB.end, 0x300000 + 3 * MIB - 1);

  // Exactly one hole at the end with size 15 - (2 + 3) = 10 MiB
  const holes = compacted.blocks.filter(b => b.kind === BlockKind.HOLE);
  assert.equal(holes.length, 1);
  assert.equal(holes[0].start, 0x600000);
  assert.equal(holes[0].sizeBytes, 10 * MIB);
  assert.equal(holes[0].end, 0xFFFFFF);

  // Bytes moved should be size(PA) + size(PB) = 2 + 3 = 5 MiB
  assert.equal(result.bytesMoved, 5 * MIB);

  // AC-12 Segment integrity after relocation
  const paSegments = layoutSegments(compactedPA);
  assert.equal(paSegments.length, 2);
  assert.equal(paSegments[0].start, 0x100000);
  assert.equal(paSegments[0].end, 0x100000 + 1 * MIB - 1);
  assert.equal(paSegments[1].start, 0x200000);
  assert.equal(paSegments[1].end, 0x200000 + 1 * MIB - 1);
  assert.equal(paSegments[1].end, compactedPA.end);
});
