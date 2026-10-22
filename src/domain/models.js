import {
  TOTAL_MEMORY_BYTES,
  DEFAULT_OS_BYTES,
  STATE_SCHEMA_VERSION,
  MemoryMode,
  AllocationAlgorithm,
  ProgramStatus,
  BlockKind,
  SimulationPhase,
  DEFAULT_STATIC_EQUAL_SIZE,
  DEFAULT_STATIC_UNEQUAL_SIZES,
  PAGE_SIZES, DEFAULT_PAGE_SIZE
} from './constants.js';
import { endAddress } from './address.js';
import { DomainError, ErrorCode } from './errors.js';
import { memoryModel } from './memory-mode.js';
import { regionPermissions } from './process-regions.js';
import { createFrames, projectFrames } from './paging-layout.js';

/**
 * Crea un segmento validado.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.name
 * @param {number} params.sizeBytes
 * @returns {import('./constants.js').Segment}
 */
export function createSegment({ id, name, sizeBytes, permissions }) {
  if (!id || typeof id !== 'string') {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Segment id is required');
  }
  const cleanName = (name || '').trim();
  if (cleanName.length < 1 || cleanName.length > 40) {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Segment name must be between 1 and 40 characters');
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, `Segment ${cleanName} must have a positive safe integer size`);
  }
  return Object.freeze({
    id,
    name: cleanName,
    permissions: regionPermissions(cleanName, permissions),
    sizeBytes
  });
}

/**
 * Crea un programa validado.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.name
 * @param {string} [params.colorToken]
 * @param {Array<{id: string, name: string, sizeBytes: number}>} params.segments
 * @param {{heapBytes?: number, stackBytes?: number}} [params.runtimeMemory] Reservas solicitadas al SO.
 * @param {number} [params.arrivalOrder=0]
 * @param {string} [params.status=ProgramStatus.READY]
 * @param {number|null} [params.start=null]
 * @param {number|null} [params.end=null]
 * @param {string|null} [params.containerId=null]
 * @returns {import('./constants.js').Program}
 */
export function createProgram({
  id,
  name,
  colorToken = 'var(--color-prog-1)',
  segments,
  runtimeMemory = {},
  arrivalOrder = 0,
  status = ProgramStatus.READY,
  start = null,
  end = null,
  containerId = null
}) {
  if (!id || typeof id !== 'string') {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Program id is required');
  }
  const cleanName = (name || '').trim();
  if (cleanName.length < 1 || cleanName.length > 60) {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Program name must be between 1 and 60 characters');
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Program must contain at least one segment');
  }

  const validSegments = segments.map((seg, idx) =>
    createSegment({
      id: seg.id || `${id}-SEG-${idx + 1}`,
      name: seg.name,
      permissions: seg.permissions,
      sizeBytes: seg.sizeBytes
    })
  );

  if (validSegments.some(seg => /^(heap|stack)$/i.test(seg.name))) {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Heap and stack must be requested as runtime memory, not program segments');
  }
  if (!runtimeMemory || typeof runtimeMemory !== 'object') {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Runtime memory request must be an object');
  }
  const heapBytes = runtimeMemory.heapBytes ?? 0;
  const stackBytes = runtimeMemory.stackBytes ?? 0;
  for (const bytes of [heapBytes, stackBytes]) {
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Runtime memory sizes must be non-negative safe integers');
    }
  }

  const imageSizeBytes = validSegments.reduce((sum, seg) => sum + seg.sizeBytes, 0);
  const totalSize = imageSizeBytes + heapBytes + stackBytes;
  if (!Number.isSafeInteger(totalSize) || totalSize <= 0) {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Total program size must be a positive integer');
  }
  if (totalSize > TOTAL_MEMORY_BYTES) {
    throw new DomainError(ErrorCode.PROGRAM_TOO_LARGE, 'Program size exceeds total physical memory');
  }

  return Object.freeze({
    id,
    name: cleanName,
    colorToken,
    segments: validSegments,
    imageSizeBytes,
    runtimeMemory: Object.freeze({ heapBytes, stackBytes }),
    runtimeRegions: Object.freeze([]),
    segmentTable: Object.freeze([]),
    pageTable: Object.freeze([]),
    sizeBytes: totalSize,
    status,
    arrivalOrder,
    start,
    end,
    containerId
  });
}

/**
 * Crea un objeto de partición estática.
 * @param {Object} params
 * @param {string} params.id
 * @param {number} params.start
 * @param {number} params.sizeBytes
 * @param {string|null} [params.programId=null]
 * @returns {import('./constants.js').Partition}
 */
