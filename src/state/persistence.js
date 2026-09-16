import { STORAGE_KEY, STATE_SCHEMA_VERSION } from '../domain/constants.js';
import { DomainError, ErrorCode } from '../domain/errors.js';
import { assertState } from '../domain/invariants.js';

/**
 * Persists the simulation state to localStorage under the key 'mms:simulation:v1'.
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
    // Quota exceeded or storage disabled
    return false;
  }
}

/**
 * Loads and validates persisted simulation state from localStorage.
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
 * Clears persisted state from localStorage.
 */
export function clearStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Exports current simulation state and scenario as a JSON formatted string.
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
 * Parses and validates an imported scenario JSON string.
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
