import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, KIB } from '../src/domain/constants.js';
import { createInitialState } from '../src/domain/models.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { createStore } from '../src/state/store.js';
import { reduceCommand } from '../src/state/commands.js';
import { exportScenario, importScenario } from '../src/state/persistence.js';

for (const mode of Object.values(MemoryMode)) {
  test(`Delete catalog program in ${mode}: active executions protected, undo and persistence`, () => {
    const store = createStore(createInitialState({ mode }, getDefaultPrograms()), reduceCommand);
    assert.equal(store.dispatch({ type: 'CREATE_PROGRAM', payload: {
      id: 'CUSTOM', name: 'Programa pequeño', segments: [{ name: 'Code', sizeBytes: 12 * KIB }]
    } }).ok, true);
    assert.equal(store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' }).ok, true);
    const resident = store.getState();
    assert.equal(store.dispatch({ type: 'DELETE_PROGRAM', programId: 'P1' }).code, 'PROGRAM_IN_USE');
    assert.equal(store.dispatch({ type: 'DELETE_PROGRAM', programId: 'P1~1' }).code, 'INVALID_PROGRAM');
    assert.equal(store.dispatch({ type: 'DELETE_PROGRAM', programId: 'missing' }).ok, false);
    assert.equal(store.getState(), resident);
    assert.equal(store.dispatch({ type: 'DELETE_PROGRAM', programId: 'CUSTOM' }).ok, true);
    assert.deepEqual(store.getState().blocks, resident.blocks);
    assert.equal(store.dispatch({ type: 'UNDO' }).ok, true);
    assert.deepEqual(store.getState().programs, resident.programs);
    assert.equal(store.dispatch({ type: 'TERMINATE_PROGRAM', programId: 'P1~1' }).ok, true);
    const beforeDelete = store.getState();
    assert.equal(store.dispatch({ type: 'DELETE_PROGRAM', programId: 'P1' }).ok, true);
    assert.equal(importScenario(exportScenario(store.getState())).programs.some(p => p.id === 'P1'), false);
    assert.equal(store.dispatch({ type: 'UNDO' }).ok, true);
    assert.deepEqual(store.getState().programs, beforeDelete.programs);
    assert.deepEqual(store.getState().removedDefaultProgramIds, []);
    assert.equal(store.dispatch({ type: 'DELETE_PROGRAM', programId: 'P1' }).ok, true);
    assert.equal(store.dispatch({ type: 'DELETE_PROGRAM', programId: 'CUSTOM' }).ok, true);
    for (const type of ['RESET', 'START_SIMULATION']) {
      assert.equal(store.dispatch({ type }).ok, true);
      const restored = importScenario(exportScenario(store.getState()));
      assert.equal(restored.programs.some(p => p.id === 'P1' || p.id === 'CUSTOM'), false);
    }
    assert.equal(store.dispatch({ type: 'RESTORE_DEFAULT_PROGRAMS' }).ok, true);
    assert.equal(importScenario(exportScenario(store.getState())).programs.some(p => p.id === 'P1'), true);
  });
}

test('Deleting every basic program keeps the catalog empty after reloading', () => {
  const store = createStore(createInitialState({}, getDefaultPrograms()), reduceCommand);
  for (const { id } of getDefaultPrograms()) assert.equal(store.dispatch({ type: 'DELETE_PROGRAM', programId: id }).ok, true);
  const restored = importScenario(exportScenario(store.getState()));
  assert.deepEqual(restored.programs, []);
  assert.deepEqual(restored.removedDefaultProgramIds, ['P1', 'P2', 'P3', 'P4', 'P5']);
});
