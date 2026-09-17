import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryMode, MIB, AllocationAlgorithm } from '../src/domain/constants.js';
import { createInitialState } from '../src/domain/models.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { allocate } from '../src/engine/simulator.js';
import { deriveMetrics } from '../src/domain/metrics.js';

test('Metrics: initial state metrics for Static Equal', () => {
  const state = createInitialState({ mode: MemoryMode.STATIC_EQUAL });
  const metrics = deriveMetrics(state);

  assert.equal(metrics.totalMemoryBytes, 16 * MIB);
  assert.equal(metrics.osBytes, 1 * MIB);
  assert.equal(metrics.userBytes, 15 * MIB);
  assert.equal(metrics.allocatedProgramBytes, 0);
  assert.equal(metrics.freeBytes, 15 * MIB);
  assert.equal(metrics.internalFragmentationBytes, 0);
  assert.equal(metrics.residentProgramCount, 0);
  assert.equal(metrics.freeBlockCount, 5);
  assert.equal(metrics.largestFreeBlockBytes, 3 * MIB);
  assert.equal(metrics.utilizationPercent, 0);
});

test('Metrics: static allocation updates resident bytes, internal fragmentation, and utilization', () => {
  const programs = getDefaultPrograms(); // P1 is 2 MiB
  let state = createInitialState({ mode: MemoryMode.STATIC_EQUAL }, programs);

  const result = allocate(state, 'P1');
  state = result.state;

  const metrics = deriveMetrics(state);
  assert.equal(metrics.residentProgramCount, 1);
  assert.equal(metrics.allocatedProgramBytes, 2 * MIB);
  assert.equal(metrics.internalFragmentationBytes, 1 * MIB);
  assert.equal(metrics.freeBytes, 12 * MIB); // 4 remaining 3 MiB partitions
  assert.equal(metrics.freeBlockCount, 4);
  // Utilización = 2 / 15 * 100 = 13,33 %.
  assert.equal(metrics.utilizationPercent, 13.33);
});
