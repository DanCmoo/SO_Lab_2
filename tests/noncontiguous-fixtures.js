import { MemoryMode, MIB, KIB } from '../src/domain/constants.js';
import { createInitialState, createProgram } from '../src/domain/models.js';
import { getDefaultPrograms } from '../src/data/default-programs.js';
import { allocate, terminate } from '../src/engine/simulator.js';
import { projectFrames } from '../src/domain/paging-layout.js';
import { assertState } from '../src/domain/invariants.js';

export const program = (id, sizes, runtimeMemory = {}) => createProgram({ id, name: id, segments: sizes.map((sizeBytes, i) => ({ name: i ? 'Data' : 'Code', sizeBytes })), runtimeMemory });

export function segmentedHoles(sizes) {
  const fillers = sizes.map((size, i) => program(`F${i}`, [size]));
  let state = createInitialState({ mode: MemoryMode.SEGMENTATION }, [...fillers, ...getDefaultPrograms()]);
  for (const filler of fillers) state = allocate(state, filler.id).state;
  for (let i = 0; i < fillers.length; i += 2) state = terminate(state, fillers[i].id);
  assertState(state);
  return state;
}

export function sparsePaged() {
  let state = createInitialState({ mode: MemoryMode.PAGING }, []);
  const free = new Set([256, 260, 300]);
  const occupied = state.frames.filter(frame => frame.ownerKind === 'FREE' && !free.has(frame.frameNumber));
  const filler = program('FILLER', [occupied.length * 4096]);
  const target = program('TARGET', [3000, 3000], { heapBytes: 2193, stackBytes: 0 });
  const pageTable = occupied.map((frame, pageNumber) => ({ pageNumber, frameNumber: frame.frameNumber, usedBytes: 4096 }));
  const pages = new Map(pageTable.map(page => [page.frameNumber, page.pageNumber]));
  const frames = state.frames.map(frame => pages.has(frame.frameNumber) ? { ...frame, ownerKind: 'PAGE', programId: filler.id, pageNumber: pages.get(frame.frameNumber) } : frame);
  state = { ...state, frames, blocks: projectFrames(frames, 4096), programs: [{ ...filler, status: 'allocated', pageTable }, target] };
  assertState(state);
  return state;
}
