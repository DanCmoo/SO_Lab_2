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
  const undoStack = [];

  return {
    getState: () => state,
    canUndo: () => undoStack.length > 0,

    dispatch(command) {
      // Comandos que modifican el estado.
      const nonMutating = command.type === 'SELECT_BLOCK';

      const result = command.type === 'UNDO'
        ? undoStack.length
          ? { ok: true, state: undoStack[undoStack.length - 1], code: 'UNDONE', details: {} }
          : { ok: false, state, code: 'NOTHING_TO_UNDO', details: {} }
        : reducer(state, command);

      if (result.ok) {
        assertState(result.state);
        if (command.type === 'UNDO') undoStack.pop();
        else if (!nonMutating) {
          undoStack.push(structuredClone(state));
          if (undoStack.length > 50) undoStack.shift();
        }

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
