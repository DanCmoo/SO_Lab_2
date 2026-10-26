import { getProcessRegions } from './process-regions.js';

/** Intersecciones de una página con las regiones lógicas, sin redondear cada región. */
export function getPageDetails(program, pageNumber, pageSizeBytes) {
  const entry = program.pageTable[pageNumber];
  if (!entry) return null;
  const logicalStart = pageNumber * pageSizeBytes;
  const logicalEnd = logicalStart + entry.usedBytes - 1;
  let regionStart = 0;
  const regions = [];
  for (const region of getProcessRegions(program)) {
    const start = Math.max(logicalStart, regionStart);
    const end = Math.min(logicalEnd, regionStart + region.sizeBytes - 1);
    if (start <= end) regions.push({ name: region.name, start, end, bytes: end - start + 1 });
    regionStart += region.sizeBytes;
  }
  return { logicalStart, logicalEnd, usedBytes: entry.usedBytes, paddingBytes: pageSizeBytes - entry.usedBytes, regions };
}
