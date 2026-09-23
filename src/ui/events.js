import { MemoryMode, MIB } from '../domain/constants.js';
import { parseUnitToBytes, formatBytes } from '../domain/address.js';
import { elements } from './elements.js';
import {
  openModal,
  closeModal,
  openAlgorithmComparison,
  triggerExportScenario
} from './dialogs.js';
import {
  resetCustomProgramForm,
  addSegmentRow,
  getCustomProgramDraft,
  recalculateConfigValues
} from './forms.js';
import { setStatusBanner } from './render.js';
import { announce } from './accessibility.js';
import { describeError } from './error-messages.js';

/**
 * Construye la configuración de simulación a partir del formulario actual.
 * @returns {import('../domain/constants.js').SimulationConfig}
 */
function readConfigFromForm() {
  const mode = elements.selectMode.value;
  const algorithm = elements.selectAlgorithm.value;
  const osRaw = elements.inputOsSize.value;
  const osUnit = elements.selectOsUnit.value;
  const osBytes = parseUnitToBytes(osRaw, osUnit);

  let equalPartitionCount = null;
  let unequalPartitionSizes = [];

  if (mode === MemoryMode.STATIC_EQUAL) {
    equalPartitionCount = parseInt(elements.inputEqualCount.value, 10);
  } else if (mode === MemoryMode.STATIC_UNEQUAL) {
    const rawTokens = elements.inputUnequalSizes.value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const sizesInMiB = rawTokens.map(Number);
    if (sizesInMiB.some(size => !Number.isFinite(size))) {
      throw new Error('Valor no numérico en "Tamaños desiguales": revisa la lista separada por comas.');
    }
    unequalPartitionSizes = sizesInMiB.map(size => Math.round(size * MIB));
  }

  return {
    mode,
    algorithm,
    osBytes,
    equalPartitionCount,
    unequalPartitionSizes
  };
}

/**
 * Registra todos los controladores de eventos del DOM y de la interfaz.
 *
 * @param {Object} store
 */
