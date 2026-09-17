import { assertState } from '../domain/invariants.js';
import { HistoryManager } from './history.js';
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
 *   canUndo: () => boolean,
 * }}
 */
export function createStore(initialState, reducer) {
  let state = initialState;
  const listeners = new Set();
  const historyManager = new HistoryManager();

  return {
    getState: () => state,

    canUndo: () => historyManager.canUndo(),

    dispatch(command) {
      if (command.type === 'UNDO') {
        if (!historyManager.canUndo()) {
          return {
            ok: false,
            state,
            code: 'NOTHING_TO_UNDO',
            details: { message: 'Undo history is empty' }
          };
        }

        const priorState = historyManager.popSnapshot();
        assertState(priorState);
        state = priorState;

        saveToStorage(state);
        const result = { ok: true, state, code: 'UNDO_EXECUTED', details: {} };
        listeners.forEach(fn => fn(state, result));
        return result;
      }

      // Comandos que modifican el estado: guarda una instantánea antes de ejecutarlos.
      const nonMutating = command.type === 'SELECT_BLOCK';
      if (!nonMutating) {
        historyManager.pushSnapshot(state);
      }

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
      } else if (!nonMutating) {
        // Descarta la instantánea guardada si el comando falla.
        historyManager.popSnapshot();
      }

      return result;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
