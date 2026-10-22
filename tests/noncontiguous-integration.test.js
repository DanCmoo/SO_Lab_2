import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, MIB, KIB } from '../src/domain/constants.js';
import { createInitialState } from '../src/domain/models.js';
import { createStore } from '../src/state/store.js';
import { reduceCommand } from '../src/state/commands.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { assertState } from '../src/domain/invariants.js';
import { deriveMetrics } from '../src/domain/metrics.js';
import { exportScenario, importScenario, loadFromStorage, getStorageError } from '../src/state/persistence.js';
import { compareAlgorithms } from '../src/engine/comparison.js';
import { allocate } from '../src/engine/simulator.js';
import { program, segmentedHoles } from './noncontiguous-fixtures.js';

for (const mode of [MemoryMode.SEGMENTATION, MemoryMode.PAGING]) {
  test(`I01/C04: ${mode} round trip, private reservations, termination and undo`, () => {
    const store = createStore(createInitialState({ mode }, getDefaultPrograms()), reduceCommand);
    for (const id of ['P1', 'P1', 'P3']) assert.equal(store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: id }).ok, true);
    const before = structuredClone(store.getState());
    const restored = importScenario(exportScenario(before));
    assert.deepEqual(restored.frames, before.frames);
    for (const process of restored.programs) {
      assert.deepEqual(process.segmentTable, before.programs.find(p => p.id === process.id).segmentTable);
      assert.deepEqual(process.pageTable, before.programs.find(p => p.id === process.id).pageTable);
    }
    assert.equal(store.dispatch({ type: 'TERMINATE_PROGRAM', programId: 'P1~1' }).ok, true);
    assert.equal(store.getState().programs.some(p => p.id === 'P1~1'), false);
    assert.equal(store.dispatch({ type: 'UNDO' }).ok, true);
    assert.deepEqual(store.getState().blocks, before.blocks);
    assert.deepEqual(store.getState().programs, before.programs);
    assert.equal(store.dispatch({ type: 'RESET' }).ok, true);
    assert.ok(store.getState().programs.every(p => !p.sourceProgramId && p.pageTable.length === 0 && p.segmentTable.length === 0));
    assertState(store.getState());
  });
}

test('I02: reject duplicate IDs, cross-owner descriptors, page/frame corruption and invalid permissions', () => {
  for (const mode of [MemoryMode.SEGMENTATION, MemoryMode.PAGING]) {
    const valid = allocate(createInitialState({ mode }, getDefaultPrograms()), 'P1').state;
    const mutations = [s => s.programs.push(s.programs[0]), s => { s.programs[0].start = MIB; }];
    if (mode === MemoryMode.SEGMENTATION) mutations.push(
      s => { s.programs[0].segmentTable[0].permissions.write = true; },
      s => { s.programs[0].segmentTable[0].base++; },
      s => { s.blocks.find(b => b.kind === 'SEGMENT').programId = 'missing'; },
      s => { s.programs[0].segmentTable.pop(); }
    );
    else mutations.push(
      s => { s.programs[0].pageTable[1].frameNumber = s.programs[0].pageTable[0].frameNumber; },
      s => { s.programs[0].pageTable[0].usedBytes--; },
      s => { s.frames[256].programId = 'P2'; },
      s => { s.frames[0].ownerKind = 'FREE'; },
      s => { s.blocks.find(b => b.kind === 'PAGE').start++; }
    );
    for (const mutate of mutations) {
      const bad = structuredClone(valid); mutate(bad);
      assert.throws(() => assertState(bad));
      assert.throws(() => importScenario(exportScenario(bad)));
    }
  }
});

test('I03: comparison creates isolated instances and counts current failed traces; paging rejects adjustment', () => {
  const base = segmentedHoles([6 * KIB, KIB, 4 * KIB, 15 * MIB - 11 * KIB]);
  const state = { ...base, programs: [...base.programs, program('REQUEST', [4 * KIB, 6 * KIB])], lastTrace: { probes: 999 } };
  const before = structuredClone(state);
  const results = compareAlgorithms(state, ['REQUEST']);
  assert.equal(results[0].rejectedCount, 1);
  assert.equal(results[1].allocatedCount, 1);
  assert.equal(results[0].totalProbes, 3);
  assert.deepEqual(state, before);
  const failedStore = createStore(state, reduceCommand);
  const rejected = failedStore.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'REQUEST' });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.details.trace.probes, 3);
  assert.equal(failedStore.getState(), state);
  assert.equal(failedStore.canUndo(), false);
  const paged = createInitialState({ mode: MemoryMode.PAGING }, getDefaultPrograms());
  assert.throws(() => compareAlgorithms(paged), { code: 'COMPARISON_NOT_ALLOWED' });
  assert.equal(reduceCommand(paged, { type: 'SET_ALGORITHM', algorithm: 'BEST_FIT' }).ok, false);
});

test('I04: deterministic command sequences conserve RAM, allocation ownership and failed-state atomicity', () => {
  for (const mode of [MemoryMode.SEGMENTATION, MemoryMode.PAGING]) {
    const store = createStore(createInitialState({ mode }, getDefaultPrograms()), reduceCommand);
    let seed = 17;
    for (let i = 0; i < 45; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const before = store.getState(), residents = before.programs.filter(p => p.sourceProgramId);
      const command = seed % 5 === 0 ? { type: 'UNDO' } : seed % 3 === 0 && residents.length
        ? { type: 'TERMINATE_PROGRAM', programId: residents[seed % residents.length].id }
        : { type: 'ALLOCATE_PROGRAM', programId: `P${seed % 5 + 1}` };
      const result = store.dispatch(command);
      if (!result.ok) assert.equal(store.getState(), before);
      assertState(store.getState());
      const metrics = deriveMetrics(store.getState());
      assert.equal(metrics.osBytes + metrics.allocatedPhysicalBytes + metrics.freeBytes, 16 * MIB);
      assert.equal(metrics.allocatedPhysicalBytes, metrics.allocatedProgramBytes + metrics.internalFragmentationBytes);
    }
  }
});

test('version 2 migrates fields without relocating; incompatible storage remains untouched', () => {
  const old = structuredClone(allocate(createInitialState({}, getDefaultPrograms()), 'P1').state);
  old.schemaVersion = 2; delete old.frames;
  for (const p of old.programs) { delete p.segmentTable; delete p.pageTable; for (const s of p.segments) delete s.permissions; }
  const restored = importScenario(JSON.stringify({ schemaVersion: 2, activeState: old }));
  assert.deepEqual(restored.blocks, old.blocks);
  assert.equal(restored.programs[0].start, old.programs[0].start);
  let writes = 0;
  globalThis.window = { localStorage: { getItem: () => '{"schemaVersion":99}', setItem: () => { writes++; } } };
  try { assert.equal(loadFromStorage(), null); assert.ok(getStorageError()); assert.equal(writes, 0); }
  finally { delete globalThis.window; }
});
