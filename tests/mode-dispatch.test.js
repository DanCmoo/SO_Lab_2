import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, MIB } from '../src/domain/constants.js';
import { createInitialState } from '../src/domain/models.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { allocate, terminate } from '../src/engine/simulator.js';
import { deriveMetrics } from '../src/domain/metrics.js';
import { assertState } from '../src/domain/invariants.js';
import { extractCandidates } from '../src/engine/candidates.js';

test('C09: every implemented mode has its own allocation, release, metrics and invariants', () => {
  const models = { STATIC_EQUAL: 'static', STATIC_UNEQUAL: 'static', DYNAMIC_NO_COMPACTION: 'dynamic', DYNAMIC_COMPACTION: 'dynamic', SEGMENTATION: 'segmented', PAGING: 'paged' };
  assert.deepEqual(Object.keys(models).sort(), Object.values(MemoryMode).sort());
  for (const mode of Object.values(MemoryMode)) {
    const initial = createInitialState({ mode }, getDefaultPrograms());
    const result = allocate(initial, 'P1');
    assertState(result.state);
    assert.equal(deriveMetrics(result.state).allocatedProgramBytes, 2 * MIB);
    assert.equal(Boolean(result.partitionId), models[mode] === 'static');
    if (models[mode] === 'segmented') {
      assert.equal(result.state.programs[0].start, null);
      assert.equal(result.state.programs[0].segmentTable.length, 4);
      assert.equal(result.state.blocks.filter(b => b.kind === 'PROCESS').length, 0);
    }
    if (models[mode] === 'paged') {
      assert.equal(result.state.programs[0].start, null);
      assert.equal(result.state.programs[0].pageTable.length, 512);
      assert.equal(result.state.frames.filter(f => f.ownerKind === 'PAGE').length, 512);
    }
    const freed = terminate(result.state, 'P1');
    assertState(freed);
    assert.equal(deriveMetrics(freed).allocatedProgramBytes, 0);
  }
});

test('C09: unknown modes are rejected before using contiguous representations', () => {
  const initial = createInitialState({}, getDefaultPrograms());
  for (const mode of ['UNKNOWN_MODE', 'SEVENTH_MODE', '']) {
    const state = { ...initial, config: { ...initial.config, mode } };
    const before = structuredClone(state);
    for (const operation of [s => allocate(s, 'P1'), s => terminate(s, 'P1'), deriveMetrics, assertState, extractCandidates]) {
      assert.throws(() => operation(state), { code: 'INVALID_CONFIGURATION' });
      assert.deepEqual(state, before);
    }
    assert.throws(() => createInitialState({ mode }), { code: 'INVALID_CONFIGURATION' });
  }
});
