import { toHexAddress, formatBytes } from '../domain/address.js';
import { parseAddressInput, translateAddress } from '../domain/translation.js';
import { deriveMetrics } from '../domain/metrics.js';
import { elements } from './elements.js';
import { getPageDetails } from '../domain/page-details.js';

const $ = id => document.getElementById(id);
let store, rangeStart = 0, tableStart = 0, previousMode = null, previousInstance = null, previousSelection = null;
let committedTrace, traceConfig;
let previousLayout = null;
const cell = (tag, text) => { const element = document.createElement(tag); element.textContent = text; return element; };
const isNew = state => ['SEGMENTATION', 'PAGING'].includes(state.config.mode);

export function renderAttemptTrace(trace) {
  $('trace-panel').hidden = !trace;
  if (!trace) { $('trace-content').textContent = ''; return; }
  const reasons = { SUCCESS: 'Asignación completa', INSUFFICIENT_TOTAL_MEMORY: 'Memoria libre total insuficiente', EXTERNAL_FRAGMENTATION: 'Un segmento no cabe bajo esta estrategia', INSUFFICIENT_FRAMES: 'Marcos libres insuficientes', NO_SUITABLE_CANDIDATE: 'No hay un espacio adecuado' };
  const algorithms = { FIRST_FIT: 'Primer ajuste', BEST_FIT: 'Mejor ajuste', WORST_FIT: 'Peor ajuste', ASCENDING_FREE_FRAMES: 'Marcos libres en orden ascendente', LOWEST_ADDRESS_STATIC_EQUAL: 'Primera partición libre por dirección' };
  const lines = [reasons[trace.reason] || 'Resultado de asignación', `Estrategia: ${algorithms[trace.algorithm] || trace.algorithm}`, `Solicitud: ${formatBytes(trace.requestBytes)}`];
  if (trace.pageCount !== undefined) {
    lines.push(`Páginas necesarias: ${trace.pageCount} · Marcos disponibles: ${trace.availableFrames}`, `Reserva física: ${formatBytes(trace.physicalBytes)}`);
    if (trace.frameNumbers) lines.push(`Marcos asignados: ${trace.frameNumbers.slice(0, 16).join(', ')}${trace.frameNumbers.length > 16 ? `… (${trace.frameNumbers.length} en total; consulta la tabla de páginas)` : ''}`);
  } else {
    lines.push(`Inspecciones totales: ${trace.probes}`);
    const steps = trace.steps || [trace];
    for (const step of steps.slice(0, 64)) {
      lines.push('', `${step.name || 'Asignación'}: ${formatBytes(step.requestBytes)} · Inspecciones: ${step.probes}`);
      for (const candidate of (step.inspectedCandidates || []).slice(0, 12)) lines.push(`  ${toHexAddress(candidate.start)} · ${formatBytes(candidate.capacityBytes)} · ${candidate.suitable ? 'Cabe' : 'No cabe'}`);
      if (step.inspectedCandidates?.length > 12) lines.push(`  … ${step.inspectedCandidates.length} espacios inspeccionados en total`);
      lines.push(step.chosenCandidate ? `  Elegido: ${toHexAddress(step.chosenCandidate.start)}` : '  Sin espacio elegido');
    }
    if (steps.length > 64) lines.push(`… ${steps.length} regiones evaluadas en total`);
  }
  $('trace-content').textContent = lines.join('\n');
}

/** Una selección no debe sustituir la traza fallida por la del último éxito. */
export function syncCommittedTrace(state) {
  if (committedTrace !== state.lastTrace || traceConfig !== state.config) {
    committedTrace = state.lastTrace; traceConfig = state.config;
    renderAttemptTrace(state.lastTrace);
  }
}

function selectBlock(id) { store.dispatch({ type: 'SELECT_BLOCK', id }); }

