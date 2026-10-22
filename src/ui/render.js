import { MemoryMode, BlockKind, MIB } from '../domain/constants.js';
import { toHexAddress, formatBytes } from '../domain/address.js';
import { deriveMetrics } from '../domain/metrics.js';
import { layoutSegments } from '../engine/compaction.js';
import { renderMemoryMap } from './memory-map.js';
import { updateConfigFormVisibility } from './forms.js';
import { elements } from './elements.js';
import { renderProgramLists } from './program-list.js';
import { renderNoncontiguousTools, renderAttemptTrace, syncCommittedTrace } from './noncontiguous.js';
import { escapeHTML } from './safe-html.js';

/**
 * Coordinador principal que proyecta el estado de la simulación en el DOM.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {Object} store
 */
export function renderApp(state, store) {
  const { config, phase, programs, blocks, selectedId } = state;
  const isRunning = phase === 'RUNNING';

  // 1. Sincroniza los controles de la barra superior.
  if (elements.selectMode.value !== config.mode) {
    elements.selectMode.value = config.mode;
  }
  if (elements.selectAlgorithm.value !== config.algorithm) {
    elements.selectAlgorithm.value = config.algorithm;
  }
  if (Number(elements.inputOsSize.value) * MIB !== config.osBytes || elements.selectOsUnit.value !== 'MiB') {
    elements.inputOsSize.value = config.osBytes / MIB;
    elements.selectOsUnit.value = 'MiB';
  }
  if (config.mode === MemoryMode.STATIC_EQUAL) {
    const unitBytes = { B: 1, KiB: 1024, MiB: MIB }[elements.selectEqualUnit.value];
    if (Number(elements.inputEqualSize.value) * unitBytes !== config.equalPartitionSizeBytes) {
      elements.inputEqualSize.value = config.equalPartitionSizeBytes / unitBytes;
    }
  }
  if (config.mode === MemoryMode.STATIC_UNEQUAL) {
    elements.inputUnequalSizes.value = config.unequalPartitionSizes.map(size => size / MIB).join(', ');
  }
  if (config.mode === MemoryMode.PAGING) elements.selectPageSize.value = config.pageSizeBytes;

  if (isRunning) {
    elements.btnStartSim.textContent = 'En ejecución';
    elements.btnStartSim.disabled = true;
    elements.badgeSimPhase.textContent = 'En ejecución';
    elements.badgeSimPhase.className = 'badge badge-allocated';
  } else {
    elements.btnStartSim.textContent = 'Iniciar simulación';
    elements.btnStartSim.disabled = false;
    elements.badgeSimPhase.textContent = 'Configurando';
    elements.badgeSimPhase.className = 'badge badge-ready';
  }

  // 2. Actualiza el estado del formulario de configuración.
  updateConfigFormVisibility(state);

  // 3. Proyecta por separado el catálogo y las ejecuciones activas.
  renderProgramLists(state);
  renderNoncontiguousTools(state);

  // 4. Renderiza el mapa visualizador de memoria.
  renderMemoryMap(state, blockId => {
    store.dispatch({ type: 'SELECT_BLOCK', id: blockId });
  });

  // 5. Renderiza la cuadrícula de métricas.
  const metrics = deriveMetrics(state);
  elements.metricAllocated.textContent = formatBytes(metrics.allocatedProgramBytes);
  elements.metricFree.textContent = formatBytes(metrics.freeBytes);
  elements.metricUtilization.textContent = `${metrics.utilizationPercent}%`;
  elements.metricInternalFrag.textContent = formatBytes(metrics.internalFragmentationBytes);
  elements.metricLargestHole.textContent = formatBytes(metrics.largestFreeBlockBytes);
  elements.metricFreeCount.textContent = `${metrics.freeBlockCount}`;
  elements.metricResidentCount.textContent = `${metrics.residentProgramCount}`;
  elements.metricProbes.textContent = `${metrics.lastProbeCount}`;
  elements.metricCompactionBytes.textContent = formatBytes(metrics.lastCompactionBytesMoved);
  elements.metricAllocated.previousElementSibling.textContent = ['SEGMENTATION', 'PAGING'].includes(config.mode) ? 'Memoria útil residente' : 'Memoria asignada';
  elements.metricLargestHole.previousElementSibling.textContent = config.mode === MemoryMode.PAGING ? 'Capacidad de un marco libre' : 'Mayor hueco libre';
  elements.metricFreeCount.previousElementSibling.textContent = config.mode === MemoryMode.PAGING ? 'Marcos libres' : 'Huecos/particiones libres';
  if (config.mode === MemoryMode.SEGMENTATION || config.mode === MemoryMode.PAGING) {
    elements.metricCompactionBytes.textContent = 'No aplica';
    syncCommittedTrace(state);
    return;
  }
  renderAttemptTrace(null);

  // 6. Renderiza el inspector del bloque seleccionado.
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
            <strong>Imagen y memoria de ejecución:</strong>
            <ul style="list-style: none; margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">
              ${segs
                .map(
                  s => `
                <li style="font-size: 0.8rem; background: var(--color-surface-strong); padding: 4px 8px; border-radius: 4px; display: flex; flex-direction: column; gap: 2px;">
                  <span><strong>${escapeHTML(s.name)}</strong> (${formatBytes(s.sizeBytes)})${s.allocatedBy === 'OS' ? ` · Reserva del SO · ${s.growth === 'down' ? 'crece hacia direcciones menores' : 'crece hacia direcciones mayores'}` : ' · Imagen del programa'}</span>
                  <span class="font-mono text-muted" style="word-break: break-all;">${toHexAddress(s.start)} — ${toHexAddress(s.end)}</span>
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
          <div><strong>ID del bloque:</strong> <span class="font-mono">${escapeHTML(block.id)}</span></div>
          <div><strong>Tipo de bloque:</strong> <span class="badge badge-ready">${block.kind}</span></div>
          <div><strong>Dirección inicial:</strong> <span class="font-mono">${toHexAddress(block.start)}</span></div>
          <div><strong>Dirección final:</strong> <span class="font-mono">${toHexAddress(block.end)}</span></div>
          <div><strong>Capacidad / tamaño:</strong> <span class="font-mono">${formatBytes(block.sizeBytes)}</span></div>
          ${block.kind === BlockKind.UNPARTITIONED ? '<div>Remanente menor que una partición completa. No se puede asignar en este modo.</div>' : ''}
          ${
            residentProg
              ? `<div><strong>Programa asignado:</strong> ${escapeHTML(residentProg.name)} (${escapeHTML(residentProg.id)})</div>`
              : ''
          }
          ${
            internalFrag > 0
              ? `<div><strong>Fragmentación interna:</strong> <span class="font-mono text-warning">${formatBytes(internalFrag)}</span></div>`
              : ''
          }
          ${segmentsHtml}
        </div>
      `;
    }
  } else {
    elements.inspectorContent.innerHTML = `
      <p class="text-muted" style="font-size: 0.85rem;">Haz clic en un bloque de memoria para consultar direcciones físicas, procesos residentes y segmentos internos.</p>
    `;
  }

}

/**
 * Actualiza el aviso de estado superior con el mensaje, el resultado y botones opcionales.
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
