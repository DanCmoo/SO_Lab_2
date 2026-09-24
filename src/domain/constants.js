export const BYTE = 1;
export const KIB = 1024 * BYTE;
export const MIB = 1024 * KIB;
export const TOTAL_MEMORY_BYTES = 16 * MIB; // 16,777,216 bytes
export const MIN_ADDRESS = 0x000000;
export const MAX_ADDRESS = 0xFFFFFF;
export const DEFAULT_OS_BYTES = 1 * MIB;
export const STATE_SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'mms:simulation:v1';

export const MemoryMode = Object.freeze({
  STATIC_EQUAL: 'STATIC_EQUAL',
  STATIC_UNEQUAL: 'STATIC_UNEQUAL',
  DYNAMIC_NO_COMPACTION: 'DYNAMIC_NO_COMPACTION',
  DYNAMIC_COMPACTION: 'DYNAMIC_COMPACTION'
});

export const AllocationAlgorithm = Object.freeze({
  FIRST_FIT: 'FIRST_FIT',
  BEST_FIT: 'BEST_FIT',
  WORST_FIT: 'WORST_FIT'
});

export const ProgramStatus = Object.freeze({
  READY: 'ready',
  ALLOCATED: 'allocated',
  TERMINATED: 'terminated',
  REJECTED: 'rejected'
});

export const BlockKind = Object.freeze({
  OS: 'OS',
  PARTITION: 'PARTITION',
  PROCESS: 'PROCESS',
  HOLE: 'HOLE'
});

export const SimulationPhase = Object.freeze({
  CONFIGURING: 'CONFIGURING',
  RUNNING: 'RUNNING'
});

export const DEFAULT_STATIC_EQUAL_COUNT = 5;
export const DEFAULT_STATIC_UNEQUAL_SIZES = Object.freeze([
  1 * MIB,
  2 * MIB,
  3 * MIB,
  4 * MIB,
  5 * MIB
]);
