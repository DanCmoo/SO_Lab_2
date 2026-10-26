import { MemoryMode, TOTAL_MEMORY_BYTES, MIB, KIB } from '../domain/constants.js';
import { parseUnitToBytes, formatBytes } from '../domain/address.js';
import { elements } from './elements.js';
import { escapeHTML } from './safe-html.js';

/**
 * Actualiza la visibilidad del formulario y calcula los tamaños de partición en tiempo real.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 */
export function updateConfigFormVisibility(state) {
  const mode = elements.selectMode.value;
  const isConfiguring = state.phase === 'CONFIGURING';

  // Activa o desactiva el selector de algoritmo según el modo.
  if (mode === MemoryMode.STATIC_EQUAL || mode === MemoryMode.PAGING) {
    elements.selectAlgorithm.disabled = true;
    elements.selectAlgorithm.title = 'Todas las particiones son iguales; la asignación siempre usa la partición libre de menor dirección';
    if (mode === MemoryMode.PAGING) elements.selectAlgorithm.title = 'Los marcos tienen igual capacidad; se usan marcos libres en orden ascendente.';
  } else {
    elements.selectAlgorithm.disabled = false;
    elements.selectAlgorithm.title = 'Selecciona la política de asignación';
  }

  // Muestra u oculta los campos específicos del modo.
  if (mode === MemoryMode.STATIC_EQUAL) {
    elements.groupEqualConfig.style.display = 'flex';
    elements.groupUnequalConfig.style.display = 'none';
  } else if (mode === MemoryMode.STATIC_UNEQUAL) {
    elements.groupEqualConfig.style.display = 'none';
    elements.groupUnequalConfig.style.display = 'flex';
  } else {
    elements.groupEqualConfig.style.display = 'none';
    elements.groupUnequalConfig.style.display = 'none';
  }

  // Activa o desactiva los campos según la fase de la simulación.
  elements.selectMode.disabled = false;
  elements.inputOsSize.disabled = false;
  elements.selectOsUnit.disabled = false;
  elements.groupPageConfig.hidden = mode !== MemoryMode.PAGING;
  elements.selectPageSize.disabled = false;
  elements.btnCompare.disabled = mode === MemoryMode.PAGING;
  elements.btnApplyConfig.disabled = false;
  elements.modeHelp.textContent = mode === MemoryMode.PAGING
    ? 'Marcos libres en orden ascendente. Todos tienen igual capacidad: primer/mejor/peor ajuste no aplican. Carga completa, tabla de un nivel; sin TLB, demanda ni reemplazo.'
    : mode === MemoryMode.SEGMENTATION ? 'Cada región se asigna por separado con base, límite y permisos. Carga completa, sin compactación ni crecimiento durante la ejecución.' : '';
  elements.inputEqualSize.disabled = !isConfiguring;
  elements.selectEqualUnit.disabled = !isConfiguring;
  elements.inputUnequalSizes.disabled = !isConfiguring;

  recalculateConfigValues();
}

/**
 * Recalcula y muestra las sumas y tamaños de partición en la tarjeta de configuración.
 */