export function initNoncontiguousUI(activeStore) {
  store = activeStore;
  $('translate-instance').addEventListener('change', () => {
    tableStart = 0; $('translation-result').textContent = '';
    const program = store.getState().programs.find(p => p.id === $('translate-instance').value);
    const id = program?.pageTable[0] ? `FRAME-${program.pageTable[0].frameNumber}` : program?.segmentTable[0] ? `SEG-${program.segmentTable[0].regionId}` : null;
    if (id) selectBlock(id); else renderNoncontiguousTools(store.getState());
  });
  $('translate-format').addEventListener('change', () => renderTranslationFields(store.getState()));
  $('btn-frame-go').addEventListener('click', () => {
    try {
      const number = parseAddressInput($('input-frame-number').value);
      if (number >= store.getState().frames.length) throw new Error('Número de marco fuera del rango físico.');
      rangeStart = Math.floor(number / 256) * 256;
      selectBlock(`FRAME-${number}`);
      $('frame-search-result').textContent = `Marco ${number} localizado.`;
    } catch (error) { $('frame-search-result').textContent = error.message; }
  });
  for (const [id, delta] of [['btn-frame-prev', -256], ['btn-frame-next', 256]]) {
    $(id).addEventListener('click', () => {
      const state = store.getState();
      rangeStart = Math.max(0, Math.min(Math.floor((state.frames.length - 1) / 256) * 256, rangeStart + delta));
      selectBlock(`FRAME-${rangeStart}`);
      $('frame-search-result').textContent = '';
    });
  }
  for (const [id, delta] of [['btn-table-prev', -64], ['btn-table-next', 64]]) {
    $(id).addEventListener('click', () => { tableStart = Math.max(0, tableStart + delta); renderNoncontiguousTools(store.getState()); });
  }
  $('btn-translate').addEventListener('click', () => {
    try {
      const state = store.getState(), instanceId = $('translate-instance').value;
      const request = state.config.mode === 'SEGMENTATION'
        ? { instanceId, segmentNumber: Number($('translate-segment').value), offset: parseAddressInput($('translate-offset').value), operation: $('translate-operation').value }
        : $('translate-format').value === 'linear'
          ? { instanceId, format: 'linear', logicalAddress: parseAddressInput($('translate-logical').value) }
          : { instanceId, format: 'pair', pageNumber: parseAddressInput($('translate-page').value), offset: parseAddressInput($('translate-offset').value) };
      const result = translateAddress(state, request);
      if (result.frameNumber !== undefined) rangeStart = Math.floor(result.frameNumber / 256) * 256;
      selectBlock(result.blockId);
      $('translation-result').textContent = `${result.formula} → ${toHexAddress(result.physicalAddress)}${result.frameNumber !== undefined ? ` · Página ${result.pageNumber}, marco ${result.frameNumber}, offset ${result.offset}` : ` · Base ${toHexAddress(result.base)}, límite ${result.descriptor.limitBytes} B`}`;
    } catch (error) {
      $('translation-result').textContent = `${error.code || 'ENTRADA_INVALIDA'}: ${error.message}`;
    }
  });
}

function renderTranslationFields(state) {
  const paged = state.config.mode === 'PAGING', pair = $('translate-format').value === 'pair';
  $('segment-translation').hidden = paged;
  $('page-translation').hidden = !paged;
  $('linear-input').hidden = pair;
  $('pair-input').hidden = !pair;
  $('offset-input').hidden = paged && !pair;
}

