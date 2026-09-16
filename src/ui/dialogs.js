import { toHexAddress, formatBytes } from '../domain/address.js';
import { compactMemory, canCompactMemory } from '../engine/compaction.js';
import { compareAlgorithms } from '../engine/comparison.js';
import { exportScenario } from '../state/persistence.js';
import { MemoryMode } from '../domain/constants.js';
import { elements } from './elements.js';

/**
 * Safely opens a modal dialog.
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
 * Safely closes a modal dialog.
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
 * Opens and renders the Compaction Preview modal.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {() => void} onConfirm
 */
export function openCompactionPreview(state, onConfirm) {
  const check = canCompactMemory(state);
  if (!check.canCompact) {
    alert(check.reason || 'Compaction cannot be performed.');
    return;
  }

  const { relocations, bytesMoved } = compactMemory(state);

  elements.compactPreviewList.innerHTML = '';
  if (relocations.length === 0) {
    elements.compactPreviewList.innerHTML = '<p class="text-muted">No processes need relocation.</p>';
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

  // Set one-time confirm handler
  elements.btnConfirmCompaction.onclick = () => {
    closeModal(elements.dialogCompactPreview);
    onConfirm();
  };

  openModal(elements.dialogCompactPreview);
}

/**
 * Opens and renders the 3-way Algorithm Comparison modal.
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
        Note: Under equal static partitions, all algorithms select the lowest-address free partition and produce identical allocations.
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
            <th>Simulation Metric</th>
            <th>First Fit</th>
            <th>Best Fit</th>
            <th>Worst Fit</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Successful Allocations</strong></td>
            <td>${firstFit.allocatedCount}</td>
            <td>${bestFit.allocatedCount}</td>
            <td>${worstFit.allocatedCount}</td>
          </tr>
          <tr>
            <td><strong>Rejected Allocations</strong></td>
            <td>${firstFit.rejectedCount}</td>
            <td>${bestFit.rejectedCount}</td>
            <td>${worstFit.rejectedCount}</td>
          </tr>
          <tr>
            <td><strong>Total Internal Fragmentation</strong></td>
            <td class="font-mono">${formatBytes(firstFit.internalFragmentationBytes)}</td>
            <td class="font-mono">${formatBytes(bestFit.internalFragmentationBytes)}</td>
            <td class="font-mono">${formatBytes(worstFit.internalFragmentationBytes)}</td>
          </tr>
          <tr>
            <td><strong>External Free Memory</strong></td>
            <td class="font-mono">${formatBytes(firstFit.freeBytes)}</td>
            <td class="font-mono">${formatBytes(bestFit.freeBytes)}</td>
            <td class="font-mono">${formatBytes(worstFit.freeBytes)}</td>
          </tr>
          <tr>
            <td><strong>Largest Free Hole / Partition</strong></td>
            <td class="font-mono">${formatBytes(firstFit.largestFreeBlockBytes)}</td>
            <td class="font-mono">${formatBytes(bestFit.largestFreeBlockBytes)}</td>
            <td class="font-mono">${formatBytes(worstFit.largestFreeBlockBytes)}</td>
          </tr>
          <tr>
            <td><strong>Number of Free Holes / Partitions</strong></td>
            <td>${firstFit.freeBlockCount}</td>
            <td>${bestFit.freeBlockCount}</td>
            <td>${worstFit.freeBlockCount}</td>
          </tr>
          <tr>
            <td><strong>Total Search Probes</strong></td>
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
 * Triggers browser download of scenario JSON file.
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
