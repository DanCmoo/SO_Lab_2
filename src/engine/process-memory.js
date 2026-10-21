/**
 * El SO respalda las reservas de ejecución de cada proceso con memoria de usuario.
 * No forman parte de la imagen del programa ni de la reserva del núcleo.
 * El simulador contiguo reserva todo el espacio solicitado al cargar el proceso.
 */
export function createRuntimeRegions(program) {
  return Object.freeze([
    { kind: 'HEAP', name: 'Heap', sizeBytes: program.runtimeMemory?.heapBytes ?? 0, growth: 'up' },
    { kind: 'STACK', name: 'Stack', sizeBytes: program.runtimeMemory?.stackBytes ?? 0, growth: 'down' }
  ].filter(region => region.sizeBytes > 0).map(region => Object.freeze({
    ...region,
    id: `${program.id}-${region.kind}`,
    programId: program.id,
    allocatedBy: 'OS'
  })));
}
