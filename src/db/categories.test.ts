import { describe, expect, it } from 'vitest';

import { DEFAULT_VISIBLE, DEFAULT_VISIBLE_V1, PRESET_CATEGORIES } from '../data/categories';
import {
  MAX_SUB_LENGTH,
  addCategory,
  normalizeSubs,
  rememberCategoryPayment,
  setCategoryVisible,
  updateCategory,
} from './categories';
import { db } from './db';
import { archivePaymentMethod } from './paymentMethods';
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

describe('home grid defaults', () => {
  /** 예전 기본값(12개)으로 쓰던 기기를 흉내 낸다 — 이번에 늘어난 넷을 끄고, 새
   *  기본값을 제안받은 적 없는 상태로 되돌린다. */
  async function simulateOldHomeGrid(): Promise<void> {
    for (const key of DEFAULT_VISIBLE.filter((k) => !DEFAULT_VISIBLE_V1.includes(k))) {
      await setCategoryVisible(key, false);
    }
    await db.meta.delete('homeVisibleDefaults');
  }

  async function visibleKeys(): Promise<string[]> {
    const rows = await db.categories.toArray();
    return rows.filter((c) => c.visibleOnHome).map((c) => c.presetKey ?? c.id);
  }

  it('starts a new install with two full pages', async () => {
    await bootstrap();

    expect((await visibleKeys()).sort()).toEqual([...DEFAULT_VISIBLE].sort());
  });

  it('moves a home grid nobody touched up to the new default', async () => {
    await bootstrap();
    await simulateOldHomeGrid();
    expect(await visibleKeys()).toHaveLength(DEFAULT_VISIBLE_V1.length);

    await simulatePresetBump();

    expect((await visibleKeys()).sort()).toEqual([...DEFAULT_VISIBLE].sort());
  });

  it('leaves a home grid the user arranged alone', async () => {
    await bootstrap();
    await simulateOldHomeGrid();
    // 하나를 끄는 순간 이 화면은 사용자의 것이다.
    await setCategoryVisible('beauty', false);

    await simulatePresetBump();

    const keys = await visibleKeys();
    expect(keys).not.toContain('cafe');
    expect(keys).not.toContain('beauty');
  });

  it('does not offer the new defaults a second time', async () => {
    await bootstrap();
    /* 열여섯 개를 받아본 뒤 넷을 도로 끄면 예전 기본값과 똑같은 모양이 된다.
       켜둔 목록만 보고 판단하면 여기서 되살아난다 — meta의 표시가 막는다. */
    for (const key of DEFAULT_VISIBLE.filter((k) => !DEFAULT_VISIBLE_V1.includes(k))) {
      await setCategoryVisible(key, false);
    }

    await simulatePresetBump();

    expect(await visibleKeys()).toHaveLength(DEFAULT_VISIBLE_V1.length);
  });
});

describe('구독 preset', () => {
  async function visibleKeys(): Promise<string[]> {
    const rows = await db.categories.toArray();
    return rows.filter((c) => c.visibleOnHome).map((c) => c.presetKey ?? c.id);
  }

  it('takes the cafe slot on the home grid of a new install', async () => {
    await bootstrap();

    const keys = await visibleKeys();
    expect(keys).toContain('subscription');
    expect(keys).not.toContain('cafe');
    expect(keys).toHaveLength(16);
  });

  it('arrives hidden on a device that already had the grid arranged', async () => {
    await bootstrap();
    // 쓰던 기기: 구독이 생기기 전 상태로 되돌리고, 홈 화면은 카페까지 켠 채로 둔다.
    await db.categories.delete('subscription');
    await setCategoryVisible('cafe', true);
    await simulatePresetBump();

    const row = await db.categories.get('subscription');
    expect(row?.name).toBe('구독');
    expect(row?.visibleOnHome).toBe(false);
    expect(await visibleKeys()).toContain('cafe');
  });

  it('stays out of the way of a 구독 category the user had already made', async () => {
    await bootstrap();
    // 업데이트 전 기기: 프리셋 구독은 없고, 사용자가 만든 '구독'이 있다.
    await db.categories.delete('subscription');
    const mine = await addCategory({ name: '구독', colorHex: '#fff', iconPath: 'M0 0h1', subs: ['넷플릭스'] });
    await simulatePresetBump();

    const live = (await db.categories.toArray()).filter((c) => c.name === '구독' && !c.archived);
    expect(live.map((c) => c.id)).toEqual([mine]);
    // 행은 있다 — 다음 갱신이 또 넣으려 들지 않게.
    expect((await db.categories.get('subscription'))?.archived).toBe(true);

    await simulatePresetBump();
    expect((await db.categories.get('subscription'))?.archived).toBe(true);
  });

  it('is added normally on a fresh install', async () => {
    await bootstrap();

    expect((await db.categories.get('subscription'))?.archived).toBe(false);
  });

  it('sorts between 경조사 and 카페 so turning it on lands next to them', async () => {
    await bootstrap();

    const [event, sub, cafe] = await Promise.all(
      ['event', 'subscription', 'cafe'].map((k) => db.categories.get(k)),
    );
    expect(event!.sortOrder).toBeLessThan(sub!.sortOrder);
    expect(sub!.sortOrder).toBeLessThan(cafe!.sortOrder);
  });
});