export function recalculateConfigValues() {
  const osRaw = elements.inputOsSize.value;
  const osUnit = elements.selectOsUnit.value;
  let osBytes = 1 * MIB;
  try {
    osBytes = osRaw.trim() !== '' && Number(osRaw) === 0 ? 0 : parseUnitToBytes(osRaw, osUnit);
  } catch (_e) {
    if (elements.selectMode.value === MemoryMode.PAGING) {
      elements.modeHelp.textContent = 'Reserva del SO inválida: introduce un tamaño en bytes enteros, desde 0 y menor que 16 MiB.';
      return;
    }
    // Usa el valor predeterminado si la entrada no es válida.
  }

  const userBytes = Math.max(0, TOTAL_MEMORY_BYTES - osBytes);
  const mode = elements.selectMode.value;
  if (mode === MemoryMode.PAGING) {
    const Q = Number(elements.selectPageSize.value);
    if (osBytes < 0 || osBytes >= TOTAL_MEMORY_BYTES) {
      elements.modeHelp.textContent = 'Reserva del SO inválida: debe ser desde 0 y menor que 16 MiB.';
      return;
    }
    if (osBytes % Q !== 0) {
      elements.modeHelp.textContent = `Configuración inválida: la reserva del SO debe ser múltiplo del tamaño de página (${formatBytes(Q)}). El mapa conserva la última configuración aplicada.`;
      return;
    }
    elements.modeHelp.textContent = `RAM: 16 MiB · SO: ${formatBytes(osBytes)} · Usuario: ${formatBytes(userBytes)} · ${TOTAL_MEMORY_BYTES / Q} marcos totales · ${osBytes / Q} del SO. Marcos libres en orden ascendente: todos tienen igual capacidad; los ajustes no aplican. Carga completa de un nivel, sin TLB, demanda, reemplazo ni crecimiento. Tablas como metadatos sin coste adicional simulado.`;
  }
  if (mode === MemoryMode.SEGMENTATION) elements.modeHelp.textContent = `RAM: 16 MiB · SO: ${formatBytes(osBytes)} · Usuario: ${formatBytes(userBytes)}. Cada región tiene base, límite y permisos. Carga completa, sin compactación, crecimiento ni memoria compartida. La pila usa base inferior y desplazamientos crecientes. Tablas como metadatos sin coste adicional simulado.`;

  if (mode === MemoryMode.STATIC_EQUAL) {
    try {
      const partSize = parseUnitToBytes(elements.inputEqualSize.value, elements.selectEqualUnit.value);
      const count = Math.floor(userBytes / partSize);
      if (count < 1) throw new Error('Partition exceeds user memory');
      const remainder = userBytes % partSize;
      elements.txtEqualCalc.textContent = `${count} particiones de ${formatBytes(partSize)}${remainder ? ` · Sin particionar: ${formatBytes(remainder)} (no asignable)` : ''}`;
      elements.txtEqualCalc.style.color = 'var(--color-muted)';
    } catch (_error) {
      elements.txtEqualCalc.textContent = `Introduce un tamaño positivo de hasta ${formatBytes(userBytes)}, sin fracciones de byte.`;
      elements.txtEqualCalc.style.color = 'var(--color-danger)';
    }
  } else if (mode === MemoryMode.STATIC_UNEQUAL) {
    const sizesStr = elements.inputUnequalSizes.value;
    const rawTokens = sizesStr.split(',').map(s => s.trim()).filter(Boolean);
    const parts = rawTokens.map(Number);
    if (parts.some(size => !Number.isFinite(size))) {
      elements.txtUnequalCalc.textContent = 'No válido: introduce únicamente números separados por comas.';
      elements.txtUnequalCalc.style.color = 'var(--color-danger)';
      return;
    }
    const totalMiB = parts.reduce((acc, v) => acc + v, 0);
    const totalBytes = totalMiB * MIB;
    elements.txtUnequalCalc.textContent = `Suma: ${totalMiB} MiB / ${userBytes / MIB} MiB de memoria de usuario`;
    if (totalBytes === userBytes) {
      elements.txtUnequalCalc.style.color = 'var(--color-success)';
    } else {
      elements.txtUnequalCalc.style.color = 'var(--color-danger)';
    }
  }
}

/**
 * Inicializa el diálogo de creación de programas con filas de segmentos predeterminadas.
 */
export function resetCustomProgramForm() {
  elements.inputProgName.value = '';
  elements.newProgSegmentsList.innerHTML = '';
  elements.inputHeapSize.value = '256';
  elements.inputStackSize.value = '256';

  // Solo la imagen del programa; heap y stack se solicitan aparte al SO.
  const defaultSegments = [
    { name: 'Code', size: 512, unit: 'KiB' },
    { name: 'Data', size: 256, unit: 'KiB' }
  ];

  for (const seg of defaultSegments) {
    addSegmentRow(seg.name, seg.size, seg.unit);
  }

  recalculateCustomProgramSize();
}

/**
 * Añade una fila de segmento al diálogo de programa personalizado.
 * @param {string} [name='Nuevo segmento']
 * @param {number} [size=256]
 * @param {'B'|'KiB'|'MiB'} [unit='KiB']
 */
