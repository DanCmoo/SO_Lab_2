import { MemoryMode } from './constants.js';
import { DomainError, ErrorCode } from './errors.js';

/** Clasificación explícita; agregar un enum nunca habilita un motor por defecto. */
export function memoryModel(mode) {
  switch (mode) {
    case MemoryMode.STATIC_EQUAL:
    case MemoryMode.STATIC_UNEQUAL: return 'static';
    case MemoryMode.DYNAMIC_NO_COMPACTION:
    case MemoryMode.DYNAMIC_COMPACTION: return 'dynamic';
    case MemoryMode.SEGMENTATION: return 'segmented';
    case MemoryMode.PAGING: return 'paged';
    default: throw new DomainError(ErrorCode.INVALID_CONFIGURATION, `Modo de memoria no implementado: ${mode}`);
  }
}
