import { STORAGE_KEY, STATE_SCHEMA_VERSION } from '../domain/constants.js';
import { assertState } from '../domain/invariants.js';
import { createProgram, createSimulationConfig } from '../domain/models.js';
import { createRuntimeRegions } from '../engine/process-memory.js';
import { DomainError, ErrorCode } from '../domain/errors.js';
import { nextExecutionNumber } from '../domain/executions.js';
import { getDefaultPrograms } from '../data/default-programs.js';
let storageError = null;
export function getStorageError() { return storageError; }

/** Convierte sesiones anteriores sin alterar el orden ni los límites físicos. */
function restoreState(parsed) {
  if (![1, 2, STATE_SCHEMA_VERSION].includes(parsed?.schemaVersion)) {
    throw new DomainError(ErrorCode.UNSUPPORTED_SCHEMA, 'Unsupported state schema');
  }
  if (parsed.schemaVersion === STATE_SCHEMA_VERSION) assertState(parsed);
  const configDraft = { ...parsed.config };
  if (parsed.schemaVersion === 1 && configDraft.mode === 'STATIC_EQUAL') {
    configDraft.equalPartitionSizeBytes = (configDraft.totalBytes - configDraft.osBytes) / configDraft.equalPartitionCount;
  }
  const config = createSimulationConfig(configDraft);
  const programs = parsed.programs.map(program => {
    const legacy = parsed.schemaVersion === 1;
    const segments = legacy ? program.segments.filter(segment => !/^(heap|stack)$/i.test(segment.name.trim())) : program.segments;
    const legacyBytes = name => program.segments.filter(segment => segment.name.trim().toLowerCase() === name).reduce((sum, segment) => sum + segment.sizeBytes, 0);
    const runtimeMemory = legacy
      ? { heapBytes: legacyBytes('heap'), stackBytes: legacyBytes('stack') }
      : program.runtimeMemory;
    const source = program.sourceProgramId ? parsed.programs.find(p => p.id === program.sourceProgramId) : null;
    const validated = createProgram({ ...program, name: source?.name || program.name, segments, runtimeMemory });
    return {
      ...program,
      ...validated,
      name: program.name,
      segmentTable: program.segmentTable || [],
      pageTable: program.pageTable || [],
      runtimeRegions: program.status === 'allocated' ? createRuntimeRegions(validated) : Object.freeze([])
    };
  });
  const activePrograms = programs.filter(program => !program.sourceProgramId || program.status === 'allocated').map(program => program.sourceProgramId
    ? program
    : { ...program, nextInstanceNumber: nextExecutionNumber(programs, program) });
  // El catálogo básico pertenece a la aplicación, aunque una sesión antigua
  // haya persistido una lista vacía o solamente programas personalizados.
  // Conserva las definiciones y numeración ya guardadas; añade solo faltantes.
  const existingIds = new Set(activePrograms.map(program => program.id));
  const removedDefaults = parsed.removedDefaultProgramIds || [];
  const missingDefaults = getDefaultPrograms().filter(program => !existingIds.has(program.id) && !removedDefaults.includes(program.id))
    .map(program => ({ ...program, nextInstanceNumber: 1 }));
  const state = { ...parsed, schemaVersion: STATE_SCHEMA_VERSION, config, programs: [...activePrograms, ...missingDefaults], removedDefaultProgramIds: removedDefaults, frames: parsed.frames || [] };
  assertState(state);
  return state;
}

export function exportScenario(state) {
  return JSON.stringify({ schemaVersion: STATE_SCHEMA_VERSION, activeState: state });
}

export function importScenario(json) {
  try {
    const payload = JSON.parse(json);
    if (![1, 2, STATE_SCHEMA_VERSION].includes(payload?.schemaVersion)) {
      throw new DomainError(ErrorCode.UNSUPPORTED_SCHEMA, 'Unsupported scenario schema');
    }
    return restoreState(payload.activeState || payload);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(ErrorCode.UNSUPPORTED_SCHEMA, 'Invalid scenario');
  }
}

/**
 * Persiste el estado de la simulación en localStorage con la clave 'mms:simulation:v1'.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @returns {boolean}
 */
export function saveToStorage(state) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  try {
    const payload = JSON.stringify(state);
    window.localStorage.setItem(STORAGE_KEY, payload);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Carga y valida el estado persistido de la simulación desde localStorage.
 *
 * @returns {import('../domain/constants.js').SimulationState|null}
 */
export function loadFromStorage() {
  storageError = null;
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return restoreState(parsed);
  } catch (error) {
    storageError = error;
    return null;
  }
}

/**
 * Elimina el estado persistido de localStorage.
 */
export function clearStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