export function renderNoncontiguousTools(state) {
  const enabled = isNew(state), paged = state.config.mode === 'PAGING';
  $('noncontiguous-tools').hidden = !enabled;
  $('frame-controls').hidden = !paged;
  elements.btnUndo.disabled = !store.canUndo();
  const layout = `${state.config.mode}:${state.config.osBytes}:${state.config.pageSizeBytes}`;
  if (previousMode !== state.config.mode || previousLayout !== layout) {
    previousLayout = layout;
    previousMode = state.config.mode; rangeStart = 0; tableStart = 0;
    previousInstance = null; previousSelection = null; $('translation-result').textContent = '';
    $('frame-search-result').textContent = '';
  }
  if (!enabled) { $('metric-mode-summary').textContent = ''; return; }
  const metrics = deriveMetrics(state);
  $('metric-mode-summary').textContent = paged
    ? `Útil: ${formatBytes(metrics.allocatedProgramBytes)} · Física: ${formatBytes(metrics.allocatedPhysicalBytes)} (${metrics.physicalUtilizationPercent}% de ocupación). Marcos: ${metrics.totalFrameCount} totales, ${metrics.osFrameCount} SO, ${metrics.occupiedUserFrameCount} ocupados, ${metrics.freeFrameCount} libres. Fragmentación externa: no aplica. Desplazamiento: ${Math.log2(state.config.pageSizeBytes)} bits; marco físico: ${24 - Math.log2(state.config.pageSizeBytes)} bits.`
    : `${metrics.residentSegmentCount} segmentos residentes · Memoria física y útil: ${formatBytes(metrics.allocatedPhysicalBytes)} · Fragmentación interna: 0 B. Reservas fijas; tablas como metadatos sin coste adicional simulado.`;
  const residents = state.programs.filter(p => p.status === 'allocated');
  let selected = $('translate-instance').value;
  const selectedFrame = paged && /^FRAME-\d+$/.test(state.selectedId || '') ? state.frames[Number(state.selectedId.slice(6))] : null;
  if (selectedFrame && previousSelection !== state.selectedId) rangeStart = Math.floor(selectedFrame.frameNumber / 256) * 256;
  const block = state.blocks.find(b => b.id === state.selectedId);
  const owner = selectedFrame?.programId || block?.programId;
  if (owner) selected = owner;
  if (!residents.some(p => p.id === selected)) selected = residents[0]?.id || '';
  $('translate-instance').replaceChildren(...residents.map(p => { const option = cell('option', `${p.name} (${p.id})`); option.value = p.id; return option; }));
  $('translate-instance').value = selected;
  if (previousInstance !== selected) { tableStart = 0; $('translation-result').textContent = ''; previousInstance = selected; }
  const program = residents.find(p => p.id === selected);
  $('btn-translate').disabled = !program;
  const entries = program ? (paged ? program.pageTable : program.segmentTable) : [];
  if (previousSelection !== state.selectedId && owner === selected && selectedFrame?.pageNumber !== null && selectedFrame?.pageNumber !== undefined) tableStart = Math.floor(selectedFrame.pageNumber / 64) * 64;
  previousSelection = state.selectedId;
  tableStart = Math.min(tableStart, Math.max(0, Math.floor((entries.length - 1) / 64) * 64));
  $('mapping-caption').textContent = paged ? 'Tabla de páginas (página → marco)' : 'Tabla de segmentos (límite = cantidad de bytes)';
  const head = document.createElement('tr');
  for (const title of paged ? ['Página', 'Marco', 'Útiles / relleno', 'Localizar'] : ['N.º / región', 'Base', 'Límite B', 'R/W/X', 'Localizar']) head.appendChild(cell('th', title));
  $('mapping-head').replaceChildren(head);
  const rows = entries.slice(tableStart, tableStart + 64).map(entry => {
    const row = document.createElement('tr');
    const values = paged ? [entry.pageNumber, entry.frameNumber, `${entry.usedBytes} / ${state.config.pageSizeBytes - entry.usedBytes} B`]
      : [`${entry.segmentNumber} · ${entry.name}`, toHexAddress(entry.base), entry.limitBytes, ['read', 'write', 'execute'].map((key, i) => entry.permissions[key] ? 'RWX'[i] : '-').join('')];
    values.forEach(value => row.appendChild(cell('td', String(value))));
    const td = document.createElement('td'), button = cell('button', 'Ver'); button.type = 'button';
    button.setAttribute('aria-label', paged ? `Localizar página ${entry.pageNumber} en marco ${entry.frameNumber}` : `Localizar segmento ${entry.segmentNumber}`);
    button.addEventListener('click', () => {
      if (paged) {
        rangeStart = Math.floor(entry.frameNumber / 256) * 256;
        $('translate-page').value = entry.pageNumber;
        $('translate-logical').value = entry.pageNumber * state.config.pageSizeBytes;
        $('translate-offset').value = '0';
        $('translation-result').textContent = '';
      }
      else $('translate-segment').value = entry.segmentNumber;
      selectBlock(paged ? `FRAME-${entry.frameNumber}` : `SEG-${entry.regionId}`);
    });
    td.appendChild(button); row.appendChild(td); return row;
  });
  $('mapping-body').replaceChildren(...rows);
  $('table-range').textContent = entries.length ? `${tableStart + 1}–${Math.min(tableStart + 64, entries.length)} / ${entries.length}` : 'Sin instancia residente';
  $('btn-table-prev').disabled = tableStart === 0;
  $('btn-table-next').disabled = tableStart + 64 >= entries.length;
  const segmentValue = $('translate-segment').value;
  $('translate-segment').replaceChildren(...(program?.segmentTable || []).map(entry => { const option = cell('option', `${entry.segmentNumber}: ${entry.name}`); option.value = entry.segmentNumber; return option; }));
  if ((program?.segmentTable || []).some(e => String(e.segmentNumber) === segmentValue)) $('translate-segment').value = segmentValue;
  if (!paged && block?.regionId) {
    const descriptor = program?.segmentTable.find(entry => entry.regionId === block.regionId);
    if (descriptor) $('translate-segment').value = descriptor.segmentNumber;
  }
  renderTranslationFields(state);
  const details = selectedFrame ? `Marco ${selectedFrame.frameNumber} · ${selectedFrame.ownerKind} · ${selectedFrame.programId || 'Sin proceso'} · ${toHexAddress(selectedFrame.frameNumber * state.config.pageSizeBytes)} — ${toHexAddress((selectedFrame.frameNumber + 1) * state.config.pageSizeBytes - 1)}`
    : block ? `${block.kind} · ${block.programId || 'Sin proceso'} · ${toHexAddress(block.start)} — ${toHexAddress(block.end)} · ${formatBytes(block.sizeBytes)}` : 'Selecciona un segmento o marco para inspeccionarlo.';
  elements.inspectorContent.textContent = details;
  if (selectedFrame?.ownerKind === 'PAGE') {
    const ownerProgram = residents.find(p => p.id === selectedFrame.programId);
    const page = ownerProgram && getPageDetails(ownerProgram, selectedFrame.pageNumber, state.config.pageSizeBytes);
    if (page) elements.inspectorContent.textContent += `\nProceso: ${ownerProgram.name} (${ownerProgram.id}) · Página lógica ${selectedFrame.pageNumber}\n${page.usedBytes} B útiles · ${page.paddingBytes} B de relleno\nRango lógico: ${toHexAddress(page.logicalStart)} — ${toHexAddress(page.logicalEnd)}\nRegiones: ${page.regions.map(region => `${region.name}: ${region.bytes} B (${toHexAddress(region.start)} — ${toHexAddress(region.end)})`).join('; ')}`;
  }
}

