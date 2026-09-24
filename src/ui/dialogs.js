import { toHexAddress, formatBytes } from '../domain/address.js';
import { compareAlgorithms } from '../engine/comparison.js';
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
 * Abre y renderiza el diálogo de comparación de tres algoritmos.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 */
export function openAlgorithmComparison(state) {
  const comparisonResults = compareAlgorithms(state);

  const [firstFit, bestFit, worstFit] = comparisonResults;

  const tableHtml = `
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
