import {
  TOTAL_MEMORY_BYTES,
  DEFAULT_OS_BYTES,
  STATE_SCHEMA_VERSION,
  MemoryMode,
  AllocationAlgorithm,
  ProgramStatus,
  BlockKind,
  SimulationPhase,
  DEFAULT_STATIC_EQUAL_COUNT,
  DEFAULT_STATIC_UNEQUAL_SIZES
} from './constants.js';
import { endAddress } from './address.js';
import { DomainError, ErrorCode } from './errors.js';

/**
 * Creates a validated segment.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.name
 * @param {number} params.sizeBytes
 * @returns {import('./constants.js').Segment}
 */
export function createSegment({ id, name, sizeBytes }) {
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
    sizeBytes
  });
}

/**
 * Creates a validated program.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.name
 * @param {string} [params.colorToken]
 * @param {Array<{id: string, name: string, sizeBytes: number}>} params.segments
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
      sizeBytes: seg.sizeBytes
    })
  );

  const totalSize = validSegments.reduce((sum, seg) => sum + seg.sizeBytes, 0);
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
    sizeBytes: totalSize,
    status,
    arrivalOrder,
    start,
    end,
    containerId
  });
}

/**
 * Creates a static partition object.
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
 * Creates a unified memory block (OS, PARTITION, PROCESS, HOLE).
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.kind
 * @param {number} params.start
 * @param {number} params.sizeBytes
 * @param {string|null} [params.programId=null]
 * @returns {import('./constants.js').MemoryBlock}
 */
export function createMemoryBlock({ id, kind, start, sizeBytes, programId = null }) {
  if (!Object.values(BlockKind).includes(kind)) {
    throw new DomainError(ErrorCode.STATE_INVARIANT_FAILED, `Invalid block kind: ${kind}`);
  }
  const end = endAddress(start, sizeBytes);
  return Object.freeze({
    id,
    kind,
    start,
    sizeBytes,
    end,
    programId
  });
}

/**
 * Creates a validated simulation config.
 * @param {Partial<import('./constants.js').SimulationConfig>} [overrides]
 * @returns {import('./constants.js').SimulationConfig}
 */
export function createSimulationConfig(overrides = {}) {
  const mode = overrides.mode || MemoryMode.STATIC_EQUAL;
  const algorithm = overrides.algorithm || AllocationAlgorithm.FIRST_FIT;
  const totalBytes = TOTAL_MEMORY_BYTES;
  const osBytes = overrides.osBytes ?? DEFAULT_OS_BYTES;

  if (!Number.isSafeInteger(osBytes) || osBytes < 0 || osBytes >= totalBytes) {
    throw new DomainError(
      ErrorCode.INVALID_CONFIGURATION,
      `OS size must be between 0 and less than ${totalBytes} bytes`
    );
  }

  const userBytes = totalBytes - osBytes;

  let equalPartitionCount = null;
  let unequalPartitionSizes = [];

  if (mode === MemoryMode.STATIC_EQUAL) {
    equalPartitionCount = overrides.equalPartitionCount ?? DEFAULT_STATIC_EQUAL_COUNT;
    if (!Number.isSafeInteger(equalPartitionCount) || equalPartitionCount <= 0) {
      throw new DomainError(ErrorCode.INVALID_CONFIGURATION, 'Equal partition count must be a positive integer');
    }
    if (userBytes % equalPartitionCount !== 0) {
      throw new DomainError(
        ErrorCode.INVALID_CONFIGURATION,
        `User memory (${userBytes} bytes) cannot be divided equally into ${equalPartitionCount} partitions without remainder`
      );
    }
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
    equalPartitionCount,
    unequalPartitionSizes: Object.freeze(unequalPartitionSizes)
  });
}

/**
 * Creates the initial simulation state.
 * @param {Partial<import('./constants.js').SimulationConfig>} [configOverrides]
 * @param {import('./constants.js').Program[]} [initialPrograms]
 * @returns {import('./constants.js').SimulationState}
 */
export function createInitialState(configOverrides = {}, initialPrograms = []) {
  const config = createSimulationConfig(configOverrides);
  const osBlock = createMemoryBlock({
    id: 'BLOCK-OS',
    kind: BlockKind.OS,
    start: 0,
    sizeBytes: config.osBytes,
    programId: null
  });

  let partitions = [];
  let blocks = [];

  if (config.mode === MemoryMode.STATIC_EQUAL) {
    const userBytes = config.totalBytes - config.osBytes;
    const partitionSize = userBytes / config.equalPartitionCount;
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
  } else {
    // Dynamic modes: single initial hole covering all user memory if userBytes > 0
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

  // Prepend OS block
  blocks.unshift(osBlock);

  return Object.freeze({
    schemaVersion: STATE_SCHEMA_VERSION,
    phase: SimulationPhase.CONFIGURING,
    config,
    programs: Object.freeze([...initialPrograms]),
    partitions: Object.freeze(partitions),
    blocks: Object.freeze(blocks),
    history: Object.freeze([]),
    nextSequence: 1,
    selectedId: null,
    lastTrace: null
  });
}
