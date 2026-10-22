import { TOTAL_MEMORY_BYTES, PAGE_SIZES } from './constants.js';
import { getProcessRegions } from './process-regions.js';
import { projectFrames } from './paging-layout.js';
import { DomainError, ErrorCode } from './errors.js';

const requireState = (condition, message) => { if (!condition) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, message); };

export function assertSegmented(state) {
  requireState(state.partitions.length === 0 && state.frames.length === 0, 'Segmentación no tiene particiones ni marcos.');
  const expected = new Map();
  for (const program of state.programs) {
    requireState(program.pageTable.length === 0, 'Tabla de páginas en segmentación.');
    const regions = program.status === 'allocated' ? getProcessRegions(program) : [];
    requireState(program.segmentTable.length === regions.length, 'Cantidad incorrecta de descriptores.');
    for (const [index, region] of regions.entries()) {
      const descriptor = program.segmentTable[index];
      requireState(descriptor.segmentNumber === index && descriptor.regionId === region.regionId && descriptor.limitBytes === region.sizeBytes && descriptor.name === region.name && descriptor.kind === region.kind, 'Descriptor incompatible con su región.');
      requireState(['read', 'write', 'execute'].every(key => descriptor.permissions?.[key] === region.permissions[key]), 'Permisos del descriptor inconsistentes.');
      const key = `${program.id}/${descriptor.regionId}`;
      requireState(!expected.has(key), 'Región duplicada.');
      expected.set(key, descriptor);
    }
  }
  for (const block of state.blocks) {
    requireState(['OS', 'HOLE', 'SEGMENT'].includes(block.kind), 'Bloque ajeno al modelo segmentado.');
    if (block.kind !== 'SEGMENT') continue;
    const key = `${block.programId}/${block.regionId}`, descriptor = expected.get(key);
    requireState(descriptor && descriptor.base === block.start && descriptor.limitBytes === block.sizeBytes && block.start >= state.config.osBytes, 'Segmento sin descriptor o con propietario/rango incorrecto.');
    expected.delete(key);
  }
  requireState(expected.size === 0, 'Descriptor sin bloque físico.');
  for (let i = 1; i < state.blocks.length; i++) requireState(!(state.blocks[i - 1].kind === 'HOLE' && state.blocks[i].kind === 'HOLE'), 'Huecos adyacentes sin fusionar.');
}

export function assertPaged(state) {
  const Q = state.config.pageSizeBytes, osFrames = state.config.osBytes / Q;
  requireState(PAGE_SIZES.includes(Q) && Number.isInteger(osFrames), 'Configuración paginada inválida.');
  requireState(state.partitions.length === 0 && state.frames.length === TOTAL_MEMORY_BYTES / Q, 'Cantidad de marcos incorrecta.');
  const expected = new Map();
  for (const program of state.programs) {
    requireState(program.segmentTable.length === 0, 'Descriptores segmentados en paginación.');
    const count = program.status === 'allocated' ? Math.ceil(program.sizeBytes / Q) : 0;
    requireState(program.pageTable.length === count, 'Cantidad de páginas incorrecta.');
    for (const [index, page] of program.pageTable.entries()) {
      requireState(page.pageNumber === index && Number.isSafeInteger(page.frameNumber) && page.frameNumber >= osFrames && page.frameNumber < state.frames.length, 'Página o marco fuera de rango.');
      requireState(page.usedBytes === Math.min(Q, program.sizeBytes - index * Q), 'Bytes útiles de página incorrectos.');
      requireState(!expected.has(page.frameNumber), 'Marco duplicado en tablas.');
      expected.set(page.frameNumber, { programId: program.id, pageNumber: index });
    }
  }
  for (const [index, frame] of state.frames.entries()) {
    requireState(frame.frameNumber === index && ['OS', 'FREE', 'PAGE'].includes(frame.ownerKind), 'Identidad o clase de marco inválida.');
    if (index < osFrames) requireState(frame.ownerKind === 'OS' && frame.programId === null && frame.pageNumber === null, 'Marco del SO alterado.');
    else if (frame.ownerKind === 'FREE') requireState(frame.programId === null && frame.pageNumber === null && !expected.has(index), 'Marco libre con propietario.');
    else {
      const owner = expected.get(index);
      requireState(frame.ownerKind === 'PAGE' && owner && owner.programId === frame.programId && owner.pageNumber === frame.pageNumber, 'Marco ocupado sin página válida.');
      expected.delete(index);
    }
  }
  requireState(expected.size === 0, 'Página sin marco asignado.');
  const projection = projectFrames(state.frames, Q);
  requireState(projection.length === state.blocks.length && projection.every((block, index) => Object.keys(block).every(key => block[key] === state.blocks[index][key])), 'La proyección de marcos no coincide con los bloques.');
}
