import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, MIB, KIB, BlockKind } from '../src/domain/constants.js';
import { createProgram, createInitialState } from '../src/domain/models.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { allocate, terminate } from '../src/engine/simulator.js';
import { layoutSegments } from '../src/engine/compaction.js';
import { assertState } from '../src/domain/invariants.js';
import { deriveMetrics } from '../src/domain/metrics.js';
import { reduceCommand } from '../src/state/commands.js';
import { createStore } from '../src/state/store.js';
import { exportScenario, importScenario } from '../src/state/persistence.js';

for (const mode of [MemoryMode.STATIC_EQUAL, MemoryMode.STATIC_UNEQUAL, MemoryMode.DYNAMIC_NO_COMPACTION, MemoryMode.DYNAMIC_COMPACTION]) {
  test(`Runtime memory: OS reserves and frees heap/stack per process in ${mode}`, () => {
    const initial = createInitialState({ mode }, getDefaultPrograms());
    const ready = initial.programs[0];
    assert.deepEqual(ready.segments.map(s => s.name), ['Code', 'Data']);
    assert.equal(ready.imageSizeBytes, 1280 * KIB);
    assert.equal(ready.sizeBytes, 2 * MIB);
    assert.deepEqual(ready.runtimeRegions, []);
    const allocated = allocate(initial, ready.id).state;
    const process = allocated.programs[0];
    assert.equal(process.runtimeRegions.length, 2);
    assert.ok(process.runtimeRegions.every(r => r.allocatedBy === 'OS' && r.programId === process.id));
    const regions = layoutSegments(process);
    assert.deepEqual(regions.map(s => s.name), ['Code', 'Data', 'Heap', 'Stack']);
    assert.equal(regions[2].start, process.start + process.imageSizeBytes);
    assert.equal(regions[3].end, process.end);
    assert.equal(deriveMetrics(allocated).allocatedProgramBytes, 2 * MIB);
    assert.equal(allocated.blocks.find(b => b.kind === BlockKind.OS).sizeBytes, MIB);
    assertState(allocated);
    const freed = terminate(allocated, process.id);
    assert.deepEqual(freed.programs[0].runtimeRegions, []);
    assert.equal(deriveMetrics(freed).allocatedProgramBytes, 0);
    assert.deepEqual(layoutSegments(freed.programs[0]), []);
    assertState(freed);
    assertState(importScenario(exportScenario(allocated)));
  });
}

test('Runtime memory: each simultaneous or restarted instance receives its own reservations', () => {
  const store = createStore(createInitialState({ mode: MemoryMode.DYNAMIC_COMPACTION }, getDefaultPrograms()), reduceCommand);
  assert.equal(store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' }).ok, true);
  assert.equal(store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' }).ok, true);
  const first = store.getState().programs.find(p => p.id === 'P1~1');
  const second = store.getState().programs.find(p => p.id === 'P1~2');
  assert.notEqual(first.runtimeRegions[0].id, second.runtimeRegions[0].id);
  assert.equal(store.dispatch({ type: 'TERMINATE_PROGRAM', programId: first.id }).ok, true);
  const moved = store.getState().programs.find(p => p.id === 'P1~2');
  assert.equal(layoutSegments(moved).at(-1).end, moved.end);
  assert.equal(moved.start, MIB);
  assert.equal(store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' }).ok, true);
  assertState(store.getState());
  assert.equal(store.dispatch({ type: 'RESET' }).ok, true);
  assert.ok(store.getState().programs.every(p => p.runtimeRegions.length === 0));
});

test('Runtime memory: reservations participate in capacity checks and failed loads are atomic', () => {
  const store = createStore(createInitialState({}, []), reduceCommand);
  assert.equal(store.dispatch({ type: 'CREATE_PROGRAM', payload: {
    id: 'P', name: 'Large runtime', segments: [{ name: 'Code', sizeBytes: MIB }],
    runtimeMemory: { heapBytes: 3 * MIB, stackBytes: MIB }
  } }).ok, true);
  const before = structuredClone(store.getState());
  const result = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P' });
  assert.equal(result.code, 'PROGRAM_TOO_LARGE');
  assert.deepEqual(store.getState(), before);
});

test('Runtime memory: validates requests and rejects heap/stack as image segments', () => {
  const draft = { id: 'P', name: 'Program', segments: [{ name: 'Code', sizeBytes: MIB }] };
  for (const bytes of [-1, 0.5, NaN, Infinity]) {
    assert.throws(() => createProgram({ ...draft, runtimeMemory: { heapBytes: bytes } }), { code: 'INVALID_PROGRAM' });
  }
  assert.throws(() => createProgram({ ...draft, segments: [{ name: ' Heap ', sizeBytes: MIB }] }), { code: 'INVALID_PROGRAM' });
  const allocated = allocate(createInitialState({}, getDefaultPrograms()), 'P1').state;
  const corrupted = structuredClone(allocated);
  corrupted.programs[0].runtimeRegions[0].programId = 'other';
  assert.throws(() => assertState(corrupted), { code: 'STATE_INVARIANT_FAILED' });
});
