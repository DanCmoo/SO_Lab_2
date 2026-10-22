import { DomainError, ErrorCode } from './errors.js';

export function regionPermissions(name, permissions) {
  const defaults = /^(code|código|codigo)$/i.test(name) ? { read: true, write: false, execute: true } : { read: true, write: true, execute: false };
  const result = permissions === undefined ? defaults : permissions;
  if (!result || ['read', 'write', 'execute'].some(key => typeof result[key] !== 'boolean')) {
    throw new DomainError(ErrorCode.INVALID_PROGRAM, 'Los permisos deben contener lectura, escritura y ejecución booleanos.');
  }
  return Object.freeze({ read: result.read, write: result.write, execute: result.execute });
}

/** Regiones lógicas ordenadas; no asigna direcciones físicas ni redondea por región. */
export function getProcessRegions(program) {
  const regions = program.segments.map((segment, index) => ({
    regionId: `${program.id}:image:${index}`, name: segment.name, kind: 'IMAGE',
    sizeBytes: segment.sizeBytes, permissions: regionPermissions(segment.name, segment.permissions)
  }));
  for (const [kind, name, sizeBytes] of [['HEAP', 'Heap', program.runtimeMemory?.heapBytes ?? 0], ['STACK', 'Stack', program.runtimeMemory?.stackBytes ?? 0]]) {
    if (sizeBytes > 0) regions.push({ regionId: `${program.id}:${kind}`, name, kind, sizeBytes, permissions: regionPermissions(name) });
  }
  return regions;
}
