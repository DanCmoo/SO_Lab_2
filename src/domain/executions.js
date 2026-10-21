import { ProgramStatus } from './constants.js';

/** Conserva la numeración incluso cuando ya se eliminaron ejecuciones terminadas. */
export function nextExecutionNumber(programs, source) {
  const previous = programs.reduce((highest, program) => program.sourceProgramId === source.id
    ? Math.max(highest, program.instanceNumber || 1)
    : highest, source.status === ProgramStatus.ALLOCATED || source.status === ProgramStatus.TERMINATED ? 1 : 0);
  return Math.max(source.nextInstanceNumber || 1, previous + 1);
}
