import { MemoryMode, BlockKind, ProgramStatus } from '../domain/constants.js';
import { toHexAddress, formatBytes } from '../domain/address.js';
import { deriveMetrics } from '../domain/metrics.js';
import { canCompactMemory, layoutSegments } from '../engine/compaction.js';
import { renderMemoryMap } from './memory-map.js';
import { updateConfigFormVisibility } from './forms.js';
import { elements } from './elements.js';

/**
 * Main rendering coordinator projecting SimulationState into the DOM.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {Object} store
 */
export function renderApp(state, store) {
  const { config, phase, programs, blocks, history, selectedId } = state;
  const isRunning = phase === 'RUNNING';

  // 1. Synchronize Top Bar Controls
  if (elements.selectMode.value !== config.mode) {
    elements.selectMode.value = config.mode;
  }
  if (elements.selectAlgorithm.value !== config.algorithm) {
    elements.selectAlgorithm.value = config.algorithm;
  }

  elements.btnUndo.disabled = !store.canUndo();

  if (isRunning) {
    elements.btnStartSim.textContent = 'Running';
    elements.btnStartSim.disabled = true;
    elements.badgeSimPhase.textContent = 'Running';
    elements.badgeSimPhase.className = 'badge badge-allocated';
  } else {
    elements.btnStartSim.textContent = 'Start simulation';
    elements.btnStartSim.disabled = false;
    elements.badgeSimPhase.textContent = 'Configuring';
    elements.badgeSimPhase.className = 'badge badge-ready';
  }

  const compactCheck = canCompactMemory(state);
  elements.btnCompactTop.disabled = !compactCheck.canCompact;

  // 2. Configuration Form State
  updateConfigFormVisibility(state);

  // 3. Render Ready Queue
  const queueFragment = document.createDocumentFragment();
  for (const prog of programs) {
    const item = document.createElement('div');
    item.className = 'queue-item';
    if (prog.colorToken) {
      item.style.setProperty('--prog-color', prog.colorToken);
    }

    let statusBadgeClass = 'badge-ready';
    if (prog.status === ProgramStatus.ALLOCATED) statusBadgeClass = 'badge-allocated';
    if (prog.status === ProgramStatus.TERMINATED) statusBadgeClass = 'badge-terminated';

    const segmentSummary = prog.segments.map(s => `${s.name} ${formatBytes(s.sizeBytes)}`).join(', ');

    let actionBtnHtml = '';
    if (prog.status === ProgramStatus.READY) {
      actionBtnHtml = `<button class="btn-sm btn-primary btn-allocate" data-id="${prog.id}" type="button">Allocate</button>`;
    } else if (prog.status === ProgramStatus.ALLOCATED) {
      actionBtnHtml = `<button class="btn-sm btn-danger btn-terminate" data-id="${prog.id}" type="button">Terminate</button>`;
    }

    item.innerHTML = `
      <div class="queue-item-info">
        <div class="queue-item-title">
          <span>${prog.name}</span>
          <span class="badge ${statusBadgeClass}">${prog.status}</span>
        </div>
        <div class="queue-item-sub">
          <strong>${formatBytes(prog.sizeBytes)}</strong> &bull; ${prog.segments.length} segments (${segmentSummary})
        </div>
        ${
          prog.status === ProgramStatus.ALLOCATED && prog.start !== null
            ? `<div class="queue-item-sub font-mono">${toHexAddress(prog.start)} &mdash; ${toHexAddress(prog.end)}</div>`
            : ''
        }
      </div>
      <div class="queue-item-actions">
        ${actionBtnHtml}
      </div>
    `;

    queueFragment.appendChild(item);
  }

  elements.queueList.innerHTML = '';
  elements.queueList.appendChild(queueFragment);

  // 4. Render Memory Map Visualizer
  renderMemoryMap(state, blockId => {
    store.dispatch({ type: 'SELECT_BLOCK', id: blockId });
  });

  // 5. Render Continuous Metrics Grid
  const metrics = deriveMetrics(state);
  elements.metricAllocated.textContent = formatBytes(metrics.allocatedProgramBytes);
  elements.metricFree.textContent = formatBytes(metrics.freeBytes);
  elements.metricUtilization.textContent = `${metrics.utilizationPercent}%`;
  elements.metricInternalFrag.textContent = formatBytes(metrics.internalFragmentationBytes);
  elements.metricLargestHole.textContent = formatBytes(metrics.largestFreeBlockBytes);
  elements.metricFreeCount.textContent = `${metrics.freeBlockCount}`;
  elements.metricResidentCount.textContent = `${metrics.residentProgramCount}`;
  elements.metricProbes.textContent = `${metrics.lastProbeCount}`;

  // 6. Render Selected Block Inspector
  if (selectedId) {
    const block = blocks.find(b => b.id === selectedId);
    if (block) {
      let residentProg = null;
      let internalFrag = 0;
      if (block.kind === BlockKind.PROCESS) {
        residentProg = programs.find(p => p.id === block.programId);
      } else if (block.kind === BlockKind.PARTITION) {
        const part = state.partitions.find(p => p.start === block.start);
        if (part?.programId) {
          residentProg = programs.find(p => p.id === part.programId);
          internalFrag = part.sizeBytes - (residentProg?.sizeBytes || 0);
        }
      }

      let segmentsHtml = '';
      if (residentProg) {
        const segs = layoutSegments(residentProg);
        segmentsHtml = `
          <div style="margin-top: 8px;">
            <strong>Internal Segments:</strong>
            <ul style="list-style: none; margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">
              ${segs
                .map(
                  s => `
                <li style="font-size: 0.8rem; background: var(--color-surface-strong); padding: 4px 8px; border-radius: 4px; display: flex; justify-content: space-between;">
                  <span>${s.name} (${formatBytes(s.sizeBytes)})</span>
                  <span class="font-mono text-muted">${toHexAddress(s.start)} &mdash; ${toHexAddress(s.end)}</span>
                </li>
              `
                )
                .join('')}
            </ul>
          </div>
        `;
      }

      elements.inspectorContent.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem;">
          <div><strong>Block ID:</strong> <span class="font-mono">${block.id}</span></div>
          <div><strong>Block Type:</strong> <span class="badge badge-ready">${block.kind}</span></div>
          <div><strong>Start Address:</strong> <span class="font-mono">${toHexAddress(block.start)}</span></div>
          <div><strong>End Address:</strong> <span class="font-mono">${toHexAddress(block.end)}</span></div>
          <div><strong>Capacity / Size:</strong> <span class="font-mono">${formatBytes(block.sizeBytes)}</span></div>
          ${
            residentProg
              ? `<div><strong>Assigned Program:</strong> ${residentProg.name} (${residentProg.id})</div>`
              : ''
          }
          ${
            internalFrag > 0
              ? `<div><strong>Internal Fragmentation:</strong> <span class="font-mono" style="color: #7A4B24;">${formatBytes(internalFrag)}</span></div>`
              : ''
          }
          ${segmentsHtml}
        </div>
      `;
    }
  } else {
    elements.inspectorContent.innerHTML = `
      <p class="text-muted" style="font-size: 0.85rem;">Click any memory block on the map to inspect physical addresses, resident processes, and internal segments.</p>
    `;
  }

  // 7. Render Event History Log
  const historyFragment = document.createDocumentFragment();
  const entries = [...(history || [])].reverse();

  for (const entry of entries) {
    const item = document.createElement('div');
    item.className = 'history-item';

    const date = new Date(entry.timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let detailsText = '';
    if (entry.details?.programId) {
      detailsText += `Program: ${entry.details.programId} `;
    }
    if (entry.details?.internalFragmentationBytes) {
      detailsText += `(Internal Frag: ${formatBytes(entry.details.internalFragmentationBytes)}) `;
    }
    if (entry.details?.bytesMoved) {
      detailsText += `(Relocated: ${formatBytes(entry.details.bytesMoved)}) `;
    }

    item.innerHTML = `
      <div class="history-item-top">
        <span>#${entry.sequence} &bull; ${entry.commandType}</span>
        <span class="history-item-time">${timeStr}</span>
      </div>
      <div>${detailsText || entry.outcomeCode}</div>
    `;

    historyFragment.appendChild(item);
  }

  elements.historyFeed.innerHTML = '';
  elements.historyFeed.appendChild(historyFragment);
}

/**
 * Updates the top status alert banner with message, outcome, and optional action buttons.
 *
 * @param {Object} params
 * @param {'success'|'warning'|'error'} params.type
 * @param {string} params.message
 * @param {Object} [params.action] Optional action button config
 */
export function setStatusBanner({ type, message, action = null }) {
  elements.statusBanner.className = `alert-banner alert-${type}`;
  elements.statusText.textContent = message;
  elements.statusActions.innerHTML = '';

  if (action) {
    const btn = document.createElement('button');
    btn.className = `btn-sm ${action.primary ? 'btn-primary' : ''}`;
    btn.textContent = action.label;
    btn.onclick = action.onClick;
    elements.statusActions.appendChild(btn);
  }
}
