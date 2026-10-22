import test from 'node:test';
import assert from 'node:assert/strict';
import { MIB, MemoryMode, STATE_SCHEMA_VERSION } from '../src/domain/constants.js';
import { createInitialState } from '../src/domain/models.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { allocate } from '../src/engine/simulator.js';
import { importScenario, exportScenario, loadFromStorage, saveToStorage } from '../src/state/persistence.js';
import { assertState } from '../src/domain/invariants.js';
import { reduceCommand } from '../src/state/commands.js';
import { createStore } from '../src/state/store.js';

test('Persistence: restores missing basic programs without replacing custom programs or resident executions', () => {
  for (const mode of Object.values(MemoryMode)) {
    const store = createStore(createInitialState({ mode }, getDefaultPrograms().slice(0, 1)), reduceCommand);
    assert.equal(store.dispatch({ type: 'CREATE_PROGRAM', payload: {
      id: 'CUSTOM', name: 'Personalizado', segments: [{ name: 'Code', sizeBytes: MIB }]
    } }).ok, true);
    assert.equal(store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' }).ok, true);
    const before = structuredClone(store.getState());
    let raw = JSON.stringify(before);
    globalThis.window = { localStorage: { getItem: () => raw, setItem: (_key, value) => { raw = value; } } };
    try {
      for (const restored of [loadFromStorage(), importScenario(exportScenario(before))]) {
        for (const basic of getDefaultPrograms()) assert.equal(restored.programs.filter(p => p.id === basic.id).length, 1);
        for (const existing of before.programs) assert.deepEqual(restored.programs.find(p => p.id === existing.id), {
          ...existing, ...(!existing.sourceProgramId ? { nextInstanceNumber: existing.nextInstanceNumber || 1 } : {})
        });
        assert.deepEqual(restored.blocks, before.blocks);
        assert.deepEqual(restored.frames, before.frames);
        assertState(restored);
        assert.equal(saveToStorage(restored), true);
        assert.deepEqual(loadFromStorage().programs, restored.programs);
      }
    } finally { delete globalThis.window; }
  }
});

test('Persistence: an empty saved catalog recovers the five basic programs', () => {
  const restored = importScenario(exportScenario(createInitialState({}, [])));
  assert.deepEqual(restored.programs.map(p => p.id), ['P1', 'P2', 'P3', 'P4', 'P5']);
  assert.ok(restored.programs.every(p => p.status === 'ready'));
});

test('Persistence: migrates count-based sessions and runtime segments without changing addresses', () => {
  const state = allocate(createInitialState({}, getDefaultPrograms()), 'P1').state;
  const legacy = structuredClone(state);
  legacy.schemaVersion = 1;
  delete legacy.config.equalPartitionSizeBytes;
  for (const program of legacy.programs) {
    program.segments.push(
      { id: `${program.id}-HEAP`, name: 'Heap', sizeBytes: program.runtimeMemory.heapBytes },
      { id: `${program.id}-STACK`, name: 'Stack', sizeBytes: program.runtimeMemory.stackBytes }
    );
    delete program.runtimeMemory;
    delete program.runtimeRegions;
    delete program.imageSizeBytes;
  }
  const restored = importScenario(JSON.stringify({ schemaVersion: 1, activeState: legacy }));
  assert.equal(restored.schemaVersion, STATE_SCHEMA_VERSION);
  assert.equal(restored.config.equalPartitionSizeBytes, 3 * MIB);
  assert.deepEqual(restored.blocks, state.blocks);
  assert.deepEqual(restored.partitions, state.partitions);
  assert.equal(restored.programs[0].start, state.programs[0].start);
  assert.equal(restored.programs[0].sizeBytes, state.programs[0].sizeBytes);
  assert.equal(restored.programs[0].runtimeRegions.length, 2);
  assert.equal(restored.programs[1].runtimeRegions.length, 0);
  assert.deepEqual(restored.programs[0].segments.map(s => s.name), ['Code', 'Data']);
  assertState(restored);
});

test('Persistence: unequal partition order survives round trip', () => {
  const sizes = [4, 2, 1, 3, 5].map(size => size * MIB);
  const state = createInitialState({ mode: MemoryMode.STATIC_UNEQUAL, unequalPartitionSizes: sizes }, getDefaultPrograms());
  const restored = importScenario(exportScenario(state));
  assert.deepEqual(restored.config.unequalPartitionSizes, [5, 4, 3, 2, 1].map(size => size * MIB));
  assert.deepEqual(restored.blocks, state.blocks);
});

test('Persistence: resuming an older unequal layout preserves addresses; reset rebuilds descending', () => {
  const sizes = [4, 2, 1, 3, 5].map(size => size * MIB);
  const initial = createInitialState({ mode: MemoryMode.STATIC_UNEQUAL }, getDefaultPrograms());
  let cursor = initial.config.osBytes;
  const partitions = initial.partitions.map((part, index) => {
    const result = { ...part, start: cursor, sizeBytes: sizes[index], end: cursor + sizes[index] - 1 };
    cursor = result.end + 1;
    return result;
  });
  const legacy = {
    ...initial, config: { ...initial.config, unequalPartitionSizes: sizes }, partitions,
    blocks: [initial.blocks[0], ...partitions.map((part, index) => ({ ...initial.blocks[index + 1], start: part.start, end: part.end, sizeBytes: part.sizeBytes }))]
  };
  assertState(legacy);
  const resident = allocate(legacy, 'P1').state;
  const restored = importScenario(exportScenario(resident));
  assert.deepEqual(restored.config.unequalPartitionSizes, sizes);
  assert.deepEqual(restored.partitions, resident.partitions);
  assert.deepEqual(restored.blocks, resident.blocks);
  assert.equal(restored.programs[0].start, resident.programs[0].start);
  for (const type of ['RESET', 'START_SIMULATION']) {
    const result = reduceCommand(restored, { type });
    assert.equal(result.ok, true);
    assert.deepEqual(result.state.partitions.map(p => p.sizeBytes), [5, 4, 3, 2, 1].map(size => size * MIB));
    assertState(result.state);
  }
});

test('Persistence: rejects unknown schemas and corrupt memory coverage', () => {
  assert.throws(() => importScenario('{invalid'), { code: 'UNSUPPORTED_SCHEMA' });
  assert.throws(() => importScenario('{"schemaVersion":99}'), { code: 'UNSUPPORTED_SCHEMA' });
  const state = structuredClone(createInitialState({}, getDefaultPrograms()));
  state.blocks[1].sizeBytes -= 1;
  assert.throws(() => importScenario(exportScenario(state)), { code: 'STATE_INVARIANT_FAILED' });
});

test('Persistence: removed execution numbers stay consumed after reloading', () => {
  const store = createStore(createInitialState({}, getDefaultPrograms()), reduceCommand);
  const first = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' });
  assert.equal(first.details.programId, 'P1~1');
  assert.equal(store.dispatch({ type: 'TERMINATE_PROGRAM', programId: first.details.programId }).ok, true);
  const restored = createStore(importScenario(exportScenario(store.getState())), reduceCommand);
  assert.equal(restored.getState().programs.some(p => p.sourceProgramId), false);
  assert.equal(restored.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' }).details.programId, 'P1~2');
});

test('Persistence: old terminated instances disappear while legacy residents keep their addresses', () => {
  const state = allocate(createInitialState({}, getDefaultPrograms()), 'P1').state;
  const source = state.programs[0];
  const legacy = {
    ...state,
    programs: [...state.programs, {
      ...source,
      id: 'P1~3', sourceProgramId: 'P1', instanceNumber: 3, name: 'Compilador #3',
      status: 'terminated', start: null, end: null, containerId: null, runtimeRegions: []
    }]
  };
  const restored = importScenario(exportScenario(legacy));
  assert.equal(restored.programs.some(p => p.id === 'P1~3'), false);
  assert.deepEqual(restored.blocks, state.blocks);
  const store = createStore(restored, reduceCommand);
  assert.equal(store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' }).details.programId, 'P1~4');
  assert.equal(store.getState().programs.find(p => p.id === 'P1').start, source.start);
});

test('Persistence: process labels can extend a maximum-length program name', () => {
  const store = createStore(createInitialState({}, []), reduceCommand);
  assert.equal(store.dispatch({ type: 'CREATE_PROGRAM', payload: {
    id: 'P', name: 'A'.repeat(60), segments: [{ name: 'Code', sizeBytes: MIB }]
  } }).ok, true);
  assert.equal(store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P' }).ok, true);
  const restored = importScenario(exportScenario(store.getState()));
  assert.equal(restored.programs.find(p => p.id === 'P~1').name, `${'A'.repeat(60)} #1`);
  assertState(restored);
});