export function addSegmentRow(name = 'Nuevo segmento', size = 256, unit = 'KiB') {
  const row = document.createElement('div');
  row.className = 'segment-row';
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.alignItems = 'center';

  row.innerHTML = `
    <input type="text" class="seg-name" value="${escapeHTML(name)}" placeholder="Nombre del segmento" style="flex: 2;" required>
    <input type="number" class="seg-size" value="${size}" min="1" step="any" style="flex: 1;" required>
    <select class="seg-unit" style="width: 75px;">
      <option value="B" ${unit === 'B' ? 'selected' : ''}>Bytes</option>
      <option value="KiB" ${unit === 'KiB' ? 'selected' : ''}>KiB</option>
      <option value="MiB" ${unit === 'MiB' ? 'selected' : ''}>MiB</option>
    </select>
    <button type="button" class="btn-sm btn-danger btn-remove-seg" title="Eliminar segmento">&times;</button>
    <span class="segment-permissions">${['read', 'write', 'execute'].map((key, i) => `<label><input type="checkbox" class="seg-${key}" ${key === 'read' || (name === 'Code' ? key === 'execute' : key === 'write') ? 'checked' : ''}>${['R', 'W', 'X'][i]}</label>`).join('')}</span>
  `;

  row.querySelector('.seg-name').addEventListener('input', recalculateCustomProgramSize);
  row.querySelector('.seg-size').addEventListener('input', recalculateCustomProgramSize);
  row.querySelector('.seg-unit').addEventListener('change', recalculateCustomProgramSize);
  row.querySelector('.btn-remove-seg').addEventListener('click', () => {
    if (elements.newProgSegmentsList.children.length > 1) {
      row.remove();
      recalculateCustomProgramSize();
    }
  });

  elements.newProgSegmentsList.appendChild(row);
  recalculateCustomProgramSize();
}

/**
 * Recalcula el tamaño total del borrador de programa personalizado.
 */
export function recalculateCustomProgramSize() {
  let totalBytes = 0;
  const rows = elements.newProgSegmentsList.querySelectorAll('.segment-row');

  for (const r of rows) {
    const sizeVal = r.querySelector('.seg-size').value;
    const unit = r.querySelector('.seg-unit').value;
    try {
      totalBytes += parseUnitToBytes(sizeVal, unit);
    } catch (_e) {
      // Ignora los errores de análisis mientras se edita.
    }
  }

  try {
    const runtimeMemory = readRuntimeMemory();
    totalBytes += runtimeMemory.heapBytes + runtimeMemory.stackBytes;
  } catch (_error) {
    // El dominio valida las reservas al guardar.
  }
  elements.txtCalcProgSize.textContent = formatBytes(totalBytes);
}

function readRuntimeMemory() {
  const parseReservation = input => input.value.trim() === '' ? NaN : Number(input.value) === 0 ? 0 : parseUnitToBytes(input.value, 'KiB');
  return { heapBytes: parseReservation(elements.inputHeapSize), stackBytes: parseReservation(elements.inputStackSize) };
}

/**
 * Lee y devuelve el borrador del programa personalizado del formulario.
 * @returns {{ name: string, segments: Array<{ name: string, sizeBytes: number }>, runtimeMemory: {heapBytes:number, stackBytes:number} }}
 */
export function getCustomProgramDraft() {
  const name = elements.inputProgName.value.trim();
  const rows = elements.newProgSegmentsList.querySelectorAll('.segment-row');
  const segments = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const segName = r.querySelector('.seg-name').value.trim() || `Segmento ${i + 1}`;
    const sizeVal = r.querySelector('.seg-size').value;
    const unit = r.querySelector('.seg-unit').value;
    const sizeBytes = parseUnitToBytes(sizeVal, unit);
    segments.push({
      id: `SEG-${Date.now()}-${i + 1}`,
      name: segName,
      permissions: { read: r.querySelector('.seg-read').checked, write: r.querySelector('.seg-write').checked, execute: r.querySelector('.seg-execute').checked },
      sizeBytes
    });
  }

  return { name, segments, runtimeMemory: readRuntimeMemory() };
}
