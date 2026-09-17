import { AllocationAlgorithm } from '../domain/constants.js';

/**
 * @typedef {Object} InspectedCandidate
 * @property {string} id
 * @property {number} start
 * @property {number} capacityBytes
 * @property {boolean} suitable
 */

/**
 * @typedef {Object} AllocationTrace
 * @property {string} algorithm
 * @property {number} requestBytes
 * @property {InspectedCandidate[]} inspectedCandidates
 * @property {import('./candidates.js').AllocationCandidate|null} chosenCandidate
 * @property {number} probes
 * @property {'SUCCESS'|'NO_SUITABLE_CANDIDATE'} reason
 */

/**
 * Selecciona un candidato según las políticas de primer, mejor o peor ajuste.
 * Los candidatos DEBEN estar ordenados por dirección inicial ascendente.
 *
 * @param {Array<{id: string, start: number, capacityBytes: number, type: 'partition'|'hole'}>} candidates
 * @param {number} requestBytes
 * @param {string} algorithm
 * @returns {{ candidate: object|null, probes: number, trace: AllocationTrace }}
 */
export function selectCandidate(candidates, requestBytes, algorithm = AllocationAlgorithm.FIRST_FIT) {
  if (!candidates || candidates.length === 0) {
    return {
      candidate: null,
      probes: 0,
      trace: {
        algorithm,
        requestBytes,
        inspectedCandidates: [],
        chosenCandidate: null,
        probes: 0,
        reason: 'NO_SUITABLE_CANDIDATE'
      }
    };
  }

  const inspectedCandidates = [];

  if (algorithm === AllocationAlgorithm.FIRST_FIT) {
    let chosen = null;
    let probes = 0;

    for (let i = 0; i < candidates.length; i++) {
      probes++;
      const candidate = candidates[i];
      const suitable = candidate.capacityBytes >= requestBytes;
      inspectedCandidates.push({
        id: candidate.id,
        start: candidate.start,
        capacityBytes: candidate.capacityBytes,
        suitable
      });

      if (suitable) {
        chosen = candidate;
        break;
      }
    }

    return {
      candidate: chosen,
      probes,
      trace: {
        algorithm,
        requestBytes,
        inspectedCandidates,
        chosenCandidate: chosen,
        probes,
        reason: chosen ? 'SUCCESS' : 'NO_SUITABLE_CANDIDATE'
      }
    };
  }

  // El mejor y el peor ajuste requieren inspeccionar todos los candidatos.
  let chosen = null;
  const isBestFit = algorithm === AllocationAlgorithm.BEST_FIT;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const suitable = candidate.capacityBytes >= requestBytes;
    inspectedCandidates.push({
      id: candidate.id,
      start: candidate.start,
      capacityBytes: candidate.capacityBytes,
      suitable
    });

    if (suitable) {
      if (!chosen) {
        chosen = candidate;
      } else if (isBestFit) {
        // Menor capacidad; en caso de empate, menor dirección inicial.
        if (
          candidate.capacityBytes < chosen.capacityBytes ||
          (candidate.capacityBytes === chosen.capacityBytes && candidate.start < chosen.start)
        ) {
          chosen = candidate;
        }
      } else {
        // Peor ajuste: mayor capacidad; en caso de empate, menor dirección inicial.
        if (
          candidate.capacityBytes > chosen.capacityBytes ||
          (candidate.capacityBytes === chosen.capacityBytes && candidate.start < chosen.start)
        ) {
          chosen = candidate;
        }
      }
    }
  }

  const probes = candidates.length;

  return {
    candidate: chosen,
    probes,
    trace: {
      algorithm,
      requestBytes,
      inspectedCandidates,
      chosenCandidate: chosen,
      probes,
      reason: chosen ? 'SUCCESS' : 'NO_SUITABLE_CANDIDATE'
    }
  };
}
