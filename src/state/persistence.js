import { STORAGE_KEY, STATE_SCHEMA_VERSION } from '../domain/constants.js';
import { DomainError, ErrorCode } from '../domain/errors.js';
import { assertState } from '../domain/invariants.js';

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
    // Cuota excedida o almacenamiento deshabilitado.
    return false;
  }
}

/**
 * Carga y valida el estado persistido de la simulación desde localStorage.
 *
 * @returns {import('../domain/constants.js').SimulationState|null}
 */
export function loadFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== STATE_SCHEMA_VERSION) {
      return null;
    }
    assertState(parsed);
    return parsed;
  } catch (_e) {
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

/**
 * Exporta el estado y el escenario actuales como una cadena JSON con formato.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @returns {string}
 */
export function exportScenario(state) {
  const scenario = {
    schemaVersion: STATE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    config: state.config,
    programs: state.programs,
    activeState: state
  };
  return JSON.stringify(scenario, null, 2);
}

/**
 * Analiza y valida una cadena JSON de escenario importada.
 *
 * @param {string} jsonString
 * @returns {import('../domain/constants.js').SimulationState}
 */
export function importScenario(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (_e) {
    throw new DomainError(ErrorCode.UNSUPPORTED_SCHEMA, 'Invalid JSON format in scenario payload');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new DomainError(ErrorCode.UNSUPPORTED_SCHEMA, 'Scenario payload must be an object');
  }

  if (parsed.schemaVersion !== STATE_SCHEMA_VERSION) {
    throw new DomainError(
      ErrorCode.UNSUPPORTED_SCHEMA,
      `Unsupported schema version: ${parsed.schemaVersion} (expected ${STATE_SCHEMA_VERSION})`
    );
  }

  const targetState = parsed.activeState || parsed;
  assertState(targetState);
  return targetState;
}
