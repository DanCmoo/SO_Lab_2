import { MemoryMode, MIB, TOTAL_MEMORY_BYTES } from '../domain/constants.js';
import { parseUnitToBytes, formatBytes } from '../domain/address.js';
import { elements } from './elements.js';
import {
  openModal,
  closeModal,
  openAlgorithmComparison
} from './dialogs.js';
import {
  resetCustomProgramForm,
  addSegmentRow,
  getCustomProgramDraft,
  recalculateConfigValues,
  recalculateCustomProgramSize
} from './forms.js';
import { setStatusBanner, renderApp } from './render.js';
import { initNoncontiguousUI, renderAttemptTrace } from './noncontiguous.js';
import { announce } from './accessibility.js';
import { describeError } from './error-messages.js';

function availableUserBytes() {
  const raw = elements.inputOsSize.value;
  return raw.trim() !== '' && Number(raw) === 0 ? 0 : parseUnitToBytes(raw, elements.selectOsUnit.value);
}

function fitPartitionInputsToMemory() {
  let userBytes;
  try {
    userBytes = TOTAL_MEMORY_BYTES - availableUserBytes();
  } catch (_error) {
    return;
  }
  if (userBytes <= 0) return;

  if (elements.selectMode.value === MemoryMode.STATIC_UNEQUAL) {
    const tokens = elements.inputUnequalSizes.value.split(',').map(value => value.trim()).filter(Boolean);
    const parsed = tokens.map(value => Number(value));
    if (!parsed.length || parsed.some(value => !Number.isFinite(value) || value <= 0)) {
      elements.inputUnequalSizes.value = `${userBytes / MIB}`;
      return;
    }

    const oldBytes = parsed.map(value => Math.round(value * MIB));
    const oldTotal = oldBytes.reduce((sum, value) => sum + value, 0);
    if (oldBytes.some(value => value <= 0) || oldTotal <= 0) {
      elements.inputUnequalSizes.value = `${userBytes / MIB}`;
      return;
    }
    if (oldTotal === userBytes) return;
    const count = Math.min(oldBytes.length, userBytes);
    const weights = oldBytes.slice(0, count);
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    const sizes = weights.map(value => Math.max(1, Math.floor(userBytes * value / weightTotal)));
    let delta = userBytes - sizes.reduce((sum, value) => sum + value, 0);
    for (let i = sizes.length - 1; delta !== 0; i = (i + sizes.length - 1) % sizes.length) {
      if (delta > 0) { sizes[i] += 1; delta -= 1; }
      else if (sizes[i] > 1) { sizes[i] -= 1; delta += 1; }
    }
    elements.inputUnequalSizes.value = sizes.map(bytes => String(bytes / MIB)).join(', ');
  }
}

/**
 * Construye la configuración de simulación a partir del formulario actual.
 * @returns {import('../domain/constants.js').SimulationConfig}
 */
function readConfigFromForm() {
  const mode = elements.selectMode.value;
  const algorithm = elements.selectAlgorithm.value;
  const osRaw = elements.inputOsSize.value;
  const osUnit = elements.selectOsUnit.value;
  const osBytes = osRaw.trim() !== '' && Number(osRaw) === 0 ? 0 : parseUnitToBytes(osRaw, osUnit);

  let equalPartitionSizeBytes = null;
  let unequalPartitionSizes = [];

  if (mode === MemoryMode.STATIC_EQUAL) {
    equalPartitionSizeBytes = parseUnitToBytes(elements.inputEqualSize.value, elements.selectEqualUnit.value);
  } else if (mode === MemoryMode.STATIC_UNEQUAL) {
    const rawTokens = elements.inputUnequalSizes.value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const sizesInMiB = rawTokens.map(Number);
    if (sizesInMiB.some(size => !Number.isFinite(size))) {
      throw new Error('Valor no numérico en "Tamaños desiguales": revisa la lista separada por comas.');
    }
    unequalPartitionSizes = sizesInMiB.map(size => parseUnitToBytes(size, 'MiB'));
  }

  return {
    mode,
    algorithm,
    osBytes,
    pageSizeBytes: mode === MemoryMode.PAGING ? Number(elements.selectPageSize.value) : null,
    equalPartitionSizeBytes,
    unequalPartitionSizes
  };
}

/**
 * Registra todos los controladores de eventos del DOM y de la interfaz.
 *
 * @param {Object} store
 */