describe('editing subs (설정 > 카테고리 수정)', () => {
  it('tidies the list: trims, caps the length, drops blanks and twins, keeps the order', () => {
    expect(normalizeSubs(['  넷플릭스 ', '', 'AI', 'AI', '가'.repeat(MAX_SUB_LENGTH + 3)])).toEqual([
      '넷플릭스',
      'AI',
      '가'.repeat(MAX_SUB_LENGTH),
    ]);
  });

  it('saves added, renamed and deleted subs together', async () => {
    await bootstrap();

    await updateCategory('subscription', { subs: ['OTT', '챗GPT', '음악', '넷플릭스'] });

    expect((await db.categories.get('subscription'))?.subs).toEqual(['OTT', '챗GPT', '음악', '넷플릭스']);
  });

  it('keeps a deleted preset sub deleted through a preset bump', async () => {
    await bootstrap();
    await updateCategory('food', { subs: ['점심', '저녁'] });
    expect((await db.categories.get('food'))?.customizedFields).toContain('subs');

    await simulatePresetBump();

    expect((await db.categories.get('food'))?.subs).toEqual(['점심', '저녁']);
  });

  it('does not claim the subs when the sheet saves them unchanged', async () => {
    await bootstrap();
    const before = (await db.categories.get('food'))!.subs;

    await updateCategory('food', { name: '식비', subs: [...before] });

    expect((await db.categories.get('food'))?.customizedFields).not.toContain('subs');
  });

  it('gives a category the user made its subs at creation', async () => {
    await bootstrap();

    const id = await addCategory({ name: '커피콩', colorHex: '#fff', iconPath: 'M0 0h1', subs: [' 원두', '원두'] });

    expect((await db.categories.get(id))?.subs).toEqual(['원두']);
  });
});

describe('rememberCategoryPayment', () => {
  it('records the payment method used for a category', async () => {
    await bootstrap();

    await rememberCategoryPayment('food', 'hyundai');

    expect((await db.categories.get('food'))?.lastPaymentMethodId).toBe('hyundai');
  });

  it('overwrites the previous memory rather than keeping the first one', async () => {
    await bootstrap();

    await rememberCategoryPayment('food', 'cash');
    await rememberCategoryPayment('food', 'hyundai');

    expect((await db.categories.get('food'))?.lastPaymentMethodId).toBe('hyundai');
  });

  it('does not bump the category updatedAt', async () => {
    await bootstrap();
    const before = (await db.categories.get('food'))?.updatedAt;

    await rememberCategoryPayment('food', 'hyundai');

    // 카테고리 자체를 고친 시각이 아니라 결제수단만 갱신된다 — 지출을 쓸
    // 때마다 이 값이 움직이면 이름·아이콘을 실제로 언제 고쳤는지 알 수 없다.
    expect((await db.categories.get('food'))?.updatedAt).toBe(before);
  });

  it('does not throw for a category that no longer exists', async () => {
    await bootstrap();

    await expect(rememberCategoryPayment('no-such-category', 'hyundai')).resolves.toBeUndefined();
  });

  it('does not resurface an archived payment method as a remembered default', async () => {
    await bootstrap();
    await rememberCategoryPayment('food', 'hyundai');
    await archivePaymentMethod('hyundai');

    const active = (await db.paymentMethods.toArray()).filter((p) => !p.archived);
    const category = await db.categories.get('food');

    // db 계층은 지운다고 정리해주지 않는다 — 화면이 "지금 고를 수 있는 목록에
    // 있는지" 확인해야 한다는 계약을 이 테스트로 명시해둔다.
    expect(category?.lastPaymentMethodId).toBe('hyundai');
    expect(active.some((p) => p.id === 'hyundai')).toBe(false);
  });
});
