import { AllocationAlgorithm } from '../domain/constants.js';
import { allocate } from './simulator.js';
import { deriveMetrics } from '../domain/metrics.js';

/**
 * Runs an isolated comparison across First Fit, Best Fit, and Worst Fit algorithms
 * on independent clones of the base state with the given program queue order.
 * Never mutates the base state.
 *
 * @param {import('../domain/constants.js').SimulationState} baseState
 * @param {string[]} [programIds] Optional specific program IDs to attempt in order
 * @returns {Array<{
 *   algorithm: string,
 *   allocatedCount: number,
 *   rejectedCount: number,
 *   internalFragmentationBytes: number,
 *   freeBytes: number,
 *   largestFreeBlockBytes: number,
 *   freeBlockCount: number,
 *   totalProbes: number,
 *   finalBlocks: import('../domain/constants.js').MemoryBlock[]
 * }>}
 */
export function compareAlgorithms(baseState, programIds) {
  const algorithms = [
    AllocationAlgorithm.FIRST_FIT,
    AllocationAlgorithm.BEST_FIT,
    AllocationAlgorithm.WORST_FIT
  ];

  // If no programIds provided, default to all ready programs in arrival order
  const targetIds =
    programIds ||
    baseState.programs
      .filter(p => p.status === 'ready')
      .sort((a, b) => a.arrivalOrder - b.arrivalOrder)
      .map(p => p.id);

  const results = [];

  for (const algo of algorithms) {
    // Deep clone the base state
    let clone = JSON.parse(JSON.stringify(baseState));
    clone.config.algorithm = algo;

    let allocatedCount = 0;
    let rejectedCount = 0;
    let totalProbes = 0;

    for (const progId of targetIds) {
      try {
        const result = allocate(clone, progId, algo);
        clone = result.state;
        allocatedCount++;
        totalProbes += result.trace?.probes || 1;
      } catch (_err) {
        rejectedCount++;
        if (clone.lastTrace?.probes) {
          totalProbes += clone.lastTrace.probes;
        }
      }
    }

    const metrics = deriveMetrics(clone);

    results.push({
      algorithm: algo,
      allocatedCount,
      rejectedCount,
      internalFragmentationBytes: metrics.internalFragmentationBytes,
      freeBytes: metrics.freeBytes,
      largestFreeBlockBytes: metrics.largestFreeBlockBytes,
      freeBlockCount: metrics.freeBlockCount,
      totalProbes,
      finalBlocks: clone.blocks
    });
  }

  return results;
}
