import { describe, expect, it } from 'vitest';

import { applyKey, MAX_AMOUNT_DIGITS, type KeypadKey } from '../components/Keypad';
import { amountSize } from './format';
import { cellAmount } from '../screens/calendar/CalendarScreen';

/* The amount pipeline is three pure functions and, until now, none of them had
   a test — so a green suite said nothing about the code this release actually
   changed. Each of them has a boundary that has already been got wrong once. */

describe('applyKey', () => {
  it('appends digits', () => {
    expect(applyKey('', '1')).toBe('1');
    expect(applyKey('1', '2')).toBe('12');
  });

  it('drops leading zeros so an amount never starts with one', () => {
    expect(applyKey('', '0')).toBe('');
    expect(applyKey('', '00')).toBe('');
    expect(applyKey('0', '5')).toBe('5');
  });

  it('keeps zeros that follow a real digit', () => {
    expect(applyKey('1', '00')).toBe('100');
    expect(applyKey('5', '0')).toBe('50');
  });

  it('deletes the last digit', () => {
    expect(applyKey('123', 'del')).toBe('12');
    expect(applyKey('1', 'del')).toBe('');
  });

  it('deleting an empty amount is a no-op rather than an error', () => {
    expect(applyKey('', 'del')).toBe('');
  });

  it('accepts exactly MAX_AMOUNT_DIGITS', () => {
    const eleven = '1'.repeat(MAX_AMOUNT_DIGITS);
    expect(eleven).toHaveLength(11);
    expect(applyKey('1'.repeat(MAX_AMOUNT_DIGITS - 1), '1')).toBe(eleven);
  });

  it('refuses a digit past the cap', () => {
    const full = '1'.repeat(MAX_AMOUNT_DIGITS);
    expect(applyKey(full, '9')).toBe(full);
  });

  /* The reason the cap is checked against the result rather than the input.
     '00' adds two digits at a time, so a length test taken beforehand let the
     amount overshoot — this exact bug shipped once already. */
  it("refuses '00' when only one digit is left, rather than overshooting", () => {
    const ten = '1'.repeat(MAX_AMOUNT_DIGITS - 1);
    expect(applyKey(ten, '00')).toBe(ten);
  });

  it("allows '00' when exactly two digits are left", () => {
    const nine = '1'.repeat(MAX_AMOUNT_DIGITS - 2);
    expect(applyKey(nine, '00')).toBe(`${nine}00`);
    expect(applyKey(nine, '00')).toHaveLength(MAX_AMOUNT_DIGITS);
  });

  it('never returns more than the cap for any key', () => {
    const full = '9'.repeat(MAX_AMOUNT_DIGITS);
    for (const key of ['0', '00', '1', '9'] satisfies KeypadKey[]) {
      expect(applyKey(full, key).length).toBeLessThanOrEqual(MAX_AMOUNT_DIGITS);
    }
  });
});

describe('amountSize', () => {
  it('steps down at each boundary', () => {
    expect(amountSize('1')).toBe('lg');
    expect(amountSize('999999')).toBe('lg');
    expect(amountSize('9999999')).toBe('md');
    expect(amountSize('99999999')).toBe('sm');
    expect(amountSize('999999999')).toBe('xs');
    expect(amountSize('9999999999')).toBe('xxs');
    expect(amountSize('99999999999')).toBe('xxs');
  });

  it('treats an empty amount as the largest size, since it renders as 0', () => {
    expect(amountSize('')).toBe('lg');
  });

  /* Every length the keypad can produce has to land on a defined step, or the
     CSS falls back to the base size and the number overflows. */
  it('covers every length up to the cap', () => {
    for (let n = 0; n <= MAX_AMOUNT_DIGITS; n += 1) {
      expect(['lg', 'md', 'sm', 'xs', 'xxs']).toContain(amountSize('9'.repeat(n)));
    }
  });
});

describe('cellAmount', () => {
  it('is blank for zero, so empty days stay empty', () => {
    expect(cellAmount(0)).toBe('');
  });

  it('shows four figures in full', () => {
    expect(cellAmount(3200)).toBe('3,200');
    expect(cellAmount(9999)).toBe('9,999');
  });

  it('switches to 만 at ten thousand', () => {
    expect(cellAmount(10_000)).toBe('1만');
    expect(cellAmount(2_500_000)).toBe('250만');
  });

  /* Rounding is applied before the unit is chosen. Testing the raw figure let
     99,999,999 become "10000만" — five digits and a unit, wider than the cell,
     for a number that is plainly 1억. */
  it('carries into 억 when rounding fills the 만 slot', () => {
    expect(cellAmount(99_999_999)).toBe('1억');
    expect(cellAmount(99_994_999)).toBe('9999만');
  });

  it('switches to 억 at a hundred million', () => {
    expect(cellAmount(100_000_000)).toBe('1억');
    expect(cellAmount(130_000_000)).toBe('1.3억');
  });

  it('drops the decimal past ten 억, where it would not fit', () => {
    expect(cellAmount(2_031_800_000)).toBe('20억');
    expect(cellAmount(99_999_999_999)).toBe('1000억');
  });

  /* The cell is ~44px. Anything past five characters plus a unit runs over,
     and the whole point of abbreviating is to stay inside it. */
  it('never exceeds six characters, at any amount the app can hold', () => {
    const cap = 10 ** MAX_AMOUNT_DIGITS - 1;
    for (const sum of [9999, 10_000, 99_999_999, 100_000_000, 9_999_999_999, cap]) {
      expect(cellAmount(sum).length).toBeLessThanOrEqual(6);
    }
  });
});
