import { MemoryMode } from '../domain/constants.js';
import { ErrorCode } from '../domain/errors.js';
import { allocateStaticEqual, terminateStatic } from './static-equal.js';
import { allocateStaticUnequal } from './static-unequal.js';
import { allocateDynamic, terminateDynamic } from './dynamic.js';
import { compactMemory } from './compaction.js';

/**
 * Fachada unificada para asignar un programa en cualquier modo de gestión de memoria.
 * En modo DYNAMIC_COMPACTION, compacta automáticamente si se detecta fragmentación externa
 * y reintenta la asignación en la misma transacción.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {string} programId
 * @param {string} [algorithmOverride]
 * @returns {{
 *   state: import('../domain/constants.js').SimulationState,
 *   partitionId?: string,
 *   internalFragmentationBytes?: number,
 *   trace: import('./allocators.js').AllocationTrace,
 *   autoCompacted?: boolean,
 *   compactionBytesMoved?: number,
 *   compactionRelocations?: Array
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

  if (mode === MemoryMode.DYNAMIC_COMPACTION) {
    try {
      return allocateDynamic(state, programId, algorithmOverride);
    } catch (error) {
      if (error.code !== ErrorCode.EXTERNAL_FRAGMENTATION) {
        throw error; // INSUFFICIENT_TOTAL_MEMORY u otro error real: no se puede resolver compactando.
      }

      // --- Comportamiento clásico de SO ---
      // El gestor de memoria compacta automáticamente ante fragmentación externa
      // y reintenta la asignación dentro de la misma transacción.
      const compaction = compactMemory(state);
      const retry = allocateDynamic(compaction.state, programId, algorithmOverride);

      return {
        ...retry,
        state: {
          ...retry.state,
          lastCompaction: {
            bytesMoved: compaction.bytesMoved,
            relocations: compaction.relocations,
            triggeredByProgramId: programId
          }
        },
        autoCompacted: true,
        compactionBytesMoved: compaction.bytesMoved,
        compactionRelocations: compaction.relocations
      };
    }
  }

  // DYNAMIC_NO_COMPACTION: la fragmentación externa es un fallo permanente por diseño.
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
