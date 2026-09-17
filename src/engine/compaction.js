import {
  TOTAL_MEMORY_BYTES,
  MAX_ADDRESS,
  MemoryMode,
  BlockKind
} from '../domain/constants.js';
import { DomainError, ErrorCode } from '../domain/errors.js';
import { createMemoryBlock } from '../domain/models.js';

/**
 * Organiza los segmentos del programa de forma contigua dentro de [program.start, program.end].
 *
 * @param {import('../domain/constants.js').Program} program
 * @returns {Array<import('../domain/constants.js').Segment & { start: number, end: number }>}
 */
export function layoutSegments(program) {
  if (program.start === null) return [];
  let cursor = program.start;
  return program.segments.map(segment => {
    const placed = {
      ...segment,
      start: cursor,
      end: cursor + segment.sizeBytes - 1
    };
    cursor = placed.end + 1;
    return placed;
  });
}

/**
 * Comprueba si se puede compactar la memoria.
 * Devuelve true si el modo es DYNAMIC_COMPACTION y hay al menos un proceso que se pueda mover
 * o varios huecos separados.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @returns {{ canCompact: boolean, reason?: string }}
 */
export function canCompactMemory(state) {
  if (state.config.mode !== MemoryMode.DYNAMIC_COMPACTION) {
    return { canCompact: false, reason: 'Current mode does not support compaction' };
  }

  const holes = state.blocks.filter(b => b.kind === BlockKind.HOLE);
  if (holes.length === 0) {
    return { canCompact: false, reason: 'No free memory holes to compact' };
  }

  // Si solo hay un hueco y ya está al final de la memoria.
  if (holes.length === 1 && holes[0].end === MAX_ADDRESS) {
    return { canCompact: false, reason: 'Memory is already fully compacted' };
  }

  return { canCompact: true };
}

/**
 * Realiza la compactación de la memoria dinámica.
 * Desplaza los procesos residentes hacia el límite del sistema operativo en orden físico ascendente,
 * actualiza las direcciones del programa y sus segmentos, y crea un único hueco residual al final.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @returns {{
 *   state: import('../domain/constants.js').SimulationState,
 *   relocations: Array<{ programId: string, programName: string, oldStart: number, newStart: number, sizeBytes: number }>,
 *   bytesMoved: number
 * }}
 */
export function compactMemory(state) {
  const check = canCompactMemory(state);
  if (!check.canCompact) {
    if (state.config.mode !== MemoryMode.DYNAMIC_COMPACTION) {
      throw new DomainError(ErrorCode.COMPACTION_NOT_ALLOWED, check.reason);
    }
    throw new DomainError(ErrorCode.COMPACTION_NOT_NEEDED, check.reason);
  }

  const osBlock = state.blocks.find(b => b.kind === BlockKind.OS);
  const osBytes = osBlock ? osBlock.sizeBytes : state.config.osBytes;

  const residentBlocks = state.blocks
    .filter(b => b.kind === BlockKind.PROCESS)
    .sort((a, b) => a.start - b.start);

  let cursor = osBytes;
  const relocations = [];
  let bytesMoved = 0;

  const newProcessBlocks = [];
  const updatedProgramsMap = new Map();

  for (const block of residentBlocks) {
    const oldStart = block.start;
    const newStart = cursor;
    const newEnd = newStart + block.sizeBytes - 1;

    const prog = state.programs.find(p => p.id === block.programId);
    if (!prog) {
      throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Missing program ${block.programId}`);
    }

    if (newStart !== oldStart) {
      relocations.push({
        programId: prog.id,
        programName: prog.name,
        oldStart,
        newStart,
        sizeBytes: block.sizeBytes
      });
      bytesMoved += block.sizeBytes;
    }

    const updatedProg = {
      ...prog,
      start: newStart,
      end: newEnd
    };
    updatedProgramsMap.set(prog.id, updatedProg);

    newProcessBlocks.push(
      createMemoryBlock({
        id: block.id,
        kind: BlockKind.PROCESS,
        start: newStart,
        sizeBytes: block.sizeBytes,
        programId: block.programId
      })
    );

    cursor = newEnd + 1;
  }

  const freeBytes = TOTAL_MEMORY_BYTES - cursor;
  const newBlocks = [osBlock, ...newProcessBlocks];

  if (freeBytes > 0) {
    newBlocks.push(
      createMemoryBlock({
        id: `HOLE-COMPACTED-${Date.now()}`,
        kind: BlockKind.HOLE,
        start: cursor,
        sizeBytes: freeBytes,
        programId: null
      })
    );
  }

  const updatedPrograms = state.programs.map(p => updatedProgramsMap.get(p.id) || p);

  const newState = {
    ...state,
    programs: Object.freeze(updatedPrograms),
    blocks: Object.freeze(newBlocks)
  };

  return {
    state: newState,
    relocations,
    bytesMoved
  };
}