export function initEvents(store) {
  let pendingResetConfig = null;

  // 1. Mode and Algorithm Selectors
  elements.selectMode.addEventListener('change', () => {
    const state = store.getState();
    if (state.phase === 'RUNNING') {
      try {
        pendingResetConfig = readConfigFromForm();
        openModal(elements.dialogConfirmReset);
      } catch (error) {
        elements.selectMode.value = state.config.mode;
        setStatusBanner({ type: 'error', message: `No se puede cambiar el modo: ${describeError(error)}` });
      }
      return;
    }
    try {
      const config = readConfigFromForm();
      const res = store.dispatch({ type: 'RESET', config });
      if (res.ok) {
        setStatusBanner({ type: 'success', message: 'Configuración aplicada.' });
      } else {
        elements.selectMode.value = state.config.mode;
        setStatusBanner({ type: 'error', message: `Configuración inválida: ${describeError(res)}` });
      }
    } catch (error) {
      elements.selectMode.value = state.config.mode;
      setStatusBanner({ type: 'error', message: `Configuración inválida: ${describeError(error)}` });
    }
  });

  elements.selectAlgorithm.addEventListener('change', () => {
    store.dispatch({
      type: 'SET_ALGORITHM',
      algorithm: elements.selectAlgorithm.value
    });
  });

  // Live calculation on config input changes
  elements.inputOsSize.addEventListener('input', recalculateConfigValues);
  elements.selectOsUnit.addEventListener('change', recalculateConfigValues);
  elements.inputEqualCount.addEventListener('input', recalculateConfigValues);
  elements.inputUnequalSizes.addEventListener('input', recalculateConfigValues);

  // 2. Start Simulation & Apply Config
  elements.btnApplyConfig.addEventListener('click', () => {
    try {
      const config = readConfigFromForm();
      const res = store.dispatch({ type: 'RESET', config });
      if (res.ok) {
        setStatusBanner({
          type: 'success',
          message: 'Configuración aplicada al mapa de memoria física.'
        });
      } else {
        setStatusBanner({ type: 'error', message: `Configuración inválida: ${describeError(res)}` });
      }
    } catch (error) {
      setStatusBanner({ type: 'error', message: `Configuración inválida: ${describeError(error)}` });
    }
  });

  elements.btnStartSim.addEventListener('click', () => {
    try {
      const config = readConfigFromForm();
      const res = store.dispatch({ type: 'START_SIMULATION', config });
      if (res.ok) {
        setStatusBanner({
          type: 'success',
          message: 'Simulación iniciada. La configuración de memoria está bloqueada. Ya puedes asignar programas.'
        });
        announce('Simulación iniciada. Configuración bloqueada.');
      } else {
        setStatusBanner({ type: 'error', message: `No se puede iniciar la simulación: ${describeError(res)}` });
      }
    } catch (e) {
      setStatusBanner({ type: 'error', message: `No se puede iniciar la simulación: ${describeError(e)}` });
    }
  });

  // 3. Top Action Buttons
  elements.btnUndo.addEventListener('click', () => {
    const res = store.dispatch({ type: 'UNDO' });
    if (res.ok) {
      setStatusBanner({ type: 'success', message: 'Se deshizo la última acción.' });
      announce('Deshacer realizado correctamente.');
    }
  });

  elements.btnCompare.addEventListener('click', () => {
    openAlgorithmComparison(store.getState());
  });

  elements.btnExportScenario.addEventListener('click', () => {
    triggerExportScenario(store.getState());
  });

  elements.btnImportScenario.addEventListener('click', () => {
    elements.textareaScenarioJson.value = '';
    openModal(elements.dialogImport);
  });

  elements.btnConfirmImport.addEventListener('click', () => {
    const jsonStr = elements.textareaScenarioJson.value.trim();
    if (!jsonStr) return;
    const res = store.dispatch({ type: 'IMPORT_SCENARIO', payload: jsonStr });
    if (res.ok) {
      closeModal(elements.dialogImport);
      setStatusBanner({ type: 'success', message: 'Escenario importado correctamente.' });
      announce('Escenario importado correctamente.');
    } else {
      setStatusBanner({ type: 'error', message: `Error de importación: ${describeError(res)}` });
    }
  });

  elements.btnReset.addEventListener('click', () => {
    pendingResetConfig = null;
    openModal(elements.dialogConfirmReset);
  });

  elements.btnConfirmReset.addEventListener('click', () => {
    closeModal(elements.dialogConfirmReset);
    const config = pendingResetConfig;
    pendingResetConfig = null;
    const res = store.dispatch(config ? { type: 'RESET', config } : { type: 'RESET' });
    if (res.ok) {
      setStatusBanner({
        type: 'success',
        message: 'Simulación reiniciada. Configuración desbloqueada.'
      });
      announce('Simulación reiniciada.');
    } else {
      elements.selectMode.value = store.getState().config.mode;
      setStatusBanner({ type: 'error', message: `No se pudo reiniciar: ${describeError(res)}` });
      announce('No se pudo reiniciar: configuración inválida.');
    }
  });

  // 4. Queue Panel & Program Creation
  elements.btnRestoreDefaults.addEventListener('click', () => {
    const res = store.dispatch({ type: 'RESTORE_DEFAULT_PROGRAMS' });
    if (res.ok) {
      setStatusBanner({ type: 'success', message: 'Programas predeterminados restaurados.' });
      announce('Programas predeterminados restaurados.');
    } else {
      setStatusBanner({ type: 'error', message: `No se pueden restaurar los predeterminados: ${describeError(res)}` });
      announce('No se pudieron restaurar los programas predeterminados.');
    }
  });

  elements.btnOpenNewProgram.addEventListener('click', () => {
    resetCustomProgramForm();
    openModal(elements.dialogNewProgram);
  });

  elements.btnAddSegmentRow.addEventListener('click', () => {
    addSegmentRow();
  });

  elements.btnSaveCustomProg.addEventListener('click', () => {
    try {
      const draft = getCustomProgramDraft();
      if (!draft.name) {
        setStatusBanner({
          type: 'error',
          message: 'No se puede crear el programa: falta el nombre. Introduce un nombre de entre 1 y 60 caracteres.'
        });
        announce('No se puede crear el programa: falta el nombre.');
        return;
      }
      const res = store.dispatch({ type: 'CREATE_PROGRAM', payload: draft });
      if (res.ok) {
        closeModal(elements.dialogNewProgram);
        setStatusBanner({
          type: 'success',
          message: `Programa ${draft.name} creado. Añadido a la cola.`
        });
        announce(`Programa ${draft.name} creado`);
      } else {
        setStatusBanner({ type: 'error', message: `No se puede crear el programa: ${describeError(res)}` });
      }
    } catch (e) {
      setStatusBanner({ type: 'error', message: `No se puede crear el programa: ${describeError(e)}` });
    }
  });

  // Delegated Queue Actions: Allocate & Terminate
  elements.queueList.addEventListener('click', e => {
    const allocBtn = e.target.closest('.btn-allocate');
    if (allocBtn) {
      const progId = allocBtn.getAttribute('data-id');
      const res = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: progId });

      if (res.ok) {
        if (res.details.autoCompacted) {
          setStatusBanner({
            type: 'success',
            message: `Fragmentación externa detectada: la memoria se compactó automáticamente (se desplazaron ${formatBytes(res.details.compactionBytesMoved)}) y ${progId} quedó asignado.`
          });
          announce(`Memoria compactada automáticamente. Programa ${progId} asignado.`);
        } else {
          setStatusBanner({
            type: 'success',
            message: `Programa ${progId} asignado correctamente.`
          });
          announce(`Programa ${progId} asignado`);
        }
      } else if (res.code === 'EXTERNAL_FRAGMENTATION') {
        // Solo puede ocurrir en DYNAMIC_NO_COMPACTION: es un fallo permanente y real,
        // por diseño ese modo no compacta. No se ofrece ninguna acción de reintento manual.
        setStatusBanner({
          type: 'warning',
          message: `Fragmentación externa: la memoria libre total es suficiente, pero ningún hueco individual tiene espacio para ${progId}. Este modo no compacta memoria.`
        });
        announce(`Fragmentación externa para el programa ${progId}`);
      } else {
        setStatusBanner({
          type: 'error',
          message: `La asignación de ${progId} falló: ${describeError(res, { programId: progId })}`
        });
        announce(`La asignación de ${progId} falló`);
      }
      return;
    }

    const termBtn = e.target.closest('.btn-terminate');
    if (termBtn) {
      const progId = termBtn.getAttribute('data-id');
      const res = store.dispatch({ type: 'TERMINATE_PROGRAM', programId: progId });
      if (res.ok) {
        setStatusBanner({
          type: 'success',
          message: `Programa ${progId} terminado. Memoria liberada y huecos adyacentes fusionados.`
        });
        announce(`Programa ${progId} terminado`);
      } else {
        setStatusBanner({ type: 'error', message: `No se puede terminar ${progId}: ${describeError(res, { programId: progId })}` });
      }
    }
  });

  // 5. Accessible Table Toggle
  elements.btnToggleTable.addEventListener('click', () => {
    const isHidden = elements.accessibleMemoryTableWrap.style.display === 'none';
    elements.accessibleMemoryTableWrap.style.display = isHidden ? 'block' : 'none';
    elements.btnToggleTable.textContent = isHidden ? 'Ocultar tabla' : 'Ver como tabla';
    elements.btnToggleTable.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });

  // 6. Generic Dialog Close Buttons
  document.querySelectorAll('.btn-close-dialog').forEach(btn => {
    btn.addEventListener('click', () => {
      const dialog = btn.closest('dialog');
      if (dialog) closeModal(dialog);
    });
  });
}
