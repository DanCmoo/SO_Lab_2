import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode } from '../src/domain/constants.js';
import { createInitialState } from '../src/domain/models.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { reduceCommand } from '../src/state/commands.js';
import { createStore } from '../src/state/store.js';
import { exportScenario, importScenario } from '../src/state/persistence.js';

test('Store & Commands: allocates, records history, and executes undo', () => {
  const programs = getDefaultPrograms();
  const initialState = createInitialState({ mode: MemoryMode.STATIC_EQUAL }, programs);
  const store = createStore(initialState, reduceCommand);

  // Initial checks
  assert.equal(store.canUndo(), false);
  assert.equal(store.getState().programs.find(p => p.id === 'P1').status, 'ready');

  // Allocate P1
  const allocRes = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' });
  assert.equal(allocRes.ok, true);
  assert.equal(store.canUndo(), true);
  assert.equal(store.getState().programs.find(p => p.id === 'P1').status, 'allocated');
  assert.equal(store.getState().programs.find(p => p.id === 'P1').start, 0x100000);

  // Undo allocation
  const undoRes = store.dispatch({ type: 'UNDO' });
  assert.equal(undoRes.ok, true);
  assert.equal(store.getState().programs.find(p => p.id === 'P1').status, 'ready');
  assert.equal(store.getState().programs.find(p => p.id === 'P1').start, null);
  assert.equal(store.getState().partitions.find(p => p.id === 'PART-1').programId, null);
});

test('Store & Commands: failed commands leave state unchanged and do not corrupt undo', () => {
  const programs = getDefaultPrograms();
  const initialState = createInitialState({ mode: MemoryMode.STATIC_EQUAL }, programs);
  const store = createStore(initialState, reduceCommand);

  // Attempt to allocate non-existent program
  const failRes = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'NON_EXISTENT' });
  assert.equal(failRes.ok, false);
  assert.equal(store.canUndo(), false);
});

test('Persistence: Scenario export and import integrity', () => {
  const programs = getDefaultPrograms();
  const state = createInitialState({ mode: MemoryMode.STATIC_UNEQUAL }, programs);

  const exportedJson = exportScenario(state);
  const reimported = importScenario(exportedJson);

  assert.equal(reimported.config.mode, MemoryMode.STATIC_UNEQUAL);
  assert.equal(reimported.blocks.length, state.blocks.length);
  assert.equal(reimported.programs.length, state.programs.length);
});
