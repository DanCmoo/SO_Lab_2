import { BlockKind, ProgramStatus } from '../domain/constants.js';
import { DomainError, ErrorCode } from '../domain/errors.js';
import { extractCandidates } from './candidates.js';
import { selectCandidate } from './allocators.js';
import { createMemoryBlock } from '../domain/models.js';

/**
 * Clasifica el motivo de un fallo de asignación dinámica.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {number} requestBytes
 * @returns {string} ErrorCode
 */
export function classifyDynamicFailure(state, requestBytes) {
  const holes = state.blocks.filter(b => b.kind === BlockKind.HOLE);
  const totalFree = holes.reduce((sum, h) => sum + h.sizeBytes, 0);
  const largestHole = holes.length > 0 ? Math.max(...holes.map(h => h.sizeBytes)) : 0;

  if (totalFree < requestBytes) {
    return ErrorCode.INSUFFICIENT_TOTAL_MEMORY;
  }
  if (largestHole < requestBytes) {
    return ErrorCode.EXTERNAL_FRAGMENTATION;
  }
  return ErrorCode.INSUFFICIENT_TOTAL_MEMORY;
}

/**
 * Divide un hueco seleccionado en un bloque PROCESS y un HOLE residual opcional.
 *
 * @param {import('../domain/constants.js').MemoryBlock} hole
 * @param {import('../domain/constants.js').Program} program
 * @returns {import('../domain/constants.js').MemoryBlock[]}
 */
export function allocateIntoHole(hole, program) {
  const processBlock = createMemoryBlock({
    id: `PROC-${program.id}`,
    kind: BlockKind.PROCESS,
    start: hole.start,
    sizeBytes: program.sizeBytes,
    programId: program.id
  });

  const residualBytes = hole.sizeBytes - program.sizeBytes;
  if (residualBytes === 0) {
    return [processBlock];
  }

  const residualHole = createMemoryBlock({
    id: `HOLE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind: BlockKind.HOLE,
    start: processBlock.end + 1,
    sizeBytes: residualBytes,
    programId: null
  });

  return [processBlock, residualHole];
}

/**
 * Normaliza los bloques de memoria fusionando los huecos libres adyacentes en una sola pasada.
 *
 * @param {import('../domain/constants.js').MemoryBlock[]} blocks
 * @returns {import('../domain/constants.js').MemoryBlock[]}
 */
export function coalesce(blocks) {
  const result = [];
  for (const block of blocks) {
    const previous = result[result.length - 1];
    if (previous && previous.kind === BlockKind.HOLE && block.kind === BlockKind.HOLE) {
      const mergedSizeBytes = previous.sizeBytes + block.sizeBytes;
      const mergedEnd = block.end;
      result[result.length - 1] = createMemoryBlock({
        id: previous.id,
        kind: BlockKind.HOLE,
        start: previous.start,
        sizeBytes: mergedSizeBytes,
        programId: null
      });
    } else {
      result.push({ ...block });
    }
  }
  return result;
}

/**
 * Asigna un programa en modo de particiones dinámicas.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {string} programId
 * @param {string} [algorithmOverride]
 * @returns {{
 *   state: import('../domain/constants.js').SimulationState,
 *   trace: import('./allocators.js').AllocationTrace
 * }}
 */
export function allocateDynamic(state, programId, algorithmOverride) {
  const algorithm = algorithmOverride || state.config.algorithm;
  const program = state.programs.find(p => p.id === programId);

  if (!program) {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, `Program ${programId} not found`);
  }
  if (program.status !== ProgramStatus.READY) {
    throw new DomainError(ErrorCode.PROGRAM_NOT_READY, `Program ${programId} is not ready`);
  }

  const candidates = extractCandidates(state);
  const { candidate, trace } = selectCandidate(candidates, program.sizeBytes, algorithm);

  if (!candidate) {
    const failureCode = classifyDynamicFailure(state, program.sizeBytes);
    const message =
      failureCode === ErrorCode.EXTERNAL_FRAGMENTATION
        ? `External fragmentation: total free memory is sufficient but no single hole is large enough for ${program.name} (${program.sizeBytes} B)`
        : `Insufficient total memory for ${program.name} (${program.sizeBytes} B)`;
    throw new DomainError(failureCode, message, {
      requestBytes: program.sizeBytes,
      programId: program.id
    });
  }

  const chosenHoleIndex = state.blocks.findIndex(b => b.id === candidate.id);
  const chosenHole = state.blocks[chosenHoleIndex];
  const replacementBlocks = allocateIntoHole(chosenHole, program);

  const newBlocks = [
    ...state.blocks.slice(0, chosenHoleIndex),
    ...replacementBlocks,
    ...state.blocks.slice(chosenHoleIndex + 1)
  ];

  const processBlock = replacementBlocks[0];
  const updatedProgram = {
    ...program,
    status: ProgramStatus.ALLOCATED,
    start: processBlock.start,
    end: processBlock.end,
    containerId: null
  };

  const newPrograms = state.programs.map(p => (p.id === program.id ? updatedProgram : p));

  const newState = {
    ...state,
    programs: Object.freeze(newPrograms),
    blocks: Object.freeze(newBlocks),
    lastTrace: trace
  };

  return {
    state: newState,
    trace
  };
}

/**
 * Termina un programa asignado en modo dinámico y fusiona los huecos adyacentes.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {string} programId
 * @returns {import('../domain/constants.js').SimulationState}
 */
export function terminateDynamic(state, programId) {
  const program = state.programs.find(p => p.id === programId);
  if (!program) {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, `Program ${programId} not found`);
  }
  if (program.status !== ProgramStatus.ALLOCATED) {
    throw new DomainError(
      ErrorCode.PROGRAM_NOT_RESIDENT,
      `Program ${programId} is not allocated (current: ${program.status})`
    );
  }

  const processBlockIndex = state.blocks.findIndex(
    b => b.kind === BlockKind.PROCESS && b.programId === programId
  );
  if (processBlockIndex === -1) {
    throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Process block for program ${programId} not found`);
  }

  const processBlock = state.blocks[processBlockIndex];
  const freedHole = createMemoryBlock({
    id: `HOLE-FREED-${Date.now()}`,
    kind: BlockKind.HOLE,
    start: processBlock.start,
    sizeBytes: processBlock.sizeBytes,
    programId: null
  });

  const rawBlocks = [
    ...state.blocks.slice(0, processBlockIndex),
    freedHole,
    ...state.blocks.slice(processBlockIndex + 1)
  ];

  const normalizedBlocks = coalesce(rawBlocks);

  const updatedProgram = {
    ...program,
    status: ProgramStatus.TERMINATED,
    start: null,
    end: null,
    containerId: null
  };

  const newPrograms = state.programs.map(p => (p.id === program.id ? updatedProgram : p));

  return {
    ...state,
    programs: Object.freeze(newPrograms),
    blocks: Object.freeze(normalizedBlocks)
  };
}
