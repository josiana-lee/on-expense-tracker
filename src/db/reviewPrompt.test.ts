import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from './db';
import { addExpense } from './expenses';
import {
  REVIEW_ASKED_KEY,
  REVIEW_WAIT_MS,
  firstOwnRecordAt,
  maybeAskForReview,
  resetReviewPromptForTest,
  shouldAskForReview,
} from './reviewPrompt';

const T = Date.now();

/** 직접 적은 기록 한 건. importId를 주면 가져온 기록이다. */
const add = (importId?: string) =>
  addExpense({ amount: 1000, categoryId: 'c', paymentMethodId: 'p', importId });

const launcher = () => vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetReviewPromptForTest();
});

describe('shouldAskForReview', () => {
  it('기록이 없으면 묻지 않는다', () => expect(shouldAskForReview(null, T)).toBe(false));
  it('7일이 안 됐으면 묻지 않는다', () =>
    expect(shouldAskForReview(T, T + REVIEW_WAIT_MS - 1)).toBe(false));
  it('딱 7일이면 묻는다', () => expect(shouldAskForReview(T, T + REVIEW_WAIT_MS)).toBe(true));
});

describe('maybeAskForReview', () => {
  it('처음 쓴 지 7일이 지났으면 한 번 띄우고 표시를 남긴다', async () => {
    await add();
    const launch = launcher();
    const asked = await maybeAskForReview({ now: Date.now() + REVIEW_WAIT_MS, native: true, launch });
    expect(asked).toBe(true);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(REVIEW_ASKED_KEY)).not.toBeNull();
  });

  it('한 번 띄운 뒤에는 다시 띄우지 않는다', async () => {
    await add();
    const launch = launcher();
    const later = Date.now() + REVIEW_WAIT_MS;
    await maybeAskForReview({ now: later, native: true, launch });
    expect(await maybeAskForReview({ now: later + 1000, native: true, launch })).toBe(false);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('웹에서는 띄우지 않는다', async () => {
    await add();
    const launch = launcher();
    expect(await maybeAskForReview({ now: Date.now() + REVIEW_WAIT_MS, native: false, launch })).toBe(false);
    expect(launch).not.toHaveBeenCalled();
    expect(localStorage.getItem(REVIEW_ASKED_KEY)).toBeNull();
  });

  it('7일이 안 됐으면 띄우지 않고 표시도 안 남긴다', async () => {
    await add();
    const launch = launcher();
    expect(await maybeAskForReview({ now: Date.now() + 1000, native: true, launch })).toBe(false);
    expect(launch).not.toHaveBeenCalled();
    expect(localStorage.getItem(REVIEW_ASKED_KEY)).toBeNull();
  });

  /* 다른 가계부에서 3천 건을 가져온 날 바로 묻지 않는다. 가져온 기록은 "써 봤다"는 뜻이 아니다. */
  it('가져온 기록만 있으면 묻지 않는다', async () => {
    await add('imp-1');
    await add('imp-1');
    await add('imp-1');
    const launch = launcher();
    expect(await maybeAskForReview({ now: Date.now() + 10 * REVIEW_WAIT_MS, native: true, launch })).toBe(false);
    expect(launch).not.toHaveBeenCalled();
  });

  it('가져온 기록은 처음 쓴 날 계산에서 빠진다', async () => {
    const imported = await add('imp-1');
    await db.expenses.update(imported, { createdAt: T - 8 * 24 * 60 * 60 * 1000 });
    const own = await add();
    const ownCreatedAt = (await db.expenses.get(own))!.createdAt;
    expect(await firstOwnRecordAt()).toBe(ownCreatedAt);
  });

  /* 백업에서 복원한 기록은 원래 createdAt을 들고 온다 — 오래 쓴 사람이다. */
  it('오래전에 만든 기록이 있으면 묻는다', async () => {
    const id = await add();
    await db.expenses.update(id, { createdAt: T - REVIEW_WAIT_MS });
    const launch = launcher();
    expect(await maybeAskForReview({ now: T, native: true, launch })).toBe(true);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  /* 저장을 빠르게 두 번 하면 두 호출이 겹친다. 리뷰 창은 한 번만. */
  it('동시에 두 번 불러도 한 번만 띄운다', async () => {
    await add();
    const launch = launcher();
    const later = Date.now() + REVIEW_WAIT_MS;
    const results = await Promise.all([
      maybeAskForReview({ now: later, native: true, launch }),
      maybeAskForReview({ now: later, native: true, launch }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  /* Play 스토어가 없거나 Play에서 받지 않은 앱. 저장 흐름에 던지지 않고, 다시 시도하지도 않는다. */
  it('띄우기가 실패해도 표시는 남는다', async () => {
    await add();
    const launch = vi.fn(() => Promise.reject(new Error('x')));
    const later = Date.now() + REVIEW_WAIT_MS;
    expect(await maybeAskForReview({ now: later, native: true, launch })).toBe(true);
    expect(localStorage.getItem(REVIEW_ASKED_KEY)).not.toBeNull();
    expect(await maybeAskForReview({ now: later, native: true, launch })).toBe(false);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  /* 저장하고 바로 홈으로 나가면 0.8초 뒤엔 앱이 화면에 없다. 그때 띄우면 다른 앱 위로 튀어나오거나 막혀서 한 번뿐인
     기회만 사라진다. 이번엔 건너뛰고 다음 저장 때 다시 본다. */
  it('앱이 화면에 없으면 띄우지 않고 표시도 안 남긴다', async () => {
    await add();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const launch = launcher();
    expect(await maybeAskForReview({ now: Date.now() + REVIEW_WAIT_MS, native: true, launch })).toBe(false);
    expect(launch).not.toHaveBeenCalled();
    expect(localStorage.getItem(REVIEW_ASKED_KEY)).toBeNull();
  });

  /* 다른 가계부에서 수만 건을 가져온 사람은 첫 주 동안 저장할 때마다 전체를 훑게 된다. 훑는 동안 다음 저장이 기다린다. */
  it('처음 쓴 날은 한 번 찾으면 다시 훑지 않는다', async () => {
    await add();
    const each = vi.spyOn(db.expenses, 'each');
    const launch = launcher();
    await maybeAskForReview({ now: Date.now() + 1000, native: true, launch });
    await maybeAskForReview({ now: Date.now() + 2000, native: true, launch });
    expect(each).toHaveBeenCalledTimes(1);
  });

  it('직접 적은 기록이 없을 때는 기억하지 않는다', async () => {
    const launch = launcher();
    expect(await maybeAskForReview({ now: Date.now(), native: true, launch })).toBe(false);
    const id = await add();
    await db.expenses.update(id, { createdAt: Date.now() - REVIEW_WAIT_MS });
    expect(await maybeAskForReview({ now: Date.now(), native: true, launch })).toBe(true);
  });

  /* 표시를 읽을 수 없으면 이미 물었는지 모른다. 모르면 묻지 않는 쪽 — 매번 묻는 것보다 낫다. */
  it('localStorage가 던지면 묻지 않는다', async () => {
    await add();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const launch = launcher();
    expect(await maybeAskForReview({ now: Date.now() + REVIEW_WAIT_MS, native: true, launch })).toBe(false);
    expect(launch).not.toHaveBeenCalled();
  });
});
