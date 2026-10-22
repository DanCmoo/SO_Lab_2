import { ProgramStatus } from '../domain/constants.js';
import { formatBytes, toHexAddress } from '../domain/address.js';
import { elements } from './elements.js';

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

/** El catálogo ofrece nuevas ejecuciones; el listado activo permite terminarlas. */
export function renderProgramLists(state) {
  const catalog = state.programs.filter(program => !program.sourceProgramId);
  const active = state.programs.filter(program => program.status === ProgramStatus.ALLOCATED);
  const isRunning = state.phase === 'RUNNING';

  function makeItem(program, isExecution) {
    const item = document.createElement('div');
    item.className = `queue-item ${isExecution ? 'execution-item' : 'catalog-item'}`;
    item.setAttribute('role', 'listitem');
    item.dataset.id = program.id;
    if (program.colorToken) item.style.setProperty('--prog-color', program.colorToken);

    const info = textElement('div', 'queue-item-info', '');
    const title = textElement('div', 'queue-item-title', '');
    title.appendChild(textElement('span', '', program.name));
    if (isExecution) {
      title.appendChild(textElement('span', 'badge badge-allocated', 'En ejecución'));
    } else {
      const count = active.filter(process => (process.sourceProgramId || process.id) === program.id).length;
      title.appendChild(textElement('span', 'badge badge-ready', count ? `${count} activa${count === 1 ? '' : 's'}` : 'Disponible'));
    }
    info.appendChild(title);
    if (isExecution) {
      const location = state.config.mode === 'SEGMENTATION' ? `${program.segmentTable.length} segmentos` : state.config.mode === 'PAGING' ? `${program.pageTable.length} páginas / marcos` : `${toHexAddress(program.start)} — ${toHexAddress(program.end)}`;
      info.appendChild(textElement('div', 'queue-item-sub font-mono', `${program.id} · ${location}`));
      info.appendChild(textElement('div', 'queue-item-sub', `${formatBytes(program.sizeBytes)} en memoria`));
    } else {
      const imageSummary = program.segments.map(segment => `${segment.name} ${formatBytes(segment.sizeBytes)}`).join(', ');
      info.appendChild(textElement('div', 'queue-item-sub', `${formatBytes(program.sizeBytes)} por ejecución · Imagen: ${imageSummary}`));
      info.appendChild(textElement('div', 'queue-item-sub', `Solicitud al SO: Heap ${formatBytes(program.runtimeMemory?.heapBytes ?? 0)}, Stack ${formatBytes(program.runtimeMemory?.stackBytes ?? 0)}`));
    }
    const actions = textElement('div', 'queue-item-actions', '');
    const button = textElement('button', `btn-sm ${isExecution ? 'btn-danger btn-terminate' : 'btn-primary btn-allocate'}`, isExecution ? 'Terminar' : 'Ejecutar');
    button.type = 'button';
    button.dataset.id = program.id;
    button.disabled = !isRunning;
    if (!isRunning) button.title = 'Inicia la simulación para ejecutar programas';
    actions.appendChild(button);
    if (!isExecution) {
      const remove = textElement('button', 'btn-sm btn-danger btn-delete-program', 'Eliminar');
      remove.type = 'button';
      remove.dataset.id = program.id;
      remove.setAttribute('aria-label', `Eliminar programa ${program.name}`);
      remove.disabled = active.some(process => (process.sourceProgramId || process.id) === program.id);
      remove.title = remove.disabled ? 'Termina sus ejecuciones activas antes de eliminarlo' : 'Eliminar del catálogo. Puedes recuperarlo con Deshacer';
      actions.appendChild(remove);
    }
    item.append(info, actions);
    return item;
  }

  elements.queueList.replaceChildren(...catalog.map(program => makeItem(program, false)));
  if (catalog.length === 0) elements.queueList.appendChild(textElement('p', 'text-muted execution-empty', 'No hay programas disponibles. Crea uno con + Nuevo o restaura los predeterminados.'));
  elements.activeProcessList.replaceChildren(...active.map(program => makeItem(program, true)));
  if (active.length === 0) {
    elements.activeProcessList.appendChild(textElement('p', 'text-muted execution-empty', 'No hay ejecuciones activas.'));
  }
}