export function initEvents(store) {
  initNoncontiguousUI(store);
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
    fitPartitionInputsToMemory();
    recalculateConfigValues();
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
  elements.inputOsSize.addEventListener('input', () => { fitPartitionInputsToMemory(); recalculateConfigValues(); });
  elements.selectOsUnit.addEventListener('change', () => { fitPartitionInputsToMemory(); recalculateConfigValues(); });
  elements.inputEqualSize.addEventListener('input', recalculateConfigValues);
  elements.selectEqualUnit.addEventListener('change', recalculateConfigValues);
  elements.inputUnequalSizes.addEventListener('input', recalculateConfigValues);
  elements.inputHeapSize.addEventListener('input', recalculateCustomProgramSize);
  elements.selectPageSize.addEventListener('change', () => {
    recalculateConfigValues();
    if (store.getState().phase === 'RUNNING') {
      try { pendingResetConfig = readConfigFromForm(); openModal(elements.dialogConfirmReset); }
      catch (error) { renderApp(store.getState(), store, { resetConfigInputs: true }); setStatusBanner({ type: 'error', message: describeError(error) }); }
    } else {
      try {
        const result = store.dispatch({ type: 'RESET', config: readConfigFromForm() });
        if (!result.ok) setStatusBanner({ type: 'error', message: describeError(result) });
      } catch (error) { setStatusBanner({ type: 'error', message: describeError(error) }); }
    }
  });
  elements.btnUndo.addEventListener('click', () => {
    const result = store.dispatch({ type: 'UNDO' });
    setStatusBanner({ type: result.ok ? 'success' : 'warning', message: result.ok ? 'Operación deshecha; memoria y tablas restauradas.' : 'No hay operaciones para deshacer.' });
  });
  elements.inputStackSize.addEventListener('input', recalculateCustomProgramSize);

  // 2. Start Simulation & Apply Config
  elements.btnApplyConfig.addEventListener('click', () => {
    try {
      const config = readConfigFromForm();
      if (store.getState().phase === 'RUNNING') {
        pendingResetConfig = config;
        openModal(elements.dialogConfirmReset);
        return;
      }
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
          message: 'Simulación iniciada. Ya puedes ejecutar programas. Cambiar la configuración requiere confirmar un reinicio.'
        });
        announce('Simulación iniciada.');
      } else {
        setStatusBanner({ type: 'error', message: `No se puede iniciar la simulación: ${describeError(res)}` });
      }
    } catch (e) {
      setStatusBanner({ type: 'error', message: `No se puede iniciar la simulación: ${describeError(e)}` });
    }
  });

  // 3. Top Action Buttons
  elements.btnCompare.addEventListener('click', () => {
    openAlgorithmComparison(store.getState());
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
          message: `Programa ${draft.name} creado. Añadido al catálogo.`
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
  elements.programsPanel.addEventListener('click', e => {
    const deleteBtn = e.target.closest('.btn-delete-program');
    if (deleteBtn) {
      const res = store.dispatch({ type: 'DELETE_PROGRAM', programId: deleteBtn.dataset.id });
      const message = res.ok ? `Programa ${res.details.name} eliminado del catálogo. Puedes recuperarlo con Deshacer.` : describeError(res);
      setStatusBanner({ type: res.ok ? 'success' : 'error', message });
      announce(message);
      return;
    }
    const allocBtn = e.target.closest('.btn-allocate');
    if (allocBtn) {
      const progId = allocBtn.getAttribute('data-id');
      const programName = store.getState().programs.find(program => program.id === progId)?.name || progId;
      const res = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: progId });

      if (res.ok) {
        const allocatedName = res.state.programs.find(program => program.id === res.details.programId)?.name || programName;
        setStatusBanner({
          type: 'success',
          message: `Ejecución ${allocatedName} iniciada. El SO reservó su memoria.`
        });
        announce(`Ejecución ${allocatedName} iniciada`);
      } else if (res.code === 'EXTERNAL_FRAGMENTATION') {
        setStatusBanner({
          type: 'warning',
          message: res.details.regionName ? `No cabe la región ${res.details.regionName} con la estrategia actual. Revisa la traza de los huecos intentados; el proceso no se cargó parcialmente.` : `Fragmentación externa: la memoria libre total es suficiente, pero ningún hueco individual tiene espacio para ${programName}. ${res.state.config.mode === MemoryMode.DYNAMIC_COMPACTION ? 'La compactación se realiza al terminar un proceso.' : 'Este modo no compacta memoria.'}`
        });
        announce(`Fragmentación externa para el programa ${programName}`);
      } else {
        setStatusBanner({
          type: 'error',
          message: `La asignación de ${programName} falló: ${describeError(res, { programId: programName })}`
        });
        announce(`La asignación de ${programName} falló`);
      }
      if (!res.ok && res.details?.trace) renderAttemptTrace(res.details.trace);
      return;
    }

    const termBtn = e.target.closest('.btn-terminate');
    if (termBtn) {
      const progId = termBtn.getAttribute('data-id');
      const processName = store.getState().programs.find(program => program.id === progId)?.name || progId;
      const res = store.dispatch({ type: 'TERMINATE_PROGRAM', programId: progId });
      if (res.ok) {
        const mode = res.state.config.mode;
        const releaseNote = mode === MemoryMode.PAGING ? ' Marcos liberados.' : mode === MemoryMode.SEGMENTATION ? ' Segmentos liberados y huecos adyacentes fusionados.' : mode === MemoryMode.DYNAMIC_NO_COMPACTION ? ' Huecos adyacentes fusionados.' : ' Partición liberada.';
        setStatusBanner({
          type: 'success',
          message: `Ejecución ${processName} terminada. Memoria de imagen, heap y stack liberada.${res.details.autoCompacted ? ` Compactación automática completada: ${formatBytes(res.details.compactionBytesMoved)} desplazados.` : releaseNote}`
        });
        announce(`Ejecución ${processName} terminada.${res.details.autoCompacted ? ' Memoria compactada automáticamente.' : ''}`);
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
      if (dialog === elements.dialogConfirmReset) {
        pendingResetConfig = null;
        renderApp(store.getState(), store, { resetConfigInputs: true });
      }
    });
  });
  elements.dialogConfirmReset.addEventListener('cancel', () => {
    pendingResetConfig = null;
    renderApp(store.getState(), store, { resetConfigInputs: true });
  });
}
