import { MemoryMode } from '../domain/constants.js';
import { allocateStaticEqual, terminateStatic } from './static-equal.js';
import { allocateStaticUnequal } from './static-unequal.js';
import { allocateDynamic, terminateDynamic } from './dynamic.js';
import { canCompactMemory, compactMemory } from './compaction.js';

/**
 * Fachada unificada para asignar un programa en cualquier modo de gestión de memoria.
 * La asignación nunca mueve procesos residentes ni dispara compactación.
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

  return allocateDynamic(state, programId, algorithmOverride);
}

/**
 * Termina un proceso residente y compacta inmediatamente en DYNAMIC_COMPACTION.
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

  const freedState = terminateDynamic(state, programId);
  if (mode !== MemoryMode.DYNAMIC_COMPACTION) return freedState;

  const compaction = canCompactMemory(freedState).canCompact
    ? compactMemory(freedState)
    : { state: freedState, bytesMoved: 0, relocations: [] };
  return {
    ...compaction.state,
    lastCompaction: {
      bytesMoved: compaction.bytesMoved,
      relocations: compaction.relocations,
      triggeredByProgramId: programId,
      trigger: 'TERMINATE_PROGRAM'
    }
  };
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
