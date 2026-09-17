import {
  TOTAL_MEMORY_BYTES,
  MIN_ADDRESS,
  MAX_ADDRESS,
  MemoryMode,
  ProgramStatus,
  BlockKind
} from './constants.js';
import { DomainError, ErrorCode } from './errors.js';

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
  if (osBlock.kind !== BlockKind.OS || osBlock.start !== 0 || osBlock.sizeBytes !== config.osBytes) {
    throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, 'OS block must be first with configured OS size');
  }

  // 3. Invariantes de los programas.
  const allocatedPrograms = new Set();
  for (const prog of programs) {
    const segmentSum = prog.segments.reduce((acc, s) => acc + s.sizeBytes, 0);
    if (prog.sizeBytes !== segmentSum) {
      throw new DomainError(
        ErrorCode.STATE_INVARIANT_FAILED,
        `Program ${prog.id} total size ${prog.sizeBytes} does not equal segment sum ${segmentSum}`
      );
    }

    if (prog.status === ProgramStatus.ALLOCATED) {
      if (allocatedPrograms.has(prog.id)) {
        throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Program ${prog.id} allocated more than once`);
      }
      allocatedPrograms.add(prog.id);

      if (prog.start === null || prog.end === null) {
        throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Allocated program ${prog.id} missing start/end addresses`);
      }
      if (prog.end !== prog.start + prog.sizeBytes - 1) {
        throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Allocated program ${prog.id} address span mismatch`);
      }
    } else {
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
  } else {
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
