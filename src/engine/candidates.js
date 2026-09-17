import { BlockKind, MemoryMode } from '../domain/constants.js';

/**
 * Extrae candidatos de asignación normalizados a partir de un estado.
 * Todos los candidatos se ordenan por dirección inicial ascendente.
 *
 * @param {import('../domain/constants.js').SimulationState} state
 * @returns {Array<{id: string, start: number, capacityBytes: number, type: 'partition'|'hole'}>}
 */
export function extractCandidates(state) {
  const { config, partitions, blocks } = state;

  if (config.mode === MemoryMode.STATIC_EQUAL || config.mode === MemoryMode.STATIC_UNEQUAL) {
    return partitions
      .filter(p => p.programId === null)
      .map(p => ({
        id: p.id,
        start: p.start,
        capacityBytes: p.sizeBytes,
        type: 'partition'
      }))
      .sort((a, b) => a.start - b.start);
  }

  // Modos dinámicos.
  return blocks
    .filter(b => b.kind === BlockKind.HOLE)
    .map(h => ({
      id: h.id,
      start: h.start,
      capacityBytes: h.sizeBytes,
      type: 'hole'
    }))
    .sort((a, b) => a.start - b.start);
}
