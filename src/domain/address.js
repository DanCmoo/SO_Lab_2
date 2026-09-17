import { MIN_ADDRESS, MAX_ADDRESS, KIB, MIB } from './constants.js';
import { DomainError, ErrorCode } from './errors.js';

/**
 * Calcula la dirección final inclusiva de un bloque contiguo.
 * Invariante: fin = inicio + tamañoEnBytes - 1
 * @param {number} start
 * @param {number} sizeBytes
 * @returns {number}
 */
export function endAddress(start, sizeBytes) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(sizeBytes)) {
    throw new DomainError(ErrorCode.UNSAFE_INTEGER, 'Start and size must be safe integers');
  }
  if (sizeBytes <= 0) {
    throw new DomainError(ErrorCode.INVALID_SIZE, 'Block size must be greater than zero');
  }
  const end = start + sizeBytes - 1;
  if (start < MIN_ADDRESS || end > MAX_ADDRESS) {
    throw new DomainError(
      ErrorCode.ADDRESS_OUT_OF_RANGE,
      `Address range [0x${start.toString(16)}, 0x${end.toString(16)}] exceeds 24-bit physical space`
    );
  }
  return end;
}

/**
 * Formatea una dirección numérica como hexadecimal mayúscula de 24 bits: 0x000000 - 0xFFFFFF.
 * @param {number} address
 * @returns {string}
 */
export function toHexAddress(address) {
  if (!Number.isSafeInteger(address) || address < MIN_ADDRESS || address > MAX_ADDRESS) {
    throw new DomainError(
      ErrorCode.ADDRESS_OUT_OF_RANGE,
      `Address ${address} is outside valid 24-bit range [0x000000, 0xFFFFFF]`
    );
  }
  return `0x${address.toString(16).toUpperCase().padStart(6, '0')}`;
}

/**
 * Convierte un valor numérico y su unidad ('B', 'KiB', 'MiB') en una cantidad exacta de bytes enteros.
 * Rechaza valores negativos, cero, bytes fraccionarios, NaN o valores no finitos.
 * @param {number|string} value
 * @param {'B'|'KiB'|'MiB'|string} [unit='B']
 * @returns {number}
 */
export function parseUnitToBytes(value, unit = 'B') {
  const numericVal = typeof value === 'string' ? parseFloat(value.trim()) : value;
  if (!Number.isFinite(numericVal) || Number.isNaN(numericVal) || numericVal <= 0) {
    throw new DomainError(ErrorCode.INVALID_SIZE, 'Size value must be a positive finite number');
  }

  const normalizedUnit = (unit || 'B').trim().toUpperCase();
  let multiplier = 1;
  if (normalizedUnit === 'B' || normalizedUnit === 'BYTES') {
    multiplier = 1;
  } else if (normalizedUnit === 'KIB' || normalizedUnit === 'KB') {
    multiplier = KIB;
  } else if (normalizedUnit === 'MIB' || normalizedUnit === 'MB') {
    multiplier = MIB;
  } else {
    throw new DomainError(ErrorCode.INVALID_SIZE, `Unsupported memory unit: ${unit}`);
  }

  const totalBytes = Math.round(numericVal * multiplier);
  // Comprueba que el valor multiplicado sea un entero exacto, sin fracción residual.
  if (Math.abs(numericVal * multiplier - totalBytes) > 1e-9) {
    throw new DomainError(ErrorCode.INVALID_SIZE, 'Size results in fractional bytes, which is not permitted');
  }
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) {
    throw new DomainError(ErrorCode.INVALID_SIZE, 'Resulting byte count is not a positive safe integer');
  }

  return totalBytes;
}

/**
 * Formatea un tamaño en bytes como una cadena legible (B, KiB o MiB).
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return '0 B';
  if (bytes >= MIB && bytes % (KIB * 64) === 0) {
    const mib = bytes / MIB;
    const formatted = Number.isInteger(mib) ? mib : parseFloat(mib.toFixed(2));
    return `${formatted} MiB`;
  }
  if (bytes >= KIB && bytes % 64 === 0) {
    const kib = bytes / KIB;
    const formatted = Number.isInteger(kib) ? kib : parseFloat(kib.toFixed(2));
    return `${formatted} KiB`;
  }
  if (bytes >= MIB) {
    const mib = parseFloat((bytes / MIB).toFixed(2));
    return `${mib} MiB (${bytes.toLocaleString()} B)`;
  }
  if (bytes >= KIB) {
    const kib = parseFloat((bytes / KIB).toFixed(2));
    return `${kib} KiB (${bytes.toLocaleString()} B)`;
  }
  return `${bytes.toLocaleString()} B`;
}
