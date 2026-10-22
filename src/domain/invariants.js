import {
  TOTAL_MEMORY_BYTES,
  MIN_ADDRESS,
  MAX_ADDRESS,
  MemoryMode,
  ProgramStatus,
  BlockKind, AllocationAlgorithm
} from './constants.js';
import { DomainError, ErrorCode } from './errors.js';
import { memoryModel } from './memory-mode.js';
import { assertPaged, assertSegmented } from './noncontiguous-invariants.js';
import { regionPermissions } from './process-regions.js';

/**
 * Comprueba todas las invariantes globales y específicas del modo de un estado.
 * Lanza DomainError(STATE_INVARIANT_FAILED) si se infringe alguna invariante.
 * @param {import('./constants.js').SimulationState} state
 */
export function assertState(state) {
  if (!state || typeof state !== 'object') {
    throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'State must be a non-null object');
  }

  const { config, programs, partitions, blocks } = state;
  const removedDefaults = state.removedDefaultProgramIds ?? [];
  if (!Array.isArray(removedDefaults) || removedDefaults.some(id => typeof id !== 'string' || !id) || new Set(removedDefaults).size !== removedDefaults.length || programs.some(p => removedDefaults.includes(p.id))) {
    throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Registro de programas eliminados inválido.');
  }
  memoryModel(config.mode);
  const noncontiguous = config.mode === MemoryMode.SEGMENTATION || config.mode === MemoryMode.PAGING;
  if (!Object.values(AllocationAlgorithm).includes(config.algorithm)) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Algoritmo desconocido.');
  if (new Set(programs.map(p => p.id)).size !== programs.length || new Set(blocks.map(b => b.id)).size !== blocks.length) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'IDs duplicados.');
  if (programs.some(p => typeof p.id !== 'string' || !p.id) || blocks.some(b => typeof b.id !== 'string' || !b.id)) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Las identidades deben ser cadenas no vacías.');
  if (!noncontiguous && ((state.frames || []).length || programs.some(p => p.segmentTable?.length || p.pageTable?.length))) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Tablas/marcos en un modo contiguo.');

  // 1. Invariantes de configuración.
  if (config.totalBytes !== TOTAL_MEMORY_BYTES) {
    throw new DomainError(
      ErrorCode.STATE_INVARIANT_FAILED,
      `Total memory must be ${TOTAL_MEMORY_BYTES}, got ${config.totalBytes}`
    );
  }
  if (!Number.isSafeInteger(config.osBytes) || config.osBytes < 0 || config.osBytes >= config.totalBytes) {
    throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Invalid OS bytes configuration');
  }

  // 2. Invariantes de cobertura continua de los bloques de memoria.
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Memory blocks array cannot be empty');
  }

  if (blocks[0].start !== MIN_ADDRESS) {
    throw new DomainError(
      ErrorCode.STATE_INVARIANT_FAILED,
      `First memory block must start at 0x${MIN_ADDRESS.toString(16)}, got 0x${blocks[0].start.toString(16)}`
    );
  }

  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock.end !== MAX_ADDRESS) {
    throw new DomainError(
      ErrorCode.STATE_INVARIANT_FAILED,
      `Last memory block must end at 0x${MAX_ADDRESS.toString(16)}, got 0x${lastBlock.end.toString(16)}`
    );
  }

  let calculatedSum = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.kind === BlockKind.OS && (block.start !== 0 || block.sizeBytes !== config.osBytes || block.programId !== null)) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Reserva del SO alterada.');
    if ([BlockKind.OS, BlockKind.HOLE, BlockKind.UNPARTITIONED].includes(block.kind) && block.programId !== null) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Memoria libre o del SO con propietario.');
    if (!noncontiguous && ![BlockKind.OS, BlockKind.HOLE, BlockKind.PARTITION, BlockKind.PROCESS, BlockKind.UNPARTITIONED].includes(block.kind)) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Tipo de bloque ajeno al modo contiguo.');
    if (!Number.isSafeInteger(block.start) || !Number.isSafeInteger(block.sizeBytes) || !Number.isSafeInteger(block.end)) {
      throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Block ${block.id} has non-safe-integer bounds`);
    }
    if (block.sizeBytes <= 0) {
      throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Block ${block.id} has non-positive size ${block.sizeBytes}`);
    }
    if (block.end !== block.start + block.sizeBytes - 1) {
      throw new DomainError(
        ErrorCode.STATE_INVARIANT_FAILED,
        `Block ${block.id} invariant violated: end (${block.end}) !== start + size - 1 (${block.start + block.sizeBytes - 1})`
      );
    }
    calculatedSum += block.sizeBytes;

    if (i < blocks.length - 1) {
      const nextBlock = blocks[i + 1];
      if (block.end + 1 !== nextBlock.start) {
        throw new DomainError(
          ErrorCode.STATE_INVARIANT_FAILED,
          `Discontinuity between block ${block.id} (end: 0x${block.end.toString(16)}) and ${nextBlock.id} (start: 0x${nextBlock.start.toString(16)})`
        );
      }
    }
  }

  if (calculatedSum !== TOTAL_MEMORY_BYTES) {
    throw new DomainError(
      ErrorCode.STATE_INVARIANT_FAILED,
      `Total sum of blocks (${calculatedSum}) does not equal 16 MiB (${TOTAL_MEMORY_BYTES})`
    );
  }

  // Invariante del bloque del sistema operativo.
  const osBlock = blocks[0];
  if (config.osBytes > 0 && (osBlock.kind !== BlockKind.OS || osBlock.start !== 0 || osBlock.sizeBytes !== config.osBytes)) {
    throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'OS block must be first with configured OS size');
  }

  // 3. Invariantes de los programas.
  const allocatedPrograms = new Set();
  for (const prog of programs) {
    if (!Object.values(ProgramStatus).includes(prog.status)) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Estado de proceso inválido.');
    if (prog.sourceProgramId && !programs.some(p => p.id === prog.sourceProgramId && !p.sourceProgramId)) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Instancia sin plantilla.');
    if (new Set(prog.segments.map(s => s.id)).size !== prog.segments.length) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'IDs de segmentos duplicados.');
    for (const segment of prog.segments) {
      if (!Number.isSafeInteger(segment.sizeBytes) || segment.sizeBytes <= 0) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Tamaño de región inválido.');
      regionPermissions(segment.name, segment.permissions);
    }
    const segmentSum = prog.segments.reduce((acc, s) => acc + s.sizeBytes, 0);
    if ([prog.runtimeMemory?.heapBytes ?? 0, prog.runtimeMemory?.stackBytes ?? 0].some(bytes => !Number.isSafeInteger(bytes) || bytes < 0)) {
      throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Invalid runtime memory request for ${prog.id}`);
    }
    if (prog.imageSizeBytes !== segmentSum) {
      throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Program ${prog.id} image size mismatch`);
    }
    const runtimeBytes = (prog.runtimeMemory?.heapBytes ?? 0) + (prog.runtimeMemory?.stackBytes ?? 0);
    if (prog.sizeBytes !== segmentSum + runtimeBytes) {
      throw new DomainError(
        ErrorCode.STATE_INVARIANT_FAILED,
        `Program ${prog.id} total size does not equal image plus runtime memory`
      );
    }

    if (prog.status === ProgramStatus.ALLOCATED) {
      if (allocatedPrograms.has(prog.id)) {
        throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Program ${prog.id} allocated more than once`);
      }
      allocatedPrograms.add(prog.id);

      if (noncontiguous) {
        if (prog.start !== null || prog.end !== null || prog.containerId !== null) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Un proceso no contiguo no tiene un único intervalo físico.');
      } else if (prog.start === null || prog.end === null) {
        throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Allocated program ${prog.id} missing start/end addresses`);
      }
      if (!noncontiguous && prog.end !== prog.start + prog.sizeBytes - 1) {
        throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Allocated program ${prog.id} address span mismatch`);
      }
      const regions = prog.runtimeRegions || [];
      for (const [kind, bytes] of [['HEAP', prog.runtimeMemory?.heapBytes ?? 0], ['STACK', prog.runtimeMemory?.stackBytes ?? 0]]) {
        const matching = regions.filter(region => region.kind === kind);
        if (matching.length !== (bytes > 0 ? 1 : 0) || matching.some(region => region.sizeBytes !== bytes || region.allocatedBy !== 'OS' || region.programId !== prog.id)) {
          throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Invalid ${kind} reservation for process ${prog.id}`);
        }
      }
      if (regions.reduce((sum, region) => sum + region.sizeBytes, 0) !== runtimeBytes) {
        throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Runtime reservation mismatch for ${prog.id}`);
      }
    } else {
      if (prog.runtimeRegions?.length) {
        throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Non-resident program ${prog.id} retains runtime memory`);
      }
      if (prog.start !== null || prog.end !== null) {
        throw new DomainError(
          ErrorCode.STATE_INVARIANT_FAILED,
          `Non-allocated program ${prog.id} (${prog.status}) must not have addresses`
        );
      }
    }
  }

  // 4. Invariantes específicas del modo.
  if (config.mode === MemoryMode.STATIC_EQUAL || config.mode === MemoryMode.STATIC_UNEQUAL) {
    if (blocks.some(b => ![BlockKind.OS, BlockKind.PARTITION, ...(config.mode === MemoryMode.STATIC_EQUAL ? [BlockKind.UNPARTITIONED] : [])].includes(b.kind))) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Representación ajena a particiones estáticas.');
    if (config.mode === MemoryMode.STATIC_EQUAL && partitions.some(part => part.sizeBytes !== config.equalPartitionSizeBytes)) {
      throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Equal partitions must have the configured size');
    }
    // Cada partición contiene como máximo un programa.
    const seenPrograms = new Set();
    for (const part of partitions) {
      if (part.programId) {
        if (seenPrograms.has(part.programId)) {
          throw new DomainError(
            ErrorCode.STATE_INVARIANT_FAILED,
            `Static program ${part.programId} assigned to multiple partitions`
          );
        }
        seenPrograms.add(part.programId);

        const prog = programs.find(p => p.id === part.programId);
        if (!prog) {
          throw new DomainError(
            ErrorCode.STATE_INVARIANT_FAILED,
            `Partition ${part.id} references non-existent program ${part.programId}`
          );
        }
        if (prog.sizeBytes > part.sizeBytes) {
          throw new DomainError(
            ErrorCode.STATE_INVARIANT_FAILED,
            `Program ${prog.id} (${prog.sizeBytes} B) exceeds partition ${part.id} (${part.sizeBytes} B)`
          );
        }
        if (prog.start !== part.start) {
          throw new DomainError(
            ErrorCode.STATE_INVARIANT_FAILED,
            `Program ${prog.id} start address 0x${prog.start?.toString(16)} does not match partition start 0x${part.start.toString(16)}`
          );
        }
      }
    }

    // Cada programa asignado debe corresponder a una partición ocupada.
    for (const progId of allocatedPrograms) {
      if (!seenPrograms.has(progId)) {
        throw new DomainError(
          ErrorCode.STATE_INVARIANT_FAILED,
          `Allocated program ${progId} has no corresponding static partition`
        );
      }
    }
  } else if (config.mode === MemoryMode.SEGMENTATION) {
    assertSegmented(state);
  } else if (config.mode === MemoryMode.PAGING) {
    assertPaged(state);
  } else if (config.mode === MemoryMode.DYNAMIC_NO_COMPACTION || config.mode === MemoryMode.DYNAMIC_COMPACTION) {
    if (partitions.length || blocks.some(b => ![BlockKind.OS, BlockKind.HOLE, BlockKind.PROCESS].includes(b.kind))) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Representación ajena a particiones dinámicas.');
    // Modos dinámicos.
    // Comprueba que no haya huecos adyacentes.
    for (let i = 0; i < blocks.length - 1; i++) {
      if (blocks[i].kind === BlockKind.HOLE && blocks[i + 1].kind === BlockKind.HOLE) {
        throw new DomainError(
          ErrorCode.STATE_INVARIANT_FAILED,
          `Adjacent holes found at indices ${i} and ${i + 1} without coalescing`
        );
      }
    }

    // Los bloques de proceso deben coincidir con los programas asignados.
    const residentInBlocks = new Set();
    for (const b of blocks) {
      if (b.kind === BlockKind.PROCESS) {
        if (!b.programId) {
          throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Process block ${b.id} has null programId`);
        }
        const prog = programs.find(p => p.id === b.programId);
        if (!prog) {
          throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Process block references missing program ${b.programId}`);
        }
        if (b.sizeBytes !== prog.sizeBytes || b.start !== prog.start || b.end !== prog.end) {
          throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Process block dimensions do not match program ${prog.id}`);
        }
        residentInBlocks.add(b.programId);
      }
    }

    if (residentInBlocks.size !== allocatedPrograms.size) {
      throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'Mismatch between allocated programs and process blocks');
    }
  }

  return true;
}
