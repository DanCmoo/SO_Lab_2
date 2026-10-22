import { ProgramStatus } from '../domain/constants.js';
import { DomainError, ErrorCode } from '../domain/errors.js';
import { projectFrames } from '../domain/paging-layout.js';
import { createRuntimeRegions } from './process-memory.js';

export function allocatePaged(state, programId) {
  const program = state.programs.find(p => p.id === programId);
  if (!program) throw new DomainError(ErrorCode.INVALID_PROGRAM);
  if (program.status !== ProgramStatus.READY) throw new DomainError(ErrorCode.PROGRAM_NOT_READY);
  const Q = state.config.pageSizeBytes;
  const pageCount = Math.ceil(program.sizeBytes / Q);
  const free = state.frames.filter(frame => frame.ownerKind === 'FREE');
  const trace = { algorithm: 'ASCENDING_FREE_FRAMES', requestBytes: program.sizeBytes, pageCount, availableFrames: free.length, physicalBytes: pageCount * Q, probes: 0, reason: 'SUCCESS' };
  if (free.length < pageCount) {
    trace.reason = 'INSUFFICIENT_FRAMES';
    throw new DomainError(ErrorCode.INSUFFICIENT_FRAMES, `Se requieren ${pageCount} marcos y hay ${free.length} libres.`, { trace });
  }
  const selected = new Map(free.slice(0, pageCount).map((frame, pageNumber) => [frame.frameNumber, pageNumber]));
  const frames = state.frames.map(frame => selected.has(frame.frameNumber)
    ? { ...frame, ownerKind: 'PAGE', programId, pageNumber: selected.get(frame.frameNumber) } : frame);
  const pageTable = free.slice(0, pageCount).map((frame, pageNumber) => ({ pageNumber, frameNumber: frame.frameNumber, usedBytes: Math.min(Q, program.sizeBytes - pageNumber * Q) }));
  trace.frameNumbers = pageTable.map(page => page.frameNumber);
  return { state: { ...state, frames, blocks: projectFrames(frames, Q), programs: state.programs.map(p => p.id === programId ? {
    ...p, status: ProgramStatus.ALLOCATED, start: null, end: null, containerId: null, pageTable, segmentTable: [], runtimeRegions: createRuntimeRegions(p)
  } : p), lastTrace: trace }, trace };
}

export function terminatePaged(state, programId) {
  const program = state.programs.find(p => p.id === programId);
  if (!program) throw new DomainError(ErrorCode.INVALID_PROGRAM);
  if (program.status !== ProgramStatus.ALLOCATED) throw new DomainError(ErrorCode.PROGRAM_NOT_RESIDENT);
  const frames = state.frames.map(frame => frame.programId === programId ? { ...frame, ownerKind: 'FREE', programId: null, pageNumber: null } : frame);
  return { ...state, frames, blocks: projectFrames(frames, state.config.pageSizeBytes), programs: state.programs.map(p => p.id === programId ? {
    ...p, status: ProgramStatus.TERMINATED, start: null, end: null, containerId: null, pageTable: [], segmentTable: [], runtimeRegions: []
  } : p) };
}
