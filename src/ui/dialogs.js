import { toHexAddress, formatBytes } from '../domain/address.js';
import { compactMemory, canCompactMemory } from '../engine/compaction.js';
import { compareAlgorithms } from '../engine/comparison.js';
import { exportScenario } from '../state/persistence.js';
import { MemoryMode } from '../domain/constants.js';
import { elements } from './elements.js';

/**
 * Abre un diálogo modal de forma segura.
 * @param {HTMLDialogElement} dialog
 */
export function openModal(dialog) {
  if (typeof dialog?.showModal === 'function') {
    dialog.showModal();
  } else if (dialog) {
    dialog.setAttribute('open', '');
  }
}

/**
 * Cierra un diálogo modal de forma segura.
 * @param {HTMLDialogElement} dialog
 */
export function closeModal(dialog) {
  if (typeof dialog?.close === 'function') {
    dialog.close();
  } else if (dialog) {
    dialog.removeAttribute('open');
  }
}

/**
 * Abre y renderiza el diálogo de vista previa de compactación.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {() => void} onConfirm
 */
export function openCompactionPreview(state, onConfirm) {
  const check = canCompactMemory(state);
  if (!check.canCompact) {
    alert(check.reason || 'No se puede realizar la compactación.');
    return;
  }

  const { relocations, bytesMoved } = compactMemory(state);

  elements.compactPreviewList.innerHTML = '';
  if (relocations.length === 0) {
    elements.compactPreviewList.innerHTML = '<p class="text-muted">No es necesario reubicar procesos.</p>';
  } else {
    const list = document.createElement('ul');
    list.style.listStyle = 'none';
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '8px';

    for (const rel of relocations) {
      const item = document.createElement('li');
      item.style.padding = '8px';
      item.style.border = '1px solid var(--color-border)';
      item.style.borderRadius = 'var(--radius-sm)';
      item.style.backgroundColor = 'var(--color-surface-strong)';
      item.innerHTML = `
        <strong>${rel.programName} (${rel.programId})</strong> [${formatBytes(rel.sizeBytes)}]<br>
        <span class="font-mono text-muted">${toHexAddress(rel.oldStart)} &rarr; ${toHexAddress(rel.newStart)}</span>
      `;
      list.appendChild(item);
    }
    elements.compactPreviewList.appendChild(list);
  }

  elements.txtCompactBytes.textContent = formatBytes(bytesMoved);

  // Configura el controlador de confirmación de un solo uso.
  elements.btnConfirmCompaction.onclick = () => {
    closeModal(elements.dialogCompactPreview);
    onConfirm();
  };

  openModal(elements.dialogCompactPreview);
}

/**
 * Abre y renderiza el diálogo de comparación de tres algoritmos.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 */
export function openAlgorithmComparison(state) {
  const comparisonResults = compareAlgorithms(state);
  const isStaticEqual = state.config.mode === MemoryMode.STATIC_EQUAL;

  let noteHtml = '';
  if (isStaticEqual) {
    noteHtml = `
      <div class="alert-banner alert-warning" style="margin-bottom: 16px;">
        Nota: con particiones estáticas iguales, todos los algoritmos seleccionan la partición libre de menor dirección y producen asignaciones idénticas.
      </div>
    `;
  }

  const [firstFit, bestFit, worstFit] = comparisonResults;

  const tableHtml = `
    ${noteHtml}
    <div style="overflow-x: auto;">
      <table class="accessible-table" style="width: 100%;">
        <thead>
          <tr>
            <th>Métrica de simulación</th>
            <th>Primer ajuste</th>
            <th>Mejor ajuste</th>
            <th>Peor ajuste</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Asignaciones exitosas</strong></td>
            <td>${firstFit.allocatedCount}</td>
            <td>${bestFit.allocatedCount}</td>
            <td>${worstFit.allocatedCount}</td>
          </tr>
          <tr>
            <td><strong>Asignaciones rechazadas</strong></td>
            <td>${firstFit.rejectedCount}</td>
            <td>${bestFit.rejectedCount}</td>
            <td>${worstFit.rejectedCount}</td>
          </tr>
          <tr>
            <td><strong>Fragmentación interna total</strong></td>
            <td class="font-mono">${formatBytes(firstFit.internalFragmentationBytes)}</td>
            <td class="font-mono">${formatBytes(bestFit.internalFragmentationBytes)}</td>
            <td class="font-mono">${formatBytes(worstFit.internalFragmentationBytes)}</td>
          </tr>
          <tr>
            <td><strong>Memoria libre externa</strong></td>
            <td class="font-mono">${formatBytes(firstFit.freeBytes)}</td>
            <td class="font-mono">${formatBytes(bestFit.freeBytes)}</td>
            <td class="font-mono">${formatBytes(worstFit.freeBytes)}</td>
          </tr>
          <tr>
            <td><strong>Mayor hueco / partición libre</strong></td>
            <td class="font-mono">${formatBytes(firstFit.largestFreeBlockBytes)}</td>
            <td class="font-mono">${formatBytes(bestFit.largestFreeBlockBytes)}</td>
            <td class="font-mono">${formatBytes(worstFit.largestFreeBlockBytes)}</td>
          </tr>
          <tr>
            <td><strong>Número de huecos / particiones libres</strong></td>
            <td>${firstFit.freeBlockCount}</td>
            <td>${bestFit.freeBlockCount}</td>
            <td>${worstFit.freeBlockCount}</td>
          </tr>
          <tr>
            <td><strong>Total de inspecciones</strong></td>
            <td><strong>${firstFit.totalProbes}</strong></td>
            <td><strong>${bestFit.totalProbes}</strong></td>
            <td><strong>${worstFit.totalProbes}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  elements.compareModalContent.innerHTML = tableHtml;
  openModal(elements.dialogCompare);
}

/**
 * Inicia la descarga del archivo JSON del escenario en el navegador.
 * @param {import('../domain/constants.js').SimulationState} state
 */
export function triggerExportScenario(state) {
  const jsonStr = exportScenario(state);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `simulation-scenario-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
