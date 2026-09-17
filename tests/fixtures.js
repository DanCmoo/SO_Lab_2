import { MIB } from '../src/domain/constants.js';

/**
 * Dispositivo de prueba requerido para asignadores según la especificación técnica §25.2.
 */
export const ALLOCATOR_FIXTURE = Object.freeze({
  holes: Object.freeze([
    { id: 'H1', start: 0x100000, capacityBytes: 4 * MIB, type: 'hole' },
    { id: 'H2', start: 0x500000, capacityBytes: 3 * MIB, type: 'hole' },
    { id: 'H3', start: 0x800000, capacityBytes: 5 * MIB, type: 'hole' }
  ]),
  requestBytes: 2 * MIB
});

/**
 * Dispositivo de prueba para desempates con tamaños iguales en direcciones distintas.
 */
export const TIE_BREAK_FIXTURE = Object.freeze({
  candidates: Object.freeze([
    { id: 'C2', start: 0x600000, capacityBytes: 3 * MIB, type: 'hole' },
    { id: 'C1', start: 0x200000, capacityBytes: 3 * MIB, type: 'hole' },
    { id: 'C3', start: 0x900000, capacityBytes: 3 * MIB, type: 'hole' }
  ]),
  requestBytes: 2 * MIB
});
