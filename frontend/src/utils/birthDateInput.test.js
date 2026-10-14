import assert from 'node:assert/strict'
import test from 'node:test'
import { formatBirthDateInput } from './birthDateInput.js'

test('formats numeric keyboard input as DD/MM/YYYY and stores ISO date', () => {
  assert.deepEqual(formatBirthDateInput('29022000'), {
    displayValue: '29/02/2000',
    isoValue: '2000-02-29',
  })
})

test('keeps partial dates editable without storing an invalid date', () => {
  assert.deepEqual(formatBirthDateInput('0108'), {
    displayValue: '01/08',
    isoValue: '',
  })
})

test('rejects impossible dates', () => {
  assert.deepEqual(formatBirthDateInput('31022000'), {
    displayValue: '31/02/2000',
    isoValue: '',
  })
})
