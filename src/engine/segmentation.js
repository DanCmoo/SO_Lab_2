import { BlockKind, ProgramStatus } from '../domain/constants.js';
import { DomainError, ErrorCode } from '../domain/errors.js';
import { getProcessRegions } from '../domain/process-regions.js';
import { createMemoryBlock } from '../domain/models.js';
import { createRuntimeRegions } from './process-memory.js';
import { coalesce } from './dynamic.js';
import { selectCandidate } from './allocators.js';

export function allocateSegmented(state, programId, algorithmOverride) {
  const program = state.programs.find(p => p.id === programId);
  if (!program) throw new DomainError(ErrorCode.INVALID_PROGRAM);
  if (program.status !== ProgramStatus.READY) throw new DomainError(ErrorCode.PROGRAM_NOT_READY);
  const algorithm = algorithmOverride || state.config.algorithm;
  let blocks = [...state.blocks];
  const trace = { algorithm, requestBytes: program.sizeBytes, probes: 0, steps: [], reason: 'SUCCESS' };
  const totalFree = blocks.filter(b => b.kind === BlockKind.HOLE).reduce((s, b) => s + b.sizeBytes, 0);
  if (totalFree < program.sizeBytes) {
    trace.reason = 'INSUFFICIENT_TOTAL_MEMORY';
    throw new DomainError(ErrorCode.INSUFFICIENT_TOTAL_MEMORY, 'Memoria libre insuficiente para todas las regiones.', { trace, totalFree, requestBytes: program.sizeBytes });
  }
  const segmentTable = [];
  for (const [segmentNumber, region] of getProcessRegions(program).entries()) {
    const candidates = blocks.filter(b => b.kind === BlockKind.HOLE).map(b => ({ id: b.id, start: b.start, capacityBytes: b.sizeBytes, type: 'hole' }));
    const selection = selectCandidate(candidates, region.sizeBytes, algorithm);
    trace.probes += selection.trace.probes;
    trace.steps.push({ ...selection.trace, regionId: region.regionId, name: region.name, segmentNumber });
    if (!selection.candidate) {
      trace.reason = 'EXTERNAL_FRAGMENTATION';
      throw new DomainError(ErrorCode.EXTERNAL_FRAGMENTATION, `No cabe el segmento ${region.name} bajo esta estrategia.`, {
        trace, regionName: region.name, requestBytes: region.sizeBytes,
        totalFree: candidates.reduce((sum, b) => sum + b.capacityBytes, 0), largestHole: Math.max(0, ...candidates.map(b => b.capacityBytes))
      });
    }
    const index = blocks.findIndex(b => b.id === selection.candidate.id);
    const hole = blocks[index];
    const segment = createMemoryBlock({ id: `SEG-${region.regionId}`, kind: BlockKind.SEGMENT, start: hole.start, sizeBytes: region.sizeBytes, programId, regionId: region.regionId });
    const replacement = [segment];
    if (hole.sizeBytes > region.sizeBytes) replacement.push(createMemoryBlock({ id: `HOLE-${segment.id}`, kind: BlockKind.HOLE, start: segment.end + 1, sizeBytes: hole.sizeBytes - region.sizeBytes }));
    blocks.splice(index, 1, ...replacement);
    segmentTable.push({ segmentNumber, regionId: region.regionId, name: region.name, kind: region.kind, base: segment.start, limitBytes: region.sizeBytes, permissions: region.permissions });
  }
  return { state: { ...state, blocks, programs: state.programs.map(p => p.id === programId ? {
    ...p, status: ProgramStatus.ALLOCATED, start: null, end: null, containerId: null,
    segmentTable, pageTable: [], runtimeRegions: createRuntimeRegions(p)
  } : p), lastTrace: trace }, trace };
}

export function terminateSegmented(state, programId) {
  const program = state.programs.find(p => p.id === programId);
  if (!program) throw new DomainError(ErrorCode.INVALID_PROGRAM);
  if (program.status !== ProgramStatus.ALLOCATED) throw new DomainError(ErrorCode.PROGRAM_NOT_RESIDENT);
  const blocks = coalesce(state.blocks.map(block => block.programId === programId
    ? createMemoryBlock({ id: `FREE-${block.id}`, kind: BlockKind.HOLE, start: block.start, sizeBytes: block.sizeBytes }) : block));
  return { ...state, blocks, programs: state.programs.map(p => p.id === programId ? {
    ...p, status: ProgramStatus.TERMINATED, start: null, end: null, containerId: null, segmentTable: [], pageTable: [], runtimeRegions: []
  } : p) };
}
