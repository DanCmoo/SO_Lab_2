import { MAX_UNDO_DEPTH } from '../domain/constants.js';

/**
 * Creates an immutable history entry.
 *
 * @param {Object} params
 * @param {number} params.sequence
 * @param {string} params.commandType
 * @param {string} params.outcomeCode
 * @param {string} params.mode
 * @param {string|null} [params.algorithm]
 * @param {Record<string, unknown>} [params.details={}]
 * @returns {import('../domain/constants.js').HistoryEntry}
 */
export function createHistoryEntry({
  sequence,
  commandType,
  outcomeCode,
  mode,
  algorithm = null,
  details = {}
}) {
  return Object.freeze({
    sequence,
    commandType,
    outcomeCode,
    mode,
    algorithm,
    timestamp: new Date().toISOString(),
    details: Object.freeze({ ...details })
  });
}

/**
 * History and Snapshot Undo Stack Manager.
 */
export class HistoryManager {
  constructor(maxDepth = MAX_UNDO_DEPTH) {
    this.maxDepth = maxDepth;
    /** @type {Array<import('../domain/constants.js').SimulationState>} */
    this.undoStack = [];
    /** @type {Array<import('../domain/constants.js').HistoryEntry>} */
    this.historyEntries = [];
  }

  /**
   * Pushes a state snapshot onto the undo stack.
   * @param {import('../domain/constants.js').SimulationState} state
   */
  pushSnapshot(state) {
    // Structured clone snapshot of state
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
   * Records an immutable history entry.
   * @param {import('../domain/constants.js').HistoryEntry} entry
   */
  recordEntry(entry) {
    this.historyEntries.push(entry);
  }

  /**
   * Clears the undo stack and history entries.
   */
  clear() {
    this.undoStack = [];
    this.historyEntries = [];
  }
}
