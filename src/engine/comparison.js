import { AllocationAlgorithm } from '../domain/constants.js';
import { allocate } from './simulator.js';
import { deriveMetrics } from '../domain/metrics.js';

/**
 * Ejecuta una comparación aislada entre primer, mejor y peor ajuste
 * sobre copias independientes del estado base y con el orden indicado de la cola.
 * Nunca modifica el estado base.
 *
 * @param {import('../domain/constants.js').SimulationState} baseState
 * @param {string[]} [programIds] IDs opcionales de programas que se intentarán en orden
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

  // Si no se proporcionan IDs, usa todos los programas listos en orden de llegada.
  const targetIds =
    programIds ||
    baseState.programs
      .filter(p => p.status === 'ready')
      .sort((a, b) => a.arrivalOrder - b.arrivalOrder)
      .map(p => p.id);

  const results = [];

  for (const algo of algorithms) {
    // Clona completamente el estado base.
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
