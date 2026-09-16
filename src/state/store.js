import { assertState } from '../domain/invariants.js';
import { HistoryManager, createHistoryEntry } from './history.js';
import { saveToStorage } from './persistence.js';

/**
 * Creates the central simulation store.
 *
 * @param {import('../domain/constants.js').SimulationState} initialState
 * @param {Function} reducer
 * @returns {{
 *   getState: () => import('../domain/constants.js').SimulationState,
 *   dispatch: (command: Object) => { ok: boolean, state: import('../domain/constants.js').SimulationState, code: string, details?: Record<string, unknown> },
 *   subscribe: (listener: (state: import('../domain/constants.js').SimulationState, result: Object) => void) => () => void,
 *   canUndo: () => boolean,
 *   getHistory: () => import('../domain/constants.js').HistoryEntry[]
 * }}
 */
export function createStore(initialState, reducer) {
  let state = initialState;
  const listeners = new Set();
  const historyManager = new HistoryManager();

  return {
    getState: () => state,

    canUndo: () => historyManager.canUndo(),

    getHistory: () => historyManager.historyEntries,

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

        const undoEntry = createHistoryEntry({
          sequence: state.nextSequence,
          commandType: 'UNDO',
          outcomeCode: 'UNDO_EXECUTED',
          mode: state.config.mode,
          algorithm: state.config.algorithm,
          details: { restoredToSequence: priorState.nextSequence }
        });
        historyManager.recordEntry(undoEntry);

        saveToStorage(state);
        const result = { ok: true, state, code: 'UNDO_EXECUTED', details: {} };
        listeners.forEach(fn => fn(state, result));
        return result;
      }

      // State-mutating commands: snapshot state before executing
      const nonMutating = command.type === 'SELECT_BLOCK';
      if (!nonMutating) {
        historyManager.pushSnapshot(state);
      }

      const result = reducer(state, command);

      if (result.ok) {
        assertState(result.state);

        const currentSeq = state.nextSequence;
        const entry = createHistoryEntry({
          sequence: currentSeq,
          commandType: command.type,
          outcomeCode: result.code,
          mode: result.state.config.mode,
          algorithm: result.state.config.algorithm,
          details: result.details || {}
        });
        historyManager.recordEntry(entry);

        state = {
          ...result.state,
          history: Object.freeze([...(result.state.history || []), entry]),
          nextSequence: currentSeq + 1
        };

        saveToStorage(state);
        listeners.forEach(fn => fn(state, result));
      } else if (!nonMutating) {
        // Discard the saved snapshot if command failed
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
