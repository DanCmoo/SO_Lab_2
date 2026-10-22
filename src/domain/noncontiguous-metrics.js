import { TOTAL_MEMORY_BYTES } from './constants.js';

export function deriveNoncontiguousMetrics(state) {
  const paged = state.config.mode === 'PAGING';
  const resident = state.programs.filter(p => p.status === 'allocated');
  const useful = resident.reduce((sum, p) => sum + p.sizeBytes, 0);
  const pages = resident.reduce((sum, p) => sum + p.pageTable.length, 0);
  const allocated = paged ? pages * state.config.pageSizeBytes : useful;
  const holes = state.blocks.filter(b => b.kind === 'HOLE');
  const freeFrames = paged ? state.frames.filter(f => f.ownerKind === 'FREE').length : 0;
  const userBytes = TOTAL_MEMORY_BYTES - state.config.osBytes;
  return {
    totalMemoryBytes: TOTAL_MEMORY_BYTES, osBytes: state.config.osBytes, userBytes,
    allocatedProgramBytes: useful, allocatedPhysicalBytes: allocated, freeBytes: userBytes - allocated,
    internalFragmentationBytes: allocated - useful, unpartitionedBytes: 0, externalFragmentationDetected: false,
    externalFragmentationApplicable: !paged, largestFreeBlockBytes: paged ? (freeFrames ? state.config.pageSizeBytes : 0) : Math.max(0, ...holes.map(b => b.sizeBytes)),
    freeBlockCount: paged ? freeFrames : holes.length, residentProgramCount: resident.length,
    residentSegmentCount: resident.reduce((sum, p) => sum + p.segmentTable.length, 0), allocatedPageCount: pages,
    totalFrameCount: paged ? state.frames.length : 0, osFrameCount: paged ? state.config.osBytes / state.config.pageSizeBytes : 0,
    freeFrameCount: freeFrames, occupiedUserFrameCount: pages,
    utilizationPercent: Number((useful / userBytes * 100).toFixed(2)), physicalUtilizationPercent: Number((allocated / userBytes * 100).toFixed(2)),
    lastProbeCount: state.lastTrace?.probes || 0, lastCompactionBytesMoved: 0
  };
}
