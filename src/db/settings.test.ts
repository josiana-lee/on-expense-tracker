import { describe, expect, it } from 'vitest';

import { db } from './db';
import { bootstrap } from './seed';
import { DEFAULT_REMINDER_TIME, setReminder } from './settings';

const read = () => db.settings.get('app');

describe('setReminder', () => {
  it('stores the time it is given', async () => {
    await bootstrap();

    await setReminder(true, '07:30');

    const row = await read();
    expect(row?.reminderEnabled).toBe(true);
    expect(row?.reminderTime).toBe('07:30');
  });

  /* The bug this guards: <input type="time"> reports '' the moment the user
     clears it. Stored, useReminderScheduler reads the time as falsy and
     cancels the schedule while reminderEnabled stays true — the toggle keeps
     saying "on" and the alarm never fires again. */
  it('never stores an empty time', async () => {
    await bootstrap();
    await setReminder(true, '07:30');

    await setReminder(true, '');

    const row = await read();
    expect(row?.reminderTime).not.toBe('');
    expect(row?.reminderTime).toBe(DEFAULT_REMINDER_TIME);
  });

  it('never stores a whitespace-only time', async () => {
    await bootstrap();

    await setReminder(true, '   ');

    expect((await read())?.reminderTime).toBe(DEFAULT_REMINDER_TIME);
  });

  it('falls back to the default when no time is given', async () => {
    await bootstrap();

    await setReminder(true);

    expect((await read())?.reminderTime).toBe(DEFAULT_REMINDER_TIME);
  });

  /* Switching the reminder off must not throw its time away — turning it back
     on should land on the hour the user chose, not on the default. */
  it('keeps the chosen time across an off/on cycle', async () => {
    await bootstrap();
    await setReminder(true, '07:30');

    await setReminder(false, (await read())?.reminderTime);
    expect((await read())?.reminderEnabled).toBe(false);

    await setReminder(true, (await read())?.reminderTime);

    const row = await read();
    expect(row?.reminderEnabled).toBe(true);
    expect(row?.reminderTime).toBe('07:30');
  });

  /* Whatever is stored has to satisfy the same shape the restore schema
     enforces, or a backup written now would fail its own validation on the
     way back in. */
  it('always stores a time the restore schema would accept', async () => {
    await bootstrap();

    for (const input of ['07:30', '', '   ', undefined]) {
      await setReminder(true, input);
      expect((await read())?.reminderTime).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});
