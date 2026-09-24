import { assertState } from '../domain/invariants.js';
import { saveToStorage } from './persistence.js';

/**
 * Crea el almacén central de la simulación.
 *
 * @param {import('../domain/constants.js').SimulationState} initialState
 * @param {Function} reducer
 * @returns {{
 *   getState: () => import('../domain/constants.js').SimulationState,
 *   dispatch: (command: Object) => { ok: boolean, state: import('../domain/constants.js').SimulationState, code: string, details?: Record<string, unknown> },
 *   subscribe: (listener: (state: import('../domain/constants.js').SimulationState, result: Object) => void) => () => void,
 * }}
 */
export function createStore(initialState, reducer) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,

    dispatch(command) {
      // Comandos que modifican el estado.
      const nonMutating = command.type === 'SELECT_BLOCK';

      const result = reducer(state, command);

      if (result.ok) {
        assertState(result.state);

        const currentSeq = state.nextSequence;

        state = {
          ...result.state,
          nextSequence: currentSeq + 1
        };

        saveToStorage(state);
        listeners.forEach(fn => fn(state, result));
      }

      return result;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
