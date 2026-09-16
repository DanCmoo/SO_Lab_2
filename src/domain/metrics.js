import { BlockKind, MemoryMode, ProgramStatus, TOTAL_MEMORY_BYTES } from './constants.js';

/**
 * Pure function deriving simulation metrics from a SimulationState.
 *
 * @param {import('./constants.js').SimulationState} state
 * @returns {{
 *   totalMemoryBytes: number,
 *   osBytes: number,
 *   userBytes: number,
 *   allocatedProgramBytes: number,
 *   freeBytes: number,
 *   internalFragmentationBytes: number,
 *   externalFragmentationDetected: boolean,
 *   largestFreeBlockBytes: number,
 *   freeBlockCount: number,
 *   residentProgramCount: number,
 *   utilizationPercent: number,
 *   lastProbeCount: number,
 *   lastCompactionBytesMoved: number
 * }}
 */
export function deriveMetrics(state) {
  const totalMemoryBytes = TOTAL_MEMORY_BYTES;
  const osBytes = state.config.osBytes;
  const userBytes = totalMemoryBytes - osBytes;

  const residentPrograms = state.programs.filter(p => p.status === ProgramStatus.ALLOCATED);
  const residentProgramCount = residentPrograms.length;
  const allocatedProgramBytes = residentPrograms.reduce((sum, p) => sum + p.sizeBytes, 0);

  let freeBytes = 0;
  let internalFragmentationBytes = 0;
  let largestFreeBlockBytes = 0;
  let freeBlockCount = 0;
  let externalFragmentationDetected = false;

  const isStatic =
    state.config.mode === MemoryMode.STATIC_EQUAL ||
    state.config.mode === MemoryMode.STATIC_UNEQUAL;

  if (isStatic) {
    const freePartitions = state.partitions.filter(p => p.programId === null);
    freeBlockCount = freePartitions.length;
    freeBytes = freePartitions.reduce((sum, p) => sum + p.sizeBytes, 0);
    largestFreeBlockBytes = freePartitions.length > 0 ? Math.max(...freePartitions.map(p => p.sizeBytes)) : 0;

    // Internal fragmentation per occupied partition
    for (const part of state.partitions) {
      if (part.programId) {
        const prog = residentPrograms.find(p => p.id === part.programId);
        if (prog) {
          internalFragmentationBytes += Math.max(0, part.sizeBytes - prog.sizeBytes);
        }
      }
    }
  } else {
    // Dynamic modes
    const holes = state.blocks.filter(b => b.kind === BlockKind.HOLE);
    freeBlockCount = holes.length;
    freeBytes = holes.reduce((sum, h) => sum + h.sizeBytes, 0);
    largestFreeBlockBytes = holes.length > 0 ? Math.max(...holes.map(h => h.sizeBytes)) : 0;
    internalFragmentationBytes = 0;

    // Check if any ready program exhibits external fragmentation condition
    const readyPrograms = state.programs.filter(p => p.status === ProgramStatus.READY);
    for (const p of readyPrograms) {
      if (freeBytes >= p.sizeBytes && largestFreeBlockBytes < p.sizeBytes) {
        externalFragmentationDetected = true;
        break;
      }
    }
  }

  const utilizationPercent =
    userBytes > 0 ? parseFloat(((allocatedProgramBytes / userBytes) * 100).toFixed(2)) : 0;

  const lastProbeCount = state.lastTrace ? state.lastTrace.probes : 0;

  // Retrieve last compaction bytes moved from the latest compaction history event if any
  let lastCompactionBytesMoved = 0;
  if (Array.isArray(state.history)) {
    const compactionEntry = state.history.findLast?.(h => h.commandType === 'COMPACT_MEMORY' || h.commandType === 'COMPACT_AND_RETRY') ||
      [...state.history].reverse().find(h => h.commandType === 'COMPACT_MEMORY' || h.commandType === 'COMPACT_AND_RETRY');
    if (compactionEntry?.details?.bytesMoved) {
      lastCompactionBytesMoved = Number(compactionEntry.details.bytesMoved) || 0;
    }
  }

  return {
    totalMemoryBytes,
    osBytes,
    userBytes,
    allocatedProgramBytes,
    freeBytes,
    internalFragmentationBytes,
    externalFragmentationDetected,
    largestFreeBlockBytes,
    freeBlockCount,
    residentProgramCount,
    utilizationPercent,
    lastProbeCount,
    lastCompactionBytesMoved
  };
}
