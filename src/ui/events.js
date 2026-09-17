import { MemoryMode, MIB } from '../domain/constants.js';
import { parseUnitToBytes } from '../domain/address.js';
import { elements } from './elements.js';
import {
  openModal,
  closeModal,
  openCompactionPreview,
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
    const rawSizes = elements.inputUnequalSizes.value;
    unequalPartitionSizes = rawSizes
      .split(',')
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n))
      .map(n => Math.round(n * MIB));
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
        alert(`Configuration error: ${error.message}`);
      }
      return;
    }
    try {
      const config = readConfigFromForm();
      store.dispatch({ type: 'RESET', config });
    } catch (e) {
      alert(e.message);
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
      store.dispatch({ type: 'RESET', config });
      setStatusBanner({
        type: 'success',
        message: 'Configuración aplicada al mapa de memoria física.'
      });
    } catch (e) {
      alert(`Configuration error: ${e.message}`);
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
        alert(res.details?.error || res.code);
      }
    } catch (e) {
      alert(`Cannot start simulation: ${e.message}`);
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

  elements.btnCompactTop.addEventListener('click', () => {
    const state = store.getState();
    openCompactionPreview(state, () => {
      const res = store.dispatch({ type: 'COMPACT_MEMORY' });
      if (res.ok) {
        setStatusBanner({
          type: 'success',
          message: `Compactación completada. Se desplazaron ${res.details.bytesMoved} bytes.`
        });
        announce('Memoria compactada correctamente.');
      }
    });
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
      alert(`Import error: ${res.details?.error || res.code}`);
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
    store.dispatch(config ? { type: 'RESET', config } : { type: 'RESET' });
    setStatusBanner({
      type: 'success',
      message: 'Simulación reiniciada. Configuración desbloqueada.'
    });
    announce('Simulación reiniciada.');
  });

  // 4. Queue Panel & Program Creation
  elements.btnRestoreDefaults.addEventListener('click', () => {
    store.dispatch({ type: 'RESTORE_DEFAULT_PROGRAMS' });
    setStatusBanner({ type: 'success', message: 'Programas predeterminados restaurados.' });
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
        alert('Please enter a valid program name.');
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
        alert(`Cannot create program: ${res.details?.error || res.code}`);
      }
    } catch (e) {
      alert(`Error creating program: ${e.message}`);
    }
  });

  // Delegated Queue Actions: Allocate & Terminate
  elements.queueList.addEventListener('click', e => {
    const allocBtn = e.target.closest('.btn-allocate');
    if (allocBtn) {
      const progId = allocBtn.getAttribute('data-id');
      const res = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: progId });

      if (res.ok) {
        setStatusBanner({
          type: 'success',
          message: `Programa ${progId} asignado correctamente.`
        });
        announce(`Programa ${progId} asignado`);
      } else {
        if (res.code === 'EXTERNAL_FRAGMENTATION') {
          setStatusBanner({
            type: 'warning',
            message: `Fragmentación externa: la memoria libre total es suficiente, pero ningún hueco individual tiene espacio para ${progId}.`,
            action: {
              label: 'Compactar y reintentar',
              primary: true,
              onClick: () => {
                const retryRes = store.dispatch({
                  type: 'COMPACT_AND_RETRY',
                  programId: progId
                });
                if (retryRes.ok) {
                  setStatusBanner({
                    type: 'success',
                    message: `Memoria compactada y programa ${progId} asignado correctamente.`
                  });
                  announce(`Memoria compactada y programa ${progId} asignado`);
                } else {
                  alert(`Retry failed: ${retryRes.details?.error || retryRes.code}`);
                }
              }
            }
          });
          announce(`External fragmentation for program ${progId}`);
        } else {
          setStatusBanner({
            type: 'error',
            message: `La asignación de ${progId} falló: ${res.details?.error || res.code}`
          });
          announce(`La asignación de ${progId} falló`);
        }
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
        alert(`Cannot terminate: ${res.details?.error || res.code}`);
      }
    }
  });

  // 5. Accessible Table Toggle
  elements.btnToggleTable.addEventListener('click', () => {
    const isHidden = elements.accessibleMemoryTableWrap.style.display === 'none';
    elements.accessibleMemoryTableWrap.style.display = isHidden ? 'block' : 'none';
    elements.btnToggleTable.textContent = isHidden ? 'Hide Table' : 'View as Table';
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
