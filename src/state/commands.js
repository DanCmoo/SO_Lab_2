import { SimulationPhase, ProgramStatus } from '../domain/constants.js';
import { DomainError, ErrorCode } from '../domain/errors.js';
import { createProgram, createInitialState, createSimulationConfig } from '../domain/models.js';
import { getDefaultPrograms } from '../data/default-programs.js';
import { allocate, terminate } from '../engine/simulator.js';
import { nextExecutionNumber } from '../domain/executions.js';

/**
 * Reductor puro que aplica un comando al estado de la simulación.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {Object} command
 * @returns {{
 *   ok: boolean,
 *   state: import('../domain/constants.js').SimulationState,
 *   code: string,
 *   details?: Record<string, unknown>
 * }}
 */
export function reduceCommand(state, command) {
  try {
    switch (command.type) {
      case 'START_SIMULATION': {
        const config = command.config ? createSimulationConfig(command.config) : state.config;
        const freshInitial = createInitialState(config, state.programs.filter(p => !p.sourceProgramId).map(p => ({
          ...p,
          status: ProgramStatus.READY,
          runtimeRegions: Object.freeze([]),
          start: null,
          end: null,
          containerId: null
        })));
        const newState = {
          ...freshInitial,
          phase: SimulationPhase.RUNNING,
          nextSequence: state.nextSequence
        };
        return {
          ok: true,
          state: newState,
          code: 'SIMULATION_STARTED',
          details: { mode: config.mode, algorithm: config.algorithm }
        };
      }

      case 'SET_ALGORITHM': {
        const newState = {
          ...state,
          config: {
            ...state.config,
            algorithm: command.algorithm
          }
        };
        return {
          ok: true,
          state: newState,
          code: 'ALGORITHM_CHANGED',
          details: { algorithm: command.algorithm }
        };
      }

      case 'CREATE_PROGRAM': {
        const draft = command.payload;
        let id = draft.id || `CUST-P${state.nextSequence}`;
        if (!draft.id) {
          let suffix = 1;
          while (state.programs.some(program => program.id === id)) id = `CUST-P${state.nextSequence}-${suffix++}`;
        }
        if (state.programs.some(program => program.id === id)) {
          throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Program id already exists');
        }
        const newProg = createProgram({
          id,
          name: draft.name,
          colorToken: draft.colorToken || `var(--color-prog-${(state.programs.length % 5) + 1})`,
          segments: draft.segments,
          runtimeMemory: draft.runtimeMemory,
          arrivalOrder: state.programs.length
        });
        const newState = {
          ...state,
          programs: Object.freeze([...state.programs, newProg])
        };
        return {
          ok: true,
          state: newState,
          code: 'PROGRAM_CREATED',
          details: { programId: newProg.id, name: newProg.name, sizeBytes: newProg.sizeBytes }
        };
      }

      case 'ALLOCATE_PROGRAM': {
        const source = state.programs.find(p => p.id === command.programId);
        if (!source || source.sourceProgramId) {
          throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Execution requires a program from the catalog');
        }
        let instanceNumber = nextExecutionNumber(state.programs, source);
        let allocationId = `${source.id}~${instanceNumber}`;
        while (state.programs.some(p => p.id === allocationId)) {
          instanceNumber += 1;
          allocationId = `${source.id}~${instanceNumber}`;
        }
        if (!Number.isSafeInteger(instanceNumber) || !Number.isSafeInteger(instanceNumber + 1)) {
          throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Execution number is out of range');
        }
        const instance = {
          ...source,
          id: allocationId,
          name: `${source.name} #${instanceNumber}`,
          sourceProgramId: source.id,
          instanceNumber,
          status: ProgramStatus.READY,
          runtimeRegions: Object.freeze([]),
          start: null,
          end: null,
          containerId: null,
          arrivalOrder: state.programs.length
        };
        delete instance.nextInstanceNumber;
        const allocationState = { ...state, programs: Object.freeze([...state.programs, instance]) };
        const result = allocate(allocationState, allocationId);
        return {
          ok: true,
          state: {
            ...result.state,
            programs: Object.freeze(result.state.programs.map(p => p.id === source.id
              ? { ...p, nextInstanceNumber: instanceNumber + 1 }
              : p))
          },
          code: 'PROGRAM_ALLOCATED',
          details: {
            programId: allocationId,
            sourceProgramId: source.id,
            partitionId: result.partitionId,
            internalFragmentationBytes: result.internalFragmentationBytes,
            probes: result.trace?.probes,
            autoCompacted: false
          }
        };
      }

      case 'TERMINATE_PROGRAM': {
        const freedState = terminate(state, command.programId);
        const newState = {
          ...freedState,
          programs: Object.freeze(freedState.programs.filter(p => !(p.sourceProgramId && p.status === ProgramStatus.TERMINATED))),
          selectedId: freedState.blocks.some(block => block.id === freedState.selectedId) ? freedState.selectedId : null
        };
        return {
          ok: true,
          state: newState,
          code: 'PROGRAM_TERMINATED',
          details: {
            programId: command.programId,
            autoCompacted: newState.lastCompaction !== state.lastCompaction,
            compactionBytesMoved: newState.lastCompaction !== state.lastCompaction ? newState.lastCompaction.bytesMoved : 0,
            compactionRelocations: newState.lastCompaction !== state.lastCompaction ? newState.lastCompaction.relocations : []
          }
        };
      }

      case 'RESET': {
        const resetConfig = command.config ? createSimulationConfig(command.config) : state.config;
        const freshState = createInitialState(resetConfig, state.programs.filter(p => !p.sourceProgramId).map(p => ({
          ...p,
          status: 'ready',
          runtimeRegions: Object.freeze([]),
          start: null,
          end: null,
          containerId: null
        })));
        return {
          ok: true,
          state: freshState,
          code: 'SIMULATION_RESET',
          details: { mode: resetConfig.mode }
        };
      }

      case 'RESTORE_DEFAULT_PROGRAMS': {
        const hasAllocatedPrograms = state.programs.some(p => p.status === ProgramStatus.ALLOCATED);
        if (hasAllocatedPrograms) {
          throw new DomainError(
            ErrorCode.INVALID_CONFIGURATION,
            'Cannot restore default programs while programs are allocated. Reset the simulation first.'
          );
        }
        const defaultPrograms = getDefaultPrograms();
        const newState = {
          ...state,
          programs: Object.freeze(defaultPrograms)
        };
        return {
          ok: true,
          state: newState,
          code: 'DEFAULTS_RESTORED',
          details: { programCount: defaultPrograms.length }
        };
      }

      case 'SELECT_BLOCK': {
        const newState = {
          ...state,
          selectedId: command.id || null
        };
        return {
          ok: true,
          state: newState,
          code: 'BLOCK_SELECTED',
          details: { selectedId: command.id }
        };
      }

      default:
        throw new DomainError(ErrorCode.INVALID_CONFIGURATION, `Unknown command type: ${command.type}`);
    }
  } catch (error) {
    return {
      ok: false,
      state,
      code: error.code || 'COMMAND_FAILED',
      details: {
        error: error.message,
        ...error.details
      }
    };
  }
}
