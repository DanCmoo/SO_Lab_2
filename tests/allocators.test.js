import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOCATOR_FIXTURE, TIE_BREAK_FIXTURE } from './fixtures.js';
import { selectCandidate } from '../src/engine/allocators.js';
import { AllocationAlgorithm } from '../src/domain/constants.js';

test('Allocators: AC-04 First Fit selects first address-ordered candidate', () => {
  const result = selectCandidate(
    ALLOCATOR_FIXTURE.holes,
    ALLOCATOR_FIXTURE.requestBytes,
    AllocationAlgorithm.FIRST_FIT
  );
  assert.equal(result.candidate?.id, 'H1');
  assert.equal(result.probes, 1);
  assert.equal(result.trace.reason, 'SUCCESS');
});

test('Allocators: AC-05 Best Fit selects smallest suitable candidate', () => {
  const result = selectCandidate(
    ALLOCATOR_FIXTURE.holes,
    ALLOCATOR_FIXTURE.requestBytes,
    AllocationAlgorithm.BEST_FIT
  );
  assert.equal(result.candidate?.id, 'H2'); // 3 MiB
  assert.equal(result.probes, 3);
  assert.equal(result.trace.reason, 'SUCCESS');
});

test('Allocators: AC-06 Worst Fit selects largest suitable candidate', () => {
  const result = selectCandidate(
    ALLOCATOR_FIXTURE.holes,
    ALLOCATOR_FIXTURE.requestBytes,
    AllocationAlgorithm.WORST_FIT
  );
  assert.equal(result.candidate?.id, 'H3'); // 5 MiB
  assert.equal(result.probes, 3);
  assert.equal(result.trace.reason, 'SUCCESS');
});

test('Allocators: AC-07 Deterministic tie-breaking on lowest physical start address', () => {
  // Best Fit tie-break
  const bestFitResult = selectCandidate(
    TIE_BREAK_FIXTURE.candidates,
    TIE_BREAK_FIXTURE.requestBytes,
    AllocationAlgorithm.BEST_FIT
  );
  // Candidates C1 (0x200000), C2 (0x600000), C3 (0x900000) all have 3 MiB capacity
  assert.equal(bestFitResult.candidate?.id, 'C1');

  // Worst Fit tie-break
  const worstFitResult = selectCandidate(
    TIE_BREAK_FIXTURE.candidates,
    TIE_BREAK_FIXTURE.requestBytes,
    AllocationAlgorithm.WORST_FIT
  );
  assert.equal(worstFitResult.candidate?.id, 'C1');
});
