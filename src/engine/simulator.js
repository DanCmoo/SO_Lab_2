import { MemoryMode } from '../domain/constants.js';
import { allocateStaticEqual, terminateStatic } from './static-equal.js';
import { allocateStaticUnequal } from './static-unequal.js';
import { allocateDynamic, terminateDynamic } from './dynamic.js';
import { compactMemory } from './compaction.js';

/**
 * Fachada unificada para asignar un programa en cualquier modo de gestión de memoria.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {string} programId
 * @param {string} [algorithmOverride]
 * @returns {{
 *   state: import('../domain/constants.js').SimulationState,
 *   partitionId?: string,
 *   internalFragmentationBytes?: number,
 *   trace: import('./allocators.js').AllocationTrace
 * }}
 */
export function allocate(state, programId, algorithmOverride) {
  const mode = state.config.mode;

  if (mode === MemoryMode.STATIC_EQUAL) {
    return allocateStaticEqual(state, programId);
  }

  if (mode === MemoryMode.STATIC_UNEQUAL) {
    return allocateStaticUnequal(state, programId, algorithmOverride);
  }

  // DYNAMIC_NO_COMPACTION o DYNAMIC_COMPACTION.
  return allocateDynamic(state, programId, algorithmOverride);
}

/**
 * Fachada unificada para terminar un programa residente en cualquier modo de memoria.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {string} programId
 * @returns {import('../domain/constants.js').SimulationState}
 */
export function terminate(state, programId) {
  const mode = state.config.mode;

  if (mode === MemoryMode.STATIC_EQUAL || mode === MemoryMode.STATIC_UNEQUAL) {
    return terminateStatic(state, programId);
  }

  return terminateDynamic(state, programId);
}

/**
 * Fachada unificada para realizar la compactación de memoria.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @returns {{
 *   state: import('../domain/constants.js').SimulationState,
 *   relocations: Array<{ programId: string, programName: string, oldStart: number, newStart: number, sizeBytes: number }>,
 *   bytesMoved: number
 * }}
 */
export function compact(state) {
  return compactMemory(state);
}
