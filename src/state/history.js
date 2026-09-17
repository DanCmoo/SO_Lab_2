import { MAX_UNDO_DEPTH } from '../domain/constants.js';

/**
 * Gestor de la pila de instantáneas para deshacer.
 */
export class HistoryManager {
  constructor(maxDepth = MAX_UNDO_DEPTH) {
    this.maxDepth = maxDepth;
    /** @type {Array<import('../domain/constants.js').SimulationState>} */
    this.undoStack = [];
  }

  /**
   * Pushes a state snapshot onto the undo stack.
   * @param {import('../domain/constants.js').SimulationState} state
   */
  pushSnapshot(state) {
    // Crea una copia estructurada del estado.
    const snapshot = JSON.parse(JSON.stringify(state));
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
  }

  /**
   * Pops the latest snapshot from the undo stack.
   * @returns {import('../domain/constants.js').SimulationState|null}
   */
  popSnapshot() {
    return this.undoStack.pop() || null;
  }

  /**
   * Checks if undo is currently available.
   * @returns {boolean}
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Vacía la pila de deshacer.
   */
  clear() {
    this.undoStack = [];
  }
}
