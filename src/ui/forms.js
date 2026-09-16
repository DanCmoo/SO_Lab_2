import { MemoryMode, TOTAL_MEMORY_BYTES, MIB, KIB } from '../domain/constants.js';
import { parseUnitToBytes, formatBytes } from '../domain/address.js';
import { elements } from './elements.js';

/**
 * Updates form visibility and calculates partition sizes live.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 */
export function updateConfigFormVisibility(state) {
  const mode = elements.selectMode.value;
  const isConfiguring = state.phase === 'CONFIGURING';

  // Toggle algorithm selector based on mode
  if (mode === MemoryMode.STATIC_EQUAL) {
    elements.selectAlgorithm.disabled = true;
    elements.selectAlgorithm.title = 'All partitions are equal; allocation always assigns lowest-address free partition';
  } else {
    elements.selectAlgorithm.disabled = false;
    elements.selectAlgorithm.title = 'Select allocation policy';
  }

  // Toggle mode-specific inputs
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

  // Enable/disable configuration inputs based on simulation phase
  elements.selectMode.disabled = !isConfiguring;
  elements.inputOsSize.disabled = !isConfiguring;
  elements.selectOsUnit.disabled = !isConfiguring;
  elements.inputEqualCount.disabled = !isConfiguring;
  elements.inputUnequalSizes.disabled = !isConfiguring;
  elements.btnApplyConfig.disabled = !isConfiguring;

  recalculateConfigValues();
}

/**
 * Recalculates and displays live partition sums/sizes in the configuration card.
 */
export function recalculateConfigValues() {
  const osRaw = elements.inputOsSize.value;
  const osUnit = elements.selectOsUnit.value;
  let osBytes = 1 * MIB;
  try {
    osBytes = parseUnitToBytes(osRaw, osUnit);
  } catch (_e) {
    // fallback
  }

  const userBytes = Math.max(0, TOTAL_MEMORY_BYTES - osBytes);
  const mode = elements.selectMode.value;

  if (mode === MemoryMode.STATIC_EQUAL) {
    const count = parseInt(elements.inputEqualCount.value, 10) || 5;
    if (count > 0 && userBytes % count === 0) {
      const partSize = userBytes / count;
      elements.txtEqualCalc.textContent = `Each: ${formatBytes(partSize)}`;
      elements.txtEqualCalc.style.color = 'var(--color-muted)';
    } else {
      elements.txtEqualCalc.textContent = `Invalid: ${formatBytes(userBytes)} not divisible by ${count}`;
      elements.txtEqualCalc.style.color = 'var(--color-danger)';
    }
  } else if (mode === MemoryMode.STATIC_UNEQUAL) {
    const sizesStr = elements.inputUnequalSizes.value;
    const parts = sizesStr.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    const totalMiB = parts.reduce((acc, v) => acc + v, 0);
    const totalBytes = totalMiB * MIB;
    elements.txtUnequalCalc.textContent = `Sum: ${totalMiB} MiB / ${userBytes / MIB} MiB user memory`;
    if (totalBytes === userBytes) {
      elements.txtUnequalCalc.style.color = 'var(--color-success)';
    } else {
      elements.txtUnequalCalc.style.color = 'var(--color-danger)';
    }
  }
}

/**
 * Initializes the Custom Program creation dialog with default segment rows.
 */
export function resetCustomProgramForm() {
  elements.inputProgName.value = '';
  elements.newProgSegmentsList.innerHTML = '';

  // Default segment template (Code, Data, Heap, Stack)
  const defaultSegments = [
    { name: 'Code', size: 512, unit: 'KiB' },
    { name: 'Data', size: 256, unit: 'KiB' },
    { name: 'Heap', size: 256, unit: 'KiB' },
    { name: 'Stack', size: 256, unit: 'KiB' }
  ];

  for (const seg of defaultSegments) {
    addSegmentRow(seg.name, seg.size, seg.unit);
  }

  recalculateCustomProgramSize();
}

/**
 * Adds a new segment row to the Custom Program modal.
 * @param {string} [name='New Segment']
 * @param {number} [size=256]
 * @param {'B'|'KiB'|'MiB'} [unit='KiB']
 */
export function addSegmentRow(name = 'New Segment', size = 256, unit = 'KiB') {
  const row = document.createElement('div');
  row.className = 'segment-row';
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.alignItems = 'center';

  row.innerHTML = `
    <input type="text" class="seg-name" value="${name}" placeholder="Segment name" style="flex: 2;" required>
    <input type="number" class="seg-size" value="${size}" min="1" step="any" style="flex: 1;" required>
    <select class="seg-unit" style="width: 75px;">
      <option value="B" ${unit === 'B' ? 'selected' : ''}>Bytes</option>
      <option value="KiB" ${unit === 'KiB' ? 'selected' : ''}>KiB</option>
      <option value="MiB" ${unit === 'MiB' ? 'selected' : ''}>MiB</option>
    </select>
    <button type="button" class="btn-sm btn-danger btn-remove-seg" title="Remove segment">&times;</button>
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
 * Recalculates the total size of the custom program draft.
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
      // ignore parsing errors during editing
    }
  }

  elements.txtCalcProgSize.textContent = formatBytes(totalBytes);
}

/**
 * Reads and returns the custom program draft from the dialog form.
 * @returns {{ name: string, segments: Array<{ name: string, sizeBytes: number }> }}
 */
export function getCustomProgramDraft() {
  const name = elements.inputProgName.value.trim();
  const rows = elements.newProgSegmentsList.querySelectorAll('.segment-row');
  const segments = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const segName = r.querySelector('.seg-name').value.trim() || `Segment ${i + 1}`;
    const sizeVal = r.querySelector('.seg-size').value;
    const unit = r.querySelector('.seg-unit').value;
    const sizeBytes = parseUnitToBytes(sizeVal, unit);
    segments.push({
      id: `SEG-${Date.now()}-${i + 1}`,
      name: segName,
      sizeBytes
    });
  }

  return { name, segments };
}
