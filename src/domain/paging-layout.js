import { TOTAL_MEMORY_BYTES } from './constants.js';

/** @returns {Array<{frameNumber:number, ownerKind:string, programId:string|null, pageNumber:number|null}>} */
export function createFrames(config) {
  return Array.from({ length: TOTAL_MEMORY_BYTES / config.pageSizeBytes }, (_, frameNumber) => ({
    frameNumber, ownerKind: frameNumber < config.osBytes / config.pageSizeBytes ? 'OS' : 'FREE', programId: null, pageNumber: null
  }));
}

/** Proyección determinista de la ocupación canónica; agrupa solo SO y libres. */
export function projectFrames(frames, pageSizeBytes) {
  const blocks = [];
  for (const frame of frames) {
    const kind = { OS: 'OS', FREE: 'HOLE', PAGE: 'PAGE' }[frame.ownerKind];
    const previous = blocks.at(-1);
    if (kind !== 'PAGE' && previous?.kind === kind) {
      previous.sizeBytes += pageSizeBytes;
      previous.end += pageSizeBytes;
    } else {
      const start = frame.frameNumber * pageSizeBytes;
      blocks.push({ id: kind === 'PAGE' ? `FRAME-${frame.frameNumber}` : `${kind}-FRAME-${frame.frameNumber}`,
        kind, start, end: start + pageSizeBytes - 1, sizeBytes: pageSizeBytes, programId: frame.programId,
        ...(kind === 'PAGE' ? { frameNumber: frame.frameNumber, pageNumber: frame.pageNumber } : {}) });
    }
  }
  return blocks;
}
