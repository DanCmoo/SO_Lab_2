import { MemoryMode, ProgramStatus, MAX_ADDRESS } from './constants.js';
import { DomainError, ErrorCode } from './errors.js';

/** Entero decimal o hexadecimal completo; cero es un desplazamiento válido. */
export function parseAddressInput(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== 'string' || !/^(?:\d+|0x[0-9a-f]+)$/i.test(value.trim())) throw new DomainError(ErrorCode.INVALID_LOGICAL_ADDRESS, 'Usa un entero decimal o hexadecimal completo, sin signo.');
  const result = Number(value.trim());
  if (!Number.isSafeInteger(result) || result < 0) throw new DomainError(ErrorCode.INVALID_LOGICAL_ADDRESS);
  return result;
}

/** Consulta pura de una referencia de un byte; nunca cambia memoria ni deshacer. */
export function translateAddress(state, request) {
  const program = state.programs.find(p => p.id === request.instanceId);
  if (!program || program.status !== ProgramStatus.ALLOCATED) throw new DomainError(ErrorCode.PROGRAM_NOT_RESIDENT);
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  if (state.config.mode === MemoryMode.SEGMENTATION) {
    const { segmentNumber, offset, operation } = request;
    if (!integer(segmentNumber) || !program.segmentTable[segmentNumber]) throw new DomainError(ErrorCode.INVALID_SELECTOR, 'Segmento inexistente en esta instancia.');
    const key = { READ: 'read', WRITE: 'write', EXECUTE: 'execute' }[operation];
    if (!key) throw new DomainError(ErrorCode.INVALID_OPERATION, 'Operación R/W/X desconocida.');
    const descriptor = program.segmentTable[segmentNumber];
    if (!integer(offset) || offset >= descriptor.limitBytes) throw new DomainError(ErrorCode.INVALID_LOGICAL_ADDRESS, 'Desplazamiento fuera del límite del segmento.');
    if (!descriptor.permissions[key]) throw new DomainError(ErrorCode.ACCESS_DENIED, 'El segmento no permite esta operación.');
    const block = state.blocks.find(b => b.kind === 'SEGMENT' && b.programId === program.id && b.regionId === descriptor.regionId);
    if (!block || block.start !== descriptor.base || block.sizeBytes !== descriptor.limitBytes) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED);
    const physicalAddress = descriptor.base + offset;
    if (physicalAddress > MAX_ADDRESS || physicalAddress < state.config.osBytes) throw new DomainError(ErrorCode.ADDRESS_OUT_OF_RANGE);
    return { descriptor, segmentNumber, offset, base: descriptor.base, physicalAddress, blockId: block.id, formula: `${descriptor.base} + ${offset} = ${physicalAddress}` };
  }
  if (state.config.mode === MemoryMode.PAGING) {
    const Q = state.config.pageSizeBytes;
    let logicalAddress;
    if (request.format === 'linear') logicalAddress = request.logicalAddress;
    else if (request.format === 'pair') {
      if (!integer(request.pageNumber) || !integer(request.offset) || request.offset >= Q) throw new DomainError(ErrorCode.INVALID_LOGICAL_ADDRESS, 'Página o desplazamiento inválido.');
      logicalAddress = request.pageNumber * Q + request.offset;
    } else throw new DomainError(ErrorCode.INVALID_LOGICAL_ADDRESS, 'Formato lógico desconocido.');
    if (!integer(logicalAddress) || logicalAddress >= program.sizeBytes) throw new DomainError(ErrorCode.INVALID_LOGICAL_ADDRESS, 'Dirección fuera del tamaño lógico; el relleno no es accesible.');
    const pageNumber = Math.floor(logicalAddress / Q), offset = logicalAddress % Q;
    const entry = program.pageTable[pageNumber];
    const frame = entry && state.frames[entry.frameNumber];
    if (!frame || frame.ownerKind !== 'PAGE' || frame.programId !== program.id || frame.pageNumber !== pageNumber || entry.pageNumber !== pageNumber || entry.frameNumber < state.config.osBytes / Q) throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED);
    const physicalAddress = entry.frameNumber * Q + offset;
    if (physicalAddress > MAX_ADDRESS) throw new DomainError(ErrorCode.ADDRESS_OUT_OF_RANGE);
    return { logicalAddress, pageNumber, offset, frameNumber: entry.frameNumber, base: entry.frameNumber * Q, physicalAddress, blockId: `FRAME-${entry.frameNumber}`, formula: `${entry.frameNumber} × ${Q} + ${offset} = ${physicalAddress}` };
  }
  throw new DomainError(ErrorCode.INVALID_CONFIGURATION, 'El traductor corresponde a segmentación o paginación.');
}
