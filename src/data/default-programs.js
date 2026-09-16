import { KIB, MIB, ProgramStatus } from '../domain/constants.js';
import { createProgram } from '../domain/models.js';

export const DEFAULT_PROGRAM_DEFS = Object.freeze([
  {
    id: 'P1',
    name: 'Compiler',
    colorToken: 'var(--color-prog-1)',
    segments: [
      { id: 'P1-CODE', name: 'Code', sizeBytes: 768 * KIB },
      { id: 'P1-DATA', name: 'Data', sizeBytes: 512 * KIB },
      { id: 'P1-HEAP', name: 'Heap', sizeBytes: 512 * KIB },
      { id: 'P1-STACK', name: 'Stack', sizeBytes: 256 * KIB }
    ]
  },
  {
    id: 'P2',
    name: 'Browser',
    colorToken: 'var(--color-prog-2)',
    segments: [
      { id: 'P2-CODE', name: 'Code', sizeBytes: 1 * MIB },
      { id: 'P2-DATA', name: 'Data', sizeBytes: 768 * KIB },
      { id: 'P2-HEAP', name: 'Heap', sizeBytes: 1 * MIB },
      { id: 'P2-STACK', name: 'Stack', sizeBytes: 256 * KIB }
    ]
  },
  {
    id: 'P3',
    name: 'Editor',
    colorToken: 'var(--color-prog-3)',
    segments: [
      { id: 'P3-CODE', name: 'Code', sizeBytes: 512 * KIB },
      { id: 'P3-DATA', name: 'Data', sizeBytes: 256 * KIB },
      { id: 'P3-HEAP', name: 'Heap', sizeBytes: 256 * KIB },
      { id: 'P3-STACK', name: 'Stack', sizeBytes: 256 * KIB }
    ]
  },
  {
    id: 'P4',
    name: 'Database',
    colorToken: 'var(--color-prog-4)',
    segments: [
      { id: 'P4-CODE', name: 'Code', sizeBytes: 1 * MIB },
      { id: 'P4-DATA', name: 'Data', sizeBytes: 1536 * KIB },
      { id: 'P4-HEAP', name: 'Heap', sizeBytes: 1 * MIB },
      { id: 'P4-STACK', name: 'Stack', sizeBytes: 512 * KIB }
    ]
  },
  {
    id: 'P5',
    name: 'Media Player',
    colorToken: 'var(--color-prog-5)',
    segments: [
      { id: 'P5-CODE', name: 'Code', sizeBytes: 768 * KIB },
      { id: 'P5-DATA', name: 'Data', sizeBytes: 512 * KIB },
      { id: 'P5-HEAP', name: 'Heap', sizeBytes: 1 * MIB },
      { id: 'P5-STACK', name: 'Stack', sizeBytes: 256 * KIB }
    ]
  }
]);

/**
 * Returns a fresh clone of the 5 default programs in ready status.
 * @returns {import('../domain/constants.js').Program[]}
 */
export function getDefaultPrograms() {
  return DEFAULT_PROGRAM_DEFS.map((def, index) =>
    createProgram({
      ...def,
      arrivalOrder: index,
      status: ProgramStatus.READY,
      start: null,
      end: null,
      containerId: null
    })
  );
}
