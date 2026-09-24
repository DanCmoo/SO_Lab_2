import { STORAGE_KEY, STATE_SCHEMA_VERSION } from '../domain/constants.js';
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
