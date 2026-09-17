import { SimulationPhase } from '../domain/constants.js';
import { DomainError, ErrorCode } from '../domain/errors.js';
import { createProgram, createInitialState, createSimulationConfig } from '../domain/models.js';
import { getDefaultPrograms } from '../data/default-programs.js';
import { allocate, terminate, compact } from '../engine/simulator.js';
import { importScenario } from './persistence.js';

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
        const freshInitial = createInitialState(config, state.programs);
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
        const newProg = createProgram({
          id: draft.id || `CUST-P${state.programs.length + 1}`,
          name: draft.name,
          colorToken: draft.colorToken || `var(--color-prog-${(state.programs.length % 5) + 1})`,
          segments: draft.segments,
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
        const result = allocate(state, command.programId);
        return {
          ok: true,
          state: result.state,
          code: 'PROGRAM_ALLOCATED',
          details: {
            programId: command.programId,
            partitionId: result.partitionId,
            internalFragmentationBytes: result.internalFragmentationBytes,
            probes: result.trace?.probes
          }
        };
      }

      case 'TERMINATE_PROGRAM': {
        const newState = terminate(state, command.programId);
        return {
          ok: true,
          state: newState,
          code: 'PROGRAM_TERMINATED',
          details: { programId: command.programId }
        };
      }

      case 'COMPACT_MEMORY': {
        const result = compact(state);
        return {
          ok: true,
          state: result.state,
          code: 'MEMORY_COMPACTED',
          details: {
            relocations: result.relocations,
            bytesMoved: result.bytesMoved
          }
        };
      }

      case 'COMPACT_AND_RETRY': {
        // Compound atomic action: compact, then allocate target program
        const compactResult = compact(state);
        const allocateResult = allocate(compactResult.state, command.programId);
        return {
          ok: true,
          state: allocateResult.state,
          code: 'COMPACT_AND_RETRY_SUCCESS',
          details: {
            programId: command.programId,
            bytesMoved: compactResult.bytesMoved,
            relocations: compactResult.relocations
          }
        };
      }

      case 'RESET': {
        const resetConfig = command.config ? createSimulationConfig(command.config) : state.config;
        const freshState = createInitialState(resetConfig, state.programs.map(p => ({
          ...p,
          status: 'ready',
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

      case 'IMPORT_SCENARIO': {
        const imported = typeof command.payload === 'string'
          ? importScenario(command.payload)
          : command.payload;
        return {
          ok: true,
          state: imported,
          code: 'SCENARIO_IMPORTED',
          details: { mode: imported.config.mode }
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
