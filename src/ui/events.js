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
  recalculateConfigValues
} from './forms.js';
import { setStatusBanner } from './render.js';
import { announce } from './accessibility.js';
import { describeError } from './error-messages.js';

function availableUserBytes() {
  return parseUnitToBytes(elements.inputOsSize.value, elements.selectOsUnit.value);
}

function fitPartitionInputsToMemory() {
  let userBytes;
  try {
    userBytes = TOTAL_MEMORY_BYTES - availableUserBytes();
  } catch (_error) {
    return;
  }
  if (userBytes <= 0) return;

  if (elements.selectMode.value === MemoryMode.STATIC_EQUAL) {
    let count = Number.parseInt(elements.inputEqualCount.value, 10);
    if (!Number.isSafeInteger(count) || count < 1) count = 1;
    count = Math.min(count, userBytes);
    while (userBytes % count !== 0) count -= 1;
    elements.inputEqualCount.value = String(count);
  } else if (elements.selectMode.value === MemoryMode.STATIC_UNEQUAL) {
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
      const programName = store.getState().programs.find(program => program.id === progId)?.name || progId;
      const res = store.dispatch({ type: 'ALLOCATE_PROGRAM', programId: progId });

      if (res.ok) {
        if (res.details.autoCompacted) {
          setStatusBanner({
            type: 'success',
            message: `Fragmentación externa detectada: la memoria se compactó automáticamente (se desplazaron ${formatBytes(res.details.compactionBytesMoved)}) y ${programName} quedó asignado.`
          });
          announce(`Memoria compactada automáticamente. Programa ${programName} asignado.`);
        } else {
          setStatusBanner({
            type: 'success',
            message: `Programa ${programName} asignado correctamente.`
          });
          announce(`Programa ${programName} asignado`);
        }
      } else if (res.code === 'EXTERNAL_FRAGMENTATION') {
        // Solo puede ocurrir en DYNAMIC_NO_COMPACTION: es un fallo permanente y real,
        // por diseño ese modo no compacta. No se ofrece ninguna acción de reintento manual.
        setStatusBanner({
          type: 'warning',
          message: `Fragmentación externa: la memoria libre total es suficiente, pero ningún hueco individual tiene espacio para ${programName}. Este modo no compacta memoria.`
        });
        announce(`Fragmentación externa para el programa ${programName}`);
      } else {
        setStatusBanner({
          type: 'error',
          message: `La asignación de ${programName} falló: ${describeError(res, { programId: programName })}`
        });
        announce(`La asignación de ${programName} falló`);
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
