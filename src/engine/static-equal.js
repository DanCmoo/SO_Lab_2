import { ProgramStatus } from '../domain/constants.js';
import { DomainError, ErrorCode } from '../domain/errors.js';
import { extractCandidates } from './candidates.js';

/**
 * Allocates a program into the lowest-address free static partition of equal size.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {string} programId
 * @returns {{
 *   state: import('../domain/constants.js').SimulationState,
 *   partitionId: string,
 *   internalFragmentationBytes: number,
 *   trace: import('./allocators.js').AllocationTrace
 * }}
 */
export function allocateStaticEqual(state, programId) {
  const program = state.programs.find(p => p.id === programId);
  if (!program) {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, `Program ${programId} not found`);
  }
  if (program.status !== ProgramStatus.READY) {
    throw new DomainError(ErrorCode.PROGRAM_NOT_READY, `Program ${programId} is not in ready status (current: ${program.status})`);
  }

  // Check if any partition in the system could ever contain this program
  const maxPartitionCapacity = Math.max(0, ...state.partitions.map(p => p.sizeBytes));
  if (program.sizeBytes > maxPartitionCapacity) {
    throw new DomainError(
      ErrorCode.PROGRAM_TOO_LARGE,
      `Program size (${program.sizeBytes} B) exceeds partition capacity (${maxPartitionCapacity} B)`
    );
  }

  const freePartitions = extractCandidates(state);
  if (freePartitions.length === 0) {
    throw new DomainError(ErrorCode.NO_FREE_PARTITION, 'All static partitions are currently occupied');
  }

  // Find lowest address partition that can contain the program
  const suitable = freePartitions.find(p => p.capacityBytes >= program.sizeBytes);
  if (!suitable) {
    throw new DomainError(ErrorCode.NO_FREE_PARTITION, 'No free partition is large enough for the program');
  }

  const partitionIndex = state.partitions.findIndex(p => p.id === suitable.id);
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

  const trace = {
    algorithm: 'LOWEST_ADDRESS_STATIC_EQUAL',
    requestBytes: program.sizeBytes,
    inspectedCandidates: freePartitions.map(p => ({
      id: p.id,
      start: p.start,
      capacityBytes: p.capacityBytes,
      suitable: p.capacityBytes >= program.sizeBytes
    })),
    chosenCandidate: suitable,
    probes: 1,
    reason: 'SUCCESS'
  };

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

/**
 * Terminates an allocated static program and frees its partition.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {string} programId
 * @returns {import('../domain/constants.js').SimulationState}
 */
export function terminateStatic(state, programId) {
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

  const newPartitions = state.partitions.map(p =>
    p.programId === programId ? { ...p, programId: null } : p
  );

  const newBlocks = state.blocks.map(b =>
    b.programId === programId ? { ...b, programId: null } : b
  );

  const newPrograms = state.programs.map(p =>
    p.id === programId
      ? {
          ...p,
          status: ProgramStatus.TERMINATED,
          start: null,
          end: null,
          containerId: null
        }
      : p
  );

  return {
    ...state,
    programs: Object.freeze(newPrograms),
    partitions: Object.freeze(newPartitions),
    blocks: Object.freeze(newBlocks)
  };
}
