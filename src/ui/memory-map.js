import { TOTAL_MEMORY_BYTES, BlockKind, MemoryMode } from '../domain/constants.js';
import { toHexAddress, formatBytes } from '../domain/address.js';
import { layoutSegments } from '../engine/compaction.js';
import { elements } from './elements.js';

/**
 * Renderiza el mapa de memoria física de doble carril y su representación tabular accesible.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {(id: string) => void} onSelectBlock
 */
export function renderMemoryMap(state, onSelectBlock) {
  const { blocks, programs, partitions, selectedId, config } = state;
  const blockTypeLabels = {
    OS: 'Sistema operativo',
    PARTITION: 'Partición',
    PROCESS: 'Proceso',
    HOLE: 'Hueco libre'
  };
  const isStatic =
    config.mode === MemoryMode.STATIC_EQUAL ||
    config.mode === MemoryMode.STATIC_UNEQUAL;

  // 1. Renderiza el carril proporcional izquierdo.
  const propFragment = document.createDocumentFragment();
  // Conserva la etiqueta del carril.
  const labelSpan = document.createElement('span');
  labelSpan.className = 'rail-label';
  labelSpan.textContent = 'Escala';
  propFragment.appendChild(labelSpan);

  for (const block of blocks) {
    const slice = document.createElement('div');
    const heightPercent = (block.sizeBytes / TOTAL_MEMORY_BYTES) * 100;
    slice.className = `proportional-block kind-${block.kind.toLowerCase()}`;
    slice.style.height = `${Math.max(0.2, heightPercent)}%`;

    if (block.kind === BlockKind.PROCESS && block.programId) {
      const prog = programs.find(p => p.id === block.programId);
      if (prog?.colorToken) {
        slice.style.setProperty('--prog-color', prog.colorToken);
      }
    } else if (block.kind === BlockKind.PARTITION && block.programId) {
      const prog = programs.find(p => p.id === block.programId);
      if (prog?.colorToken) {
        slice.style.setProperty('--prog-color', prog.colorToken);
        slice.style.backgroundColor = prog.colorToken;
      }
    }

    slice.title = `${block.kind}: ${formatBytes(block.sizeBytes)} [${toHexAddress(block.start)} - ${toHexAddress(block.end)}]`;
    propFragment.appendChild(slice);
  }

  elements.proportionalRail.innerHTML = '';
  elements.proportionalRail.appendChild(propFragment);

  // 2. Renderiza el carril detallado derecho.
  const detailedFragment = document.createDocumentFragment();

  for (const block of blocks) {
    const card = document.createElement('div');
    card.className = `memory-block-card kind-${block.kind.toLowerCase()}`;
    card.setAttribute('data-id', block.id);
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');

    if (block.id === selectedId) {
      card.classList.add('selected');
    }

    const startHex = toHexAddress(block.start);
    const endHex = toHexAddress(block.end);
    const sizeStr = formatBytes(block.sizeBytes);

    let titleText = '';
    let residentProg = null;
    let internalFragBytes = 0;

    if (block.kind === BlockKind.OS) {
      titleText = 'Sistema operativo';
    } else if (block.kind === BlockKind.HOLE) {
      titleText = 'Hueco de memoria libre';
    } else if (block.kind === BlockKind.PROCESS) {
      residentProg = programs.find(p => p.id === block.programId);
      titleText = residentProg ? `${residentProg.name} (${residentProg.id})` : `Proceso ${block.programId}`;
      if (residentProg?.colorToken) {
        card.style.setProperty('--prog-color', residentProg.colorToken);
      }
    } else if (block.kind === BlockKind.PARTITION) {
      const partition = partitions.find(p => p.start === block.start && p.sizeBytes === block.sizeBytes);
      if (partition?.programId) {
        residentProg = programs.find(p => p.id === partition.programId);
        titleText = `${partition.id}: ${residentProg?.name || residentProg?.id || 'Asignada'}`;
        internalFragBytes = partition.sizeBytes - (residentProg?.sizeBytes || 0);
        if (residentProg?.colorToken) {
          card.style.setProperty('--prog-color', residentProg.colorToken);
        }
      } else {
        titleText = `${partition?.id || block.id} (Partición libre)`;
      }
    }

    card.innerHTML = `
      <div class="block-header">
        <div class="block-title">
          <span>${titleText}</span>
          <span class="badge badge-ready font-mono">${sizeStr}</span>
        </div>
        <div class="block-range">${startHex} &mdash; ${endHex}</div>
      </div>
    `;

    // Renderiza los segmentos anidados si hay un programa residente.
    if (residentProg) {
      const segmentsWrapper = document.createElement('div');
      segmentsWrapper.className = 'segments-container';

      const placedSegments = layoutSegments(residentProg);
      for (const seg of placedSegments) {
        const segSlice = document.createElement('div');
        segSlice.className = 'segment-slice';
        segSlice.style.flex = `${seg.sizeBytes}`;
        segSlice.textContent = `${seg.name} (${formatBytes(seg.sizeBytes)})`;
        segSlice.title = `${seg.name}: ${formatBytes(seg.sizeBytes)} [${toHexAddress(seg.start)} - ${toHexAddress(seg.end)}]`;
        segmentsWrapper.appendChild(segSlice);
      }

      card.appendChild(segmentsWrapper);

      // La fragmentación interna no es un segmento del programa. Se muestra en su propia fila
      // para que no compita por el ancho ni se solape con las etiquetas de los segmentos.
      if (internalFragBytes > 0) {
        const fragNote = document.createElement('div');
        fragNote.className = 'internal-frag-note';
        fragNote.title = `Espacio sin usar dentro de la partición: ${formatBytes(internalFragBytes)}`;

        const label = document.createElement('span');
        label.textContent = 'Fragmentación interna';
        const value = document.createElement('span');
        value.className = 'font-mono';
        value.textContent = formatBytes(internalFragBytes);

        fragNote.append(label, value);
        card.appendChild(fragNote);
      }
    }

    card.addEventListener('click', () => onSelectBlock(block.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelectBlock(block.id);
      }
    });

    detailedFragment.appendChild(card);
  }

  elements.detailedRail.innerHTML = '';
  elements.detailedRail.appendChild(detailedFragment);

  // 3. Render Accessible Semantic Table
  const tableFragment = document.createDocumentFragment();
  for (const block of blocks) {
    const tr = document.createElement('tr');
    const startHex = toHexAddress(block.start);
    const endHex = toHexAddress(block.end);
    const sizeStr = formatBytes(block.sizeBytes);

    let progName = '—';
    let fragStr = '0 B';

    if (block.kind === BlockKind.PROCESS && block.programId) {
      const prog = programs.find(p => p.id === block.programId);
      progName = prog ? `${prog.name} (${prog.id})` : block.programId;
    } else if (block.kind === BlockKind.PARTITION) {
      const partition = partitions.find(p => p.start === block.start);
      if (partition?.programId) {
        const prog = programs.find(p => p.id === partition.programId);
        progName = prog ? `${prog.name} (${prog.id})` : partition.programId;
        const frag = partition.sizeBytes - (prog?.sizeBytes || 0);
        fragStr = formatBytes(frag);
      }
    }

    tr.innerHTML = `
      <td class="font-mono">${block.id}</td>
      <td>${blockTypeLabels[block.kind] || block.kind}</td>
      <td class="font-mono">${startHex}</td>
      <td class="font-mono">${endHex}</td>
      <td class="font-mono">${sizeStr}</td>
      <td>${progName}</td>
      <td class="font-mono">${fragStr}</td>
    `;
    tableFragment.appendChild(tr);
  }

  elements.accessibleTableBody.innerHTML = '';
  elements.accessibleTableBody.appendChild(tableFragment);
}
