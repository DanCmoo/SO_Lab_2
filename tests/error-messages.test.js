import test from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCode } from '../src/domain/errors.js';
import { describeError } from '../src/ui/error-messages.js';

test('Error messages: explains unequal static partition totals in Spanish', () => {
  const message = describeError({
    code: ErrorCode.INVALID_CONFIGURATION,
    details: {
      error: 'Sum of unequal partitions (39845888 bytes) must exactly match available user memory (15728640 bytes)'
    }
  });

  assert.match(message, /^La suma de las particiones desiguales es /);
  assert.match(message, /38 MiB/);
  assert.match(message, /15 MiB/);
  assert.match(message, /Ajusta los tamaños/);
  assert.doesNotMatch(message, /Sum of unequal partitions/);
});

test('Error messages: allocation failures identify the program, cause, and next action', () => {
  const message = describeError(
    { code: ErrorCode.INSUFFICIENT_TOTAL_MEMORY, details: {} },
    { programId: 'P4' }
  );

  assert.match(message, /P4/);
  assert.match(message, /memoria libre total suficiente/);
  assert.match(message, /Libera memoria/);
});

test('Error messages: non-numeric unequal partition input explains the accepted format', () => {
  const message = describeError(new Error('Valor no numérico en "Tamaños desiguales": revisa la lista separada por comas.'));

  assert.match(message, /texto que no es un número/);
  assert.match(message, /1, 2, 3, 4, 5/);
});
