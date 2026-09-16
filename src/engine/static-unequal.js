import { ProgramStatus } from '../domain/constants.js';
import { DomainError, ErrorCode } from '../domain/errors.js';
import { extractCandidates } from './candidates.js';
import { selectCandidate } from './allocators.js';
import { terminateStatic } from './static-equal.js';

export { terminateStatic };

/**
 * Allocates a program into static unequal partitions using the active allocation algorithm.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {string} programId
 * @param {string} [algorithmOverride]
 * @returns {{
 *   state: import('../domain/constants.js').SimulationState,
 *   partitionId: string,
 *   internalFragmentationBytes: number,
 *   trace: import('./allocators.js').AllocationTrace
 * }}
 */
export function allocateStaticUnequal(state, programId, algorithmOverride) {
  const algorithm = algorithmOverride || state.config.algorithm;
  const program = state.programs.find(p => p.id === programId);

  if (!program) {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, `Program ${programId} not found`);
  }
  if (program.status !== ProgramStatus.READY) {
    throw new DomainError(ErrorCode.PROGRAM_NOT_READY, `Program ${programId} is not in ready status (current: ${program.status})`);
  }

  const maxPartitionCapacity = Math.max(0, ...state.partitions.map(p => p.sizeBytes));
  if (program.sizeBytes > maxPartitionCapacity) {
    throw new DomainError(
      ErrorCode.PROGRAM_TOO_LARGE,
      `Program size (${program.sizeBytes} B) exceeds maximum partition capacity (${maxPartitionCapacity} B)`
    );
  }

  const candidates = extractCandidates(state);
  if (candidates.length === 0) {
    throw new DomainError(ErrorCode.NO_FREE_PARTITION, 'All static partitions are currently occupied');
  }

  const { candidate, trace } = selectCandidate(candidates, program.sizeBytes, algorithm);
  if (!candidate) {
    throw new DomainError(ErrorCode.NO_FREE_PARTITION, 'No free partition has sufficient capacity for the program');
  }

  const partitionIndex = state.partitions.findIndex(p => p.id === candidate.id);
  const targetPartition = state.partitions[partitionIndex];

  const internalFragmentationBytes = targetPartition.sizeBytes - program.sizeBytes;
  const programStart = targetPartition.start;
  const programEnd = programStart + program.sizeBytes - 1;

  const updatedProgram = {
    ...program,
    status: ProgramStatus.ALLOCATED,
    start: programStart,
    end: programEnd,
    containerId: targetPartition.id
  };

  const updatedPartition = {
    ...targetPartition,
    programId: program.id
  };

  const newPartitions = [...state.partitions];
  newPartitions[partitionIndex] = updatedPartition;

  const newBlocks = state.blocks.map(b =>
    b.id === `BLOCK-${targetPartition.id}` || (b.start === targetPartition.start && b.sizeBytes === targetPartition.sizeBytes)
      ? { ...b, programId: program.id }
      : b
  );

  const newPrograms = state.programs.map(p => (p.id === program.id ? updatedProgram : p));

  const newState = {
    ...state,
    programs: Object.freeze(newPrograms),
    partitions: Object.freeze(newPartitions),
    blocks: Object.freeze(newBlocks),
    lastTrace: trace
  };

  return {
    state: newState,
    partitionId: targetPartition.id,
    internalFragmentationBytes,
    trace
  };
}
