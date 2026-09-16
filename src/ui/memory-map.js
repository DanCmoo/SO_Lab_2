import { TOTAL_MEMORY_BYTES, BlockKind, MemoryMode } from '../domain/constants.js';
import { toHexAddress, formatBytes } from '../domain/address.js';
import { layoutSegments } from '../engine/compaction.js';
import { elements } from './elements.js';

/**
 * Renders the dual-rail physical memory map and accessible table representation.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @param {(id: string) => void} onSelectBlock
 */
export function renderMemoryMap(state, onSelectBlock) {
  const { blocks, programs, partitions, selectedId, config } = state;
  const isStatic =
    config.mode === MemoryMode.STATIC_EQUAL ||
    config.mode === MemoryMode.STATIC_UNEQUAL;

  // 1. Render Left Proportional Rail
  const propFragment = document.createDocumentFragment();
  // Preserve rail label
  const labelSpan = document.createElement('span');
  labelSpan.className = 'rail-label';
  labelSpan.textContent = 'Scale';
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

  // 2. Render Right Detailed Rail
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
      titleText = 'Operating System';
    } else if (block.kind === BlockKind.HOLE) {
      titleText = 'Free Memory Hole';
    } else if (block.kind === BlockKind.PROCESS) {
      residentProg = programs.find(p => p.id === block.programId);
      titleText = residentProg ? `${residentProg.name} (${residentProg.id})` : `Process ${block.programId}`;
      if (residentProg?.colorToken) {
        card.style.setProperty('--prog-color', residentProg.colorToken);
      }
    } else if (block.kind === BlockKind.PARTITION) {
      const partition = partitions.find(p => p.start === block.start && p.sizeBytes === block.sizeBytes);
      if (partition?.programId) {
        residentProg = programs.find(p => p.id === partition.programId);
        titleText = `${partition.id}: ${residentProg?.name || residentProg?.id || 'Assigned'}`;
        internalFragBytes = partition.sizeBytes - (residentProg?.sizeBytes || 0);
        if (residentProg?.colorToken) {
          card.style.setProperty('--prog-color', residentProg.colorToken);
        }
      } else {
        titleText = `${partition?.id || block.id} (Free Partition)`;
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

    // Render nested segments if resident program is present
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

      // If occupied partition has internal fragmentation, add fragmentation slice
      if (internalFragBytes > 0) {
        const fragSlice = document.createElement('div');
        fragSlice.className = 'internal-frag-slice';
        fragSlice.style.flex = `${internalFragBytes}`;
        fragSlice.textContent = `Internal Frag: ${formatBytes(internalFragBytes)}`;
        fragSlice.title = `Unused space inside partition: ${formatBytes(internalFragBytes)}`;
        segmentsWrapper.appendChild(fragSlice);
      }

      card.appendChild(segmentsWrapper);
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
      <td>${block.kind}</td>
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
