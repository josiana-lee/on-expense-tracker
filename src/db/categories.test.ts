import { describe, expect, it } from 'vitest';

import { PRESET_CATEGORIES } from '../data/categories';
import { addCategory, updateCategory } from './categories';
import { db } from './db';
import { bootstrap, reconcileCategories } from './seed';

/** Rewinds the marker reconcileCategories() gates on, which is what a
 *  PRESET_VERSION bump looks like from the app's side. */
async function simulatePresetBump(): Promise<void> {
  await db.meta.put({ key: 'presetVersion', value: 0, updatedAt: Date.now() });
  await reconcileCategories();
}

describe('preset reconciliation', () => {
  it('keeps a renamed preset category through a preset bump', async () => {
    await bootstrap();

    await updateCategory('food', { name: '밥값' });
    expect((await db.categories.get('food'))?.customizedFields).toContain('name');

    await simulatePresetBump();

    expect((await db.categories.get('food'))?.name).toBe('밥값');
  });

  it('keeps a recoloured or re-iconed preset category through a preset bump', async () => {
    await bootstrap();
    const preset = PRESET_CATEGORIES.find((p) => p.key === 'transit')!;

    await updateCategory('transit', { colorHex: '#123456', iconPath: 'M0 0h1' });
    await simulatePresetBump();

    const row = await db.categories.get('transit');
    expect(row?.colorHex).toBe('#123456');
    expect(row?.iconPath).toBe('M0 0h1');
    expect(row?.colorHex).not.toBe(preset.colorHex);
  });

  it('still repairs a preset category the user never touched', async () => {
    await bootstrap();
    const preset = PRESET_CATEGORIES.find((p) => p.key === 'snack')!;
    await db.categories.update('snack', { name: '엉뚱한이름', colorHex: '#000000' });

    await simulatePresetBump();

    const row = await db.categories.get('snack');
    expect(row?.name).toBe(preset.name);
    expect(row?.colorHex).toBe(preset.colorHex);
  });

  it('does not track edits on user-created categories', async () => {
    await bootstrap();
    const id = await addCategory({ name: '구독료', colorHex: '#ABCDEF', iconPath: 'M1 1h1' });

    await updateCategory(id, { name: '정기결제' });

    // Nothing reconciles these, so there is no ownership to record.
    expect((await db.categories.get(id))?.customizedFields).toEqual([]);
  });
});
