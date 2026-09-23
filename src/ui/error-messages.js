import { formatBytes } from '../domain/address.js';
import { ErrorCode } from '../domain/errors.js';

function formatExactBytes(bytes) {
  return `${formatBytes(bytes)} (${bytes.toLocaleString('es-CO')} bytes)`;
}

/**
 * Convierte errores técnicos del dominio en mensajes claros para la interfaz.
 * Los códigos permanecen estables para el motor; solo esta capa decide qué ve la persona usuaria.
 *
 * @param {{code?: string, details?: {error?: string, [key:string]: unknown}, message?: string}|Error} source
 * @param {{programId?: string}} [context]
 * @returns {string}
 */
export function describeError(source, context = {}) {
  const code = source?.code;
  const details = source?.details || {};
  const technicalMessage = details.error || source?.message || '';
  const programLabel = context.programId || details.programId || 'seleccionado';

  if (technicalMessage === 'Valor no numérico en "Tamaños desiguales": revisa la lista separada por comas.') {
    return 'La lista de tamaños de particiones contiene texto que no es un número. Usa únicamente valores numéricos positivos separados por comas; por ejemplo: 1, 2, 3, 4, 5.';
  }

  if (code === ErrorCode.INVALID_CONFIGURATION) {
    const unequalSizes = /Sum of unequal partitions \((\d+) bytes\) must exactly match available user memory \((\d+) bytes\)/.exec(technicalMessage);
    if (unequalSizes) {
      const [, assignedBytes, availableBytes] = unequalSizes.map(Number);
      return `La suma de las particiones desiguales es ${formatExactBytes(assignedBytes)}, pero la memoria de usuario disponible es ${formatExactBytes(availableBytes)}. Ajusta los tamaños para que su suma sea exactamente igual a la memoria disponible.`;
    }

    const equalPartitions = /User memory \((\d+) bytes\) cannot be divided equally into (\d+) partitions/.exec(technicalMessage);
    if (equalPartitions) {
      const [, userBytes, count] = equalPartitions.map(Number);
      return `La memoria de usuario (${formatExactBytes(userBytes)}) no puede dividirse exactamente entre ${count} particiones iguales. Elige una cantidad de particiones que no deje sobrantes.`;
    }

    if (/OS size/.test(technicalMessage)) {
      return 'La reserva del sistema operativo no es válida. Debe ser un valor desde 0 bytes hasta menos de 16 MiB.';
    }
    if (/Equal partition count/.test(technicalMessage)) {
      return 'La cantidad de particiones iguales no es válida. Introduce un número entero mayor que cero.';
    }
    if (/Unequal partition sizes must not be empty/.test(technicalMessage)) {
      return 'Faltan los tamaños de las particiones desiguales. Introduce al menos un tamaño positivo separado por comas.';
    }
    if (/Each partition size/.test(technicalMessage)) {
      return 'Uno o más tamaños de partición no son válidos. Cada partición debe tener un tamaño entero mayor que cero.';
    }
    if (/Cannot restore default programs/.test(technicalMessage)) {
      return 'No se pueden restaurar los programas predeterminados porque hay programas asignados en memoria. Reinicia la simulación primero para liberar la memoria.';
    }
    return 'La configuración de memoria no es válida. Revisa la reserva del sistema operativo y los tamaños de las particiones antes de aplicarla.';
  }

  switch (code) {
    case ErrorCode.INVALID_SIZE:
      return 'El tamaño indicado no es válido. Introduce un número positivo y una unidad admitida (B, KiB o MiB), sin fracciones de byte.';
    case ErrorCode.INVALID_PROGRAM:
      return `No se puede operar con el programa ${programLabel}: no existe o sus datos no son válidos.`;
    case ErrorCode.PROGRAM_NOT_READY:
      return `No se puede asignar el programa ${programLabel} porque no está en estado «Listo». Solo los programas listos pueden asignarse.`;
    case ErrorCode.PROGRAM_NOT_RESIDENT:
      return `No se puede terminar el programa ${programLabel} porque no está asignado en memoria.`;
    case ErrorCode.PROGRAM_TOO_LARGE:
      return `El programa ${programLabel} no cabe en ninguna partición disponible. Reduce su tamaño o usa una configuración con particiones más grandes.`;
    case ErrorCode.NO_FREE_PARTITION:
      return `No hay una partición libre con capacidad suficiente para el programa ${programLabel}. Termina otro programa o cambia la configuración de memoria.`;
    case ErrorCode.INSUFFICIENT_TOTAL_MEMORY:
      return `No hay memoria libre total suficiente para asignar el programa ${programLabel}. Libera memoria terminando otro programa.`;
    case ErrorCode.EXTERNAL_FRAGMENTATION:
      return `La memoria libre está fragmentada: hay espacio total para ${programLabel}, pero ningún hueco individual es suficientemente grande.`;
    case ErrorCode.COMPACTION_NOT_ALLOWED:
      return 'La compactación no está disponible en el modo de memoria seleccionado.';
    case ErrorCode.COMPACTION_NOT_NEEDED:
      return 'La memoria ya está compactada; no hay huecos separados que puedan unificarse.';
    case ErrorCode.UNSUPPORTED_SCHEMA:
      return 'No se pudo importar el escenario. El archivo no tiene un formato JSON válido o no corresponde a una versión compatible del simulador.';
    case ErrorCode.ADDRESS_OUT_OF_RANGE:
      return 'La operación produciría una dirección fuera del espacio físico válido de 24 bits. Revisa los tamaños configurados.';
    case ErrorCode.UNSAFE_INTEGER:
      return 'Se recibió un valor numérico no válido para una dirección o tamaño de memoria. Usa números enteros dentro del rango permitido.';
    case ErrorCode.STATE_INVARIANT_FAILED:
      return 'La operación se detuvo para proteger la consistencia de la memoria simulada. El estado actual no se modificó; reinicia o importa un escenario válido.';
    default:
      return 'No se pudo completar la operación por un error no identificado. El estado de la simulación no se modificó.';
  }
}