export function renderNoncontiguousMap(state, onSelect) {
  const paged = state.config.mode === 'PAGING';
  // Un canvas conserva la escala exacta sin crear miles de elementos en el carril global.
  const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 600; canvas.style.width = '100%'; canvas.style.height = '100%';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Vista global proporcional de los 16 MiB');
  const ctx = canvas.getContext('2d');
  const rootStyle = getComputedStyle(document.documentElement);
  const programColors = new Map(state.programs.map(program => [program.id, (program.colorToken || '#708e78').replace(/var\((--[\w-]+)\)/g, (_, token) => rootStyle.getPropertyValue(token).trim())]));
  for (const block of state.blocks) {
    ctx.fillStyle = block.kind === 'OS' ? '#626878' : block.kind === 'HOLE' ? '#283332' : programColors.get(block.programId) || '#708e78';
    ctx.fillRect(0, block.start / state.config.totalBytes * 600, 32, block.sizeBytes / state.config.totalBytes * 600);
  }
  elements.proportionalRail.replaceChildren(canvas);
  const fragment = document.createDocumentFragment();
  const visible = paged ? state.frames.slice(rangeStart, rangeStart + 256) : state.blocks;
  elements.detailedRail.classList.toggle('frame-grid', paged);
  for (const entry of visible) {
    const button = cell('button', ''); button.type = 'button';
    const program = state.programs.find(p => p.id === entry.programId);
    const id = paged ? `FRAME-${entry.frameNumber}` : entry.id;
    const label = paged ? `Marco ${entry.frameNumber} · ${entry.ownerKind}${program ? ` · ${program.id} · ${program.name} · página ${entry.pageNumber}` : ''}`
      : entry.kind === 'SEGMENT' ? `${program?.name} · ${program?.segmentTable.find(d => d.regionId === entry.regionId)?.name}` : entry.kind === 'OS' ? 'Sistema operativo' : 'Hueco libre';
    button.className = paged ? `frame-cell owner-${entry.ownerKind.toLowerCase()}` : `memory-block-card kind-${entry.kind.toLowerCase()}`;
    if (state.selectedId === id) button.classList.add('selected');
    if (program) button.style.setProperty('--prog-color', program.colorToken);
    button.textContent = paged ? `${entry.frameNumber}${entry.ownerKind === 'PAGE' ? ` · ${entry.programId} · p${entry.pageNumber}` : ` · ${entry.ownerKind}`}` : `${label} · ${formatBytes(entry.sizeBytes)} · ${toHexAddress(entry.start)} — ${toHexAddress(entry.end)}`;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', () => onSelect(id)); fragment.appendChild(button);
  }
  elements.detailedRail.replaceChildren(fragment);
  if (paged) {
    $('frame-range').textContent = `${rangeStart}–${Math.min(rangeStart + 255, state.frames.length - 1)} / ${state.frames.length} marcos`;
    $('input-frame-number').max = state.frames.length - 1;
    $('btn-frame-prev').disabled = rangeStart === 0;
    $('btn-frame-next').disabled = rangeStart + 256 >= state.frames.length;
  }
  const rows = visible.map(entry => {
    const row = document.createElement('tr'), start = paged ? entry.frameNumber * state.config.pageSizeBytes : entry.start;
    const size = paged ? state.config.pageSizeBytes : entry.sizeBytes;
    const page = paged && entry.ownerKind === 'PAGE' ? state.programs.find(p => p.id === entry.programId)?.pageTable[entry.pageNumber] : null;
    for (const value of [paged ? `FRAME-${entry.frameNumber}` : entry.id, paged ? entry.ownerKind : entry.kind, toHexAddress(start), toHexAddress(start + size - 1), formatBytes(size), entry.programId || '—', page ? `${page.usedBytes} B útiles / ${size - page.usedBytes} B relleno` : '0 B']) row.appendChild(cell('td', String(value)));
    return row;
  });
  elements.accessibleTableBody.replaceChildren(...rows);
}
