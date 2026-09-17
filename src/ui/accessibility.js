import { elements } from './elements.js';

/**
 * Anuncia un mensaje a los lectores de pantalla mediante aria-live.
 * @param {string} message
 */
export function announce(message) {
  if (elements.liveAnnouncer) {
    elements.liveAnnouncer.textContent = '';
    // Breve espera para asegurar que el lector de pantalla detecte el cambio.
    setTimeout(() => {
      elements.liveAnnouncer.textContent = message;
    }, 50);
  }
}

/**
 * Inicializa los accesos directos globales (por ejemplo, Ctrl+Z para deshacer).
 * @param {import('../state/store.js').createStore} store
 */
export function initKeyboardShortcuts(store) {
  window.addEventListener('keydown', e => {
    // Ignora la combinación al escribir en campos de entrada o áreas de texto.
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
