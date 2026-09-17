import { createInitialState } from './domain/models.js';
import { getDefaultPrograms } from './data/default-programs.js';
import { createStore } from './state/store.js';
import { reduceCommand } from './state/commands.js';
import { loadFromStorage, clearStorage } from './state/persistence.js';
import { renderApp } from './ui/render.js';
import { initEvents } from './ui/events.js';
import { initKeyboardShortcuts } from './ui/accessibility.js';
import { openModal, closeModal } from './ui/dialogs.js';
import { elements } from './ui/elements.js';

/**
 * Inicializa y ejecuta la aplicación del simulador de memoria multiprogramada.
 */
function init() {
  const savedState = loadFromStorage();

  if (savedState) {
    // Ofrece reanudar la simulación o comenzar de nuevo.
    openModal(elements.dialogResume);

    elements.btnResumeConfirm.onclick = () => {
      closeModal(elements.dialogResume);
      bootstrapApp(savedState);
    };

    elements.btnResumeStartOver.onclick = () => {
      closeModal(elements.dialogResume);
      clearStorage();
      const freshState = createInitialState({}, getDefaultPrograms());
      bootstrapApp(freshState);
    };
  } else {
    const defaultState = createInitialState({}, getDefaultPrograms());
    bootstrapApp(defaultState);
  }
}

/**
 * Bootstraps the store, listeners, event bindings, and performs initial render.
 * @param {import('./domain/constants.js').SimulationState} initialState
 */
function bootstrapApp(initialState) {
  const store = createStore(initialState, reduceCommand);

  // Suscribe el renderizador a los cambios de estado.
  store.subscribe(state => {
    renderApp(state, store);
  });

  // Registra los eventos delegados de la interfaz y los accesos directos.
  initEvents(store);
  initKeyboardShortcuts(store);

  // Renderizado inicial.
  renderApp(store.getState(), store);
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
