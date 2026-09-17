import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_ADDRESS, MAX_ADDRESS, KIB, MIB, TOTAL_MEMORY_BYTES } from '../src/domain/constants.js';
import { endAddress, toHexAddress, parseUnitToBytes, formatBytes } from '../src/domain/address.js';
import { ErrorCode } from '../src/domain/errors.js';

test('Address: 24-bit physical boundaries and total size', () => {
  assert.equal(MIN_ADDRESS, 0x000000);
  assert.equal(MAX_ADDRESS, 0xFFFFFF);
  assert.equal(TOTAL_MEMORY_BYTES, 16 * 1024 * 1024);
  assert.equal(MAX_ADDRESS - MIN_ADDRESS + 1, TOTAL_MEMORY_BYTES);
});

test('Address: endAddress calculation', () => {
  // Bloque de 1 MiB que comienza en 0.
  assert.equal(endAddress(0, 1 * MIB), 0x0FFFFF);

  // Siguiente bloque que comienza en 1 MiB.
  assert.equal(endAddress(0x100000, 3 * MIB), 0x3FFFFF);

  // Bloque completo de 16 MiB que comienza en 0.
  assert.equal(endAddress(0, 16 * MIB), 0xFFFFFF);

  // Errores para tamaños o direcciones no válidos.
  assert.throws(() => endAddress(0, 0), { code: ErrorCode.INVALID_SIZE });
  assert.throws(() => endAddress(0, -10), { code: ErrorCode.INVALID_SIZE });
  assert.throws(() => endAddress(-1, 100), { code: ErrorCode.ADDRESS_OUT_OF_RANGE });
  assert.throws(() => endAddress(MAX_ADDRESS, 2), { code: ErrorCode.ADDRESS_OUT_OF_RANGE });
  assert.throws(() => endAddress('0', 10), { code: ErrorCode.UNSAFE_INTEGER });
});

test('Address: toHexAddress 6-character uppercase formatting', () => {
  assert.equal(toHexAddress(0), '0x000000');
  assert.equal(toHexAddress(1), '0x000001');
  assert.equal(toHexAddress(0x100000), '0x100000');
  assert.equal(toHexAddress(0xFFFFFF), '0xFFFFFF');
  assert.equal(toHexAddress(0x0ABCDE), '0x0ABCDE');

  assert.throws(() => toHexAddress(-1), { code: ErrorCode.ADDRESS_OUT_OF_RANGE });
  assert.throws(() => toHexAddress(0x1000000), { code: ErrorCode.ADDRESS_OUT_OF_RANGE });
});

test('Address: parseUnitToBytes conversion', () => {
  assert.equal(parseUnitToBytes(1024, 'B'), 1024);
  assert.equal(parseUnitToBytes('512', 'KiB'), 512 * KIB);
  assert.equal(parseUnitToBytes('1.5', 'MiB'), 1.5 * MIB);
  assert.equal(parseUnitToBytes(2, 'MiB'), 2 * MIB);

  // Rejections
  assert.throws(() => parseUnitToBytes(0, 'B'), { code: ErrorCode.INVALID_SIZE });
  assert.throws(() => parseUnitToBytes(-1, 'KiB'), { code: ErrorCode.INVALID_SIZE });
  assert.throws(() => parseUnitToBytes('abc', 'MiB'), { code: ErrorCode.INVALID_SIZE });
  assert.throws(() => parseUnitToBytes(1.234567, 'B'), { code: ErrorCode.INVALID_SIZE });
});

test('Address: formatBytes human readable display', () => {
  assert.equal(formatBytes(1 * MIB), '1 MiB');
  assert.equal(formatBytes(1.5 * MIB), '1.5 MiB');
  assert.equal(formatBytes(768 * KIB), '768 KiB');
  assert.equal(formatBytes(512), '512 B');
});
