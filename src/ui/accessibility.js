import { elements } from './elements.js';

/**
 * Announces a message to screen readers via aria-live.
 * @param {string} message
 */
export function announce(message) {
  if (elements.liveAnnouncer) {
    elements.liveAnnouncer.textContent = '';
    // Short timeout to ensure screen reader detects the text change
    setTimeout(() => {
      elements.liveAnnouncer.textContent = message;
    }, 50);
  }
}

/**
 * Initializes global keyboard shortcuts (e.g. Ctrl+Z for Undo).
 * @param {import('../state/store.js').createStore} store
 */
export function initKeyboardShortcuts(store) {
  window.addEventListener('keydown', e => {
    // Ignore inside textareas or input typing
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (store.canUndo()) {
        store.dispatch({ type: 'UNDO' });
      }
    }
  });
}