export function createPartition({ id, start, sizeBytes, programId = null }) {
  const end = endAddress(start, sizeBytes);
  return Object.freeze({
    id,
    start,
    sizeBytes,
    end,
    programId
  });
}

/**
 * Crea un bloque de memoria unificado (sistema operativo, partición, proceso o hueco).
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.kind
 * @param {number} params.start
 * @param {number} params.sizeBytes
 * @param {string|null} [params.programId=null]
 * @returns {import('./constants.js').MemoryBlock}
 */
export function createMemoryBlock({ id, kind, start, sizeBytes, programId = null, regionId }) {
  if (!Object.values(BlockKind).includes(kind)) {
    throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Invalid block kind: ${kind}`);
  }
  const end = endAddress(start, sizeBytes);
  return Object.freeze({
    id,
    kind,
    ...(regionId !== undefined ? { regionId } : {}),
    start,
    sizeBytes,
    end,
    programId
  });
}

/**
 * Crea una configuración de simulación validada.
 * @param {Partial<import('./constants.js').SimulationConfig>} [overrides]
 * @returns {import('./constants.js').SimulationConfig}
 */
export function createSimulationConfig(overrides = {}) {
  const mode = overrides.mode === undefined ? MemoryMode.STATIC_EQUAL : overrides.mode;
  memoryModel(mode);
  const algorithm = overrides.algorithm === undefined ? AllocationAlgorithm.FIRST_FIT : overrides.algorithm;
  if (!Object.values(AllocationAlgorithm).includes(algorithm)) throw new DomainError(ErrorCode.INVALID_CONFIGURATION, 'Algoritmo no reconocido.');
  const totalBytes = TOTAL_MEMORY_BYTES;
  const osBytes = overrides.osBytes ?? DEFAULT_OS_BYTES;

  if (!Number.isSafeInteger(osBytes) || osBytes < 0 || osBytes >= totalBytes) {
    throw new DomainError(
      ErrorCode.INVALID_CONFIGURATION,
      `OS size must be between 0 and less than ${totalBytes} bytes`
    );
  }

  const userBytes = totalBytes - osBytes;
  const pageSizeBytes = mode === MemoryMode.PAGING ? overrides.pageSizeBytes ?? DEFAULT_PAGE_SIZE : null;
  if (mode === MemoryMode.PAGING && (!PAGE_SIZES.includes(pageSizeBytes) || osBytes % pageSizeBytes !== 0)) {
    throw new DomainError(ErrorCode.INVALID_CONFIGURATION, 'El tamaño de página debe ser 1, 2, 4, 8, 16 o 64 KiB y la reserva del SO debe ser múltiplo de ese tamaño.');
  }

  let equalPartitionCount = null;
  let equalPartitionSizeBytes = null;
  let unequalPartitionSizes = [];

  if (mode === MemoryMode.STATIC_EQUAL) {
    equalPartitionSizeBytes = overrides.equalPartitionSizeBytes ?? DEFAULT_STATIC_EQUAL_SIZE;
    if (!Number.isSafeInteger(equalPartitionSizeBytes) || equalPartitionSizeBytes <= 0 || equalPartitionSizeBytes > userBytes) {
      throw new DomainError(ErrorCode.INVALID_CONFIGURATION, 'Equal partition size must be a positive integer no larger than user memory');
    }
    equalPartitionCount = Math.floor(userBytes / equalPartitionSizeBytes);
  } else if (mode === MemoryMode.STATIC_UNEQUAL) {
    unequalPartitionSizes = overrides.unequalPartitionSizes
      ? [...overrides.unequalPartitionSizes]
      : [...DEFAULT_STATIC_UNEQUAL_SIZES];

    if (!Array.isArray(unequalPartitionSizes) || unequalPartitionSizes.length === 0) {
      throw new DomainError(ErrorCode.INVALID_CONFIGURATION, 'Unequal partition sizes must not be empty');
    }

    const sum = unequalPartitionSizes.reduce((acc, sz) => {
      if (!Number.isSafeInteger(sz) || sz <= 0) {
        throw new DomainError(ErrorCode.INVALID_CONFIGURATION, 'Each partition size must be a positive integer');
      }
      return acc + sz;
    }, 0);

    if (sum !== userBytes) {
      throw new DomainError(
        ErrorCode.INVALID_CONFIGURATION,
        `Sum of unequal partitions (${sum} bytes) must exactly match available user memory (${userBytes} bytes)`
      );
    }
  }

  return Object.freeze({
    mode,
    algorithm,
    totalBytes,
    osBytes,
    pageSizeBytes,
    equalPartitionSizeBytes,
    equalPartitionCount,
    unequalPartitionSizes: Object.freeze(unequalPartitionSizes)
  });
}

/**
 * Crea el estado inicial de la simulación.
 * @param {Partial<import('./constants.js').SimulationConfig>} [configOverrides]
 * @param {import('./constants.js').Program[]} [initialPrograms]
 * @returns {import('./constants.js').SimulationState}
 */
export function createInitialState(configOverrides = {}, initialPrograms = []) {
  const validatedConfig = createSimulationConfig(configOverrides);
  // Ordena al construir un mapa nuevo. Validar o restaurar una sesión existente
  // no debe cambiar las direcciones de particiones y procesos ya guardados.
  const config = validatedConfig.mode === MemoryMode.STATIC_UNEQUAL
    ? Object.freeze({
      ...validatedConfig,
      unequalPartitionSizes: Object.freeze([...validatedConfig.unequalPartitionSizes].sort((a, b) => b - a))
    })
    : validatedConfig;
  const osBlock = config.osBytes > 0 ? createMemoryBlock({
    id: 'BLOCK-OS',
    kind: BlockKind.OS,
    start: 0,
    sizeBytes: config.osBytes,
    programId: null
  }) : null;

  let partitions = [];
  let blocks = [];

  if (config.mode === MemoryMode.STATIC_EQUAL) {
    const partitionSize = config.equalPartitionSizeBytes;
    let cursor = config.osBytes;

    for (let i = 0; i < config.equalPartitionCount; i++) {
      const p = createPartition({
        id: `PART-${i + 1}`,
        start: cursor,
        sizeBytes: partitionSize,
        programId: null
      });
      partitions.push(p);
      blocks.push(
        createMemoryBlock({
          id: `BLOCK-PART-${i + 1}`,
          kind: BlockKind.PARTITION,
          start: cursor,
          sizeBytes: partitionSize,
          programId: null
        })
      );
      cursor = p.end + 1;
    }
    if (cursor < config.totalBytes) {
      blocks.push(createMemoryBlock({
        id: 'BLOCK-UNPARTITIONED',
        kind: BlockKind.UNPARTITIONED,
        start: cursor,
        sizeBytes: config.totalBytes - cursor
      }));
    }
  } else if (config.mode === MemoryMode.STATIC_UNEQUAL) {
    let cursor = config.osBytes;
    config.unequalPartitionSizes.forEach((sz, idx) => {
      const p = createPartition({
        id: `PART-${idx + 1}`,
        start: cursor,
        sizeBytes: sz,
        programId: null
      });
      partitions.push(p);
      blocks.push(
        createMemoryBlock({
          id: `BLOCK-PART-${idx + 1}`,
          kind: BlockKind.PARTITION,
          start: cursor,
          sizeBytes: sz,
          programId: null
        })
      );
      cursor = p.end + 1;
    });
  } else if ([MemoryMode.DYNAMIC_NO_COMPACTION, MemoryMode.DYNAMIC_COMPACTION, MemoryMode.SEGMENTATION, MemoryMode.PAGING].includes(config.mode)) {
    // Modos dinámicos: un único hueco inicial que cubre toda la memoria de usuario si hay espacio.
    const userBytes = config.totalBytes - config.osBytes;
    if (userBytes > 0) {
      blocks.push(
        createMemoryBlock({
          id: 'HOLE-INIT',
          kind: BlockKind.HOLE,
          start: config.osBytes,
          sizeBytes: userBytes,
          programId: null
        })
      );
    }
  }

  // Añade el bloque del sistema operativo al principio.
  if (osBlock) blocks.unshift(osBlock);
  const frames = config.mode === MemoryMode.PAGING ? createFrames(config) : [];
  if (config.mode === MemoryMode.PAGING) blocks = projectFrames(frames, config.pageSizeBytes);

  return Object.freeze({
    schemaVersion: STATE_SCHEMA_VERSION,
    phase: SimulationPhase.CONFIGURING,
    config,
    programs: Object.freeze([...initialPrograms]),
    removedDefaultProgramIds: Object.freeze([]),
    partitions: Object.freeze(partitions),
    blocks: Object.freeze(blocks),
    frames: Object.freeze(frames),
    nextSequence: 1,
    selectedId: null,
    lastTrace: null,
    lastCompaction: null
  });
}
