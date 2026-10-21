import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, MIB } from '../src/domain/constants.js';
import { createInitialState, createProgram } from '../src/domain/models.js';
import { createStore } from '../src/state/store.js';
import { reduceCommand } from '../src/state/commands.js';

function makeStore(mode, sizeBytes) {
  const program = createProgram({
    id: 'P1',
    name: 'Editor',
    segments: [{ id: 'code', name: 'Código', sizeBytes }]
  });
  const store = createStore(createInitialState({ mode }, [program]), reduceCommand);
  assert.equal(store.dispatch({ type: 'START_SIMULATION' }).ok, true);
  return store;
}

for (const mode of Object.values(MemoryMode)) {
  test(`catalog launches independent instances and removes terminated executions in ${mode}`, () => {
    const store = makeStore(mode, 2 * MIB);
    const first = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' });
    const second = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(first.details.programId, 'P1~1');
    assert.equal(second.details.programId, 'P1~2');
    assert.equal(store.getState().programs.find(p => p.id === 'P1').status, 'ready');
    assert.equal(store.getState().programs.find(p => p.id === 'P1').start, null);
    assert.equal(store.getState().programs.find(p => p.id === second.details.programId).name, 'Editor #2');
    assert.equal(store.dispatch({ type: 'TERMINATE_PROGRAM', programId: second.details.programId }).ok, true);
    assert.equal(store.getState().programs.some(p => p.id === second.details.programId), false);
    assert.equal(store.getState().programs.find(p => p.id === first.details.programId).status, 'allocated');
    const third = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' });
    assert.equal(third.details.programId, 'P1~3');
    assert.equal(store.dispatch({ type: 'TERMINATE_PROGRAM', programId: first.details.programId }).ok, true);
    assert.equal(store.dispatch({ type: 'TERMINATE_PROGRAM', programId: third.details.programId }).ok, true);
    assert.deepEqual(store.getState().programs.map(p => p.id), ['P1']);
    assert.equal(store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' }).details.programId, 'P1~4');
    assert.equal(store.dispatch({ type: 'RESET' }).ok, true);
    assert.deepEqual(store.getState().programs.map(p => p.id), ['P1']);
  });
}

test('dynamic allocation creates another instance only when memory can hold it', () => {
  const store = makeStore(MemoryMode.DYNAMIC_NO_COMPACTION, 8 * MIB);
  assert.equal(store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' }).ok, true);
  const before = store.getState();
  const failed = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'INSUFFICIENT_TOTAL_MEMORY');
  assert.equal(store.getState(), before);
  assert.equal(store.getState().programs.length, 2);

  assert.equal(store.dispatch({ type: 'TERMINATE_PROGRAM', programId: 'P1~1' }).ok, true);
  const retried = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' });
  assert.equal(retried.ok, true);
  assert.equal(retried.details.programId, 'P1~2');
  assert.equal(store.getState().programs.find(p => p.id === 'P1').status, 'ready');
  assert.equal(store.getState().programs.find(p => p.id === 'P1~2').status, 'allocated');
});

test('instances cannot be used as launch templates and undo restores a removed execution', () => {
  const store = makeStore(MemoryMode.STATIC_EQUAL, MIB);
  const launch = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: 'P1' });
  const before = store.getState();
  const rejected = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: launch.details.programId });
  assert.equal(rejected.ok, false);
  assert.equal(store.getState(), before);
  assert.equal(store.dispatch({ type: 'TERMINATE_PROGRAM', programId: launch.details.programId }).ok, true);
  assert.equal(store.getState().programs.length, 1);
  assert.equal(store.dispatch({ type: 'UNDO' }).ok, true);
  assert.deepEqual(store.getState().programs, before.programs);
  assert.deepEqual(store.getState().partitions, before.partitions);
});
