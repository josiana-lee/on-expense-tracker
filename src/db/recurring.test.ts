import { describe, expect, it } from 'vitest';

import { db } from './db';
import { addExpense } from './expenses';
import {
  MAX_RECURRING_RULES,
  RecurringLimitError,
  addRecurringRule,
  deleteRecurringRule,
  isTemplateVisible,
  setRecurringVisible,
  templateAmountText,
  touchTemplate,
  updateRecurringRule,
} from './recurring';
import { bootstrap } from './seed';
import { toMinor } from './types';

async function makeTemplate(over: Partial<Parameters<typeof addRecurringRule>[0]> = {}) {
  await bootstrap();
  await addRecurringRule({
    name: '월세',
    amount: 600000,
    categoryId: 'housing',
    paymentMethodId: 'cash',
    ...over,
  });
  const [rule] = await db.recurringRules.toArray();
  return rule;
}

describe('saved expenses', () => {
  it('stores the amount as given', async () => {
    const rule = await makeTemplate();
    expect(rule.amount).toBe(600_000);
    expect(rule.name).toBe('월세');
  });

  it('keeps every field the input screen fills from', async () => {
    const rule = await makeTemplate({
      subLabel: '보증금',
      memo: '집주인 계좌',
      paymentMethodId: 'hyundai',
    });

    expect(rule.categoryId).toBe('housing');
    expect(rule.subLabel).toBe('보증금');
    expect(rule.memo).toBe('집주인 계좌');
    expect(rule.paymentMethodId).toBe('hyundai');
  });

  /* 저장된 금액이 입력 화면을 거쳐 그대로 기록돼야 한다. 이 왕복에 100으로
     나누는 코드가 끼어 60만원 템플릿이 6천원으로 기록된 적이 있고, 화면 쪽에
     같은 모양의 변환이 그대로 남아 있어서 불변식만 따로 잡아 둔다. */
  it('round-trips the amount through the input screen unchanged', async () => {
    for (const amount of [4500, 600_000, 99_999_999_999]) {
      await db.delete();
      await db.open();
      const rule = await makeTemplate({ amount });

      const typed = templateAmountText(rule);
      expect(typed).toMatch(/^\d+$/);
      expect(toMinor(Number(typed))).toBe(rule.amount);
    }
  });

  it('files nothing on its own — saving stays the user’s "추가!"', async () => {
    const rule = await makeTemplate();

    await touchTemplate(rule.id);

    expect(await db.expenses.count()).toBe(0);
  });

  it('leaves already-saved expenses alone when the template is deleted', async () => {
    const rule = await makeTemplate();
    await addExpense({
      amount: rule.amount,
      categoryId: rule.categoryId,
      paymentMethodId: rule.paymentMethodId,
    });

    await deleteRecurringRule(rule.id);

    expect(await db.recurringRules.count()).toBe(0);
    expect(await db.expenses.count()).toBe(1);
  });
});

describe('use tracking', () => {
  /* 입력 탭 칩은 폼만 채우고 저장은 "추가!"가 한다. 그 경로에서 사용 표시가
     빠지면, 정작 제일 많이 쓰는 길이 정렬에 하나도 반영되지 않는다. */
  it('marks a template used without logging anything itself', async () => {
    const rule = await makeTemplate();

    await touchTemplate(rule.id);

    const after = (await db.recurringRules.get(rule.id))!;
    expect(after.lastUsedAt).toBeTypeOf('number');
    expect(await db.expenses.count()).toBe(0);
  });

  it('sorts the most recently used first', async () => {
    await bootstrap();
    for (const name of ['A', 'B', 'C']) {
      await addRecurringRule({ name, amount: 1000, categoryId: 'food', paymentMethodId: 'cash' });
    }
    const rules = await db.recurringRules.toArray();
    const b = rules.find((r) => r.name === 'B')!;

    await touchTemplate(b.id);

    const sorted = (await db.recurringRules.toArray()).sort(
      (x, y) => (y.lastUsedAt ?? 0) - (x.lastUsedAt ?? 0) || y.createdAt - x.createdAt,
    );
    expect(sorted[0].name).toBe('B');
  });
});

describe('the cap', () => {
  async function fill(n: number) {
    await bootstrap();
    for (let i = 0; i < n; i++) {
      await addRecurringRule({
        name: `t${i}`,
        amount: 1000,
        categoryId: 'food',
        paymentMethodId: 'cash',
      });
    }
  }

  it(`stops at ${MAX_RECURRING_RULES}`, async () => {
    await fill(MAX_RECURRING_RULES);

    await expect(
      addRecurringRule({ name: '하나 더', amount: 1000, categoryId: 'food', paymentMethodId: 'cash' }),
    ).rejects.toBeInstanceOf(RecurringLimitError);

    expect(await db.recurringRules.count()).toBe(MAX_RECURRING_RULES);
  });

  /* The cap must not become a trap: deleting one has to free a slot, or a
     full list is permanently full. */
  it('frees a slot when one is deleted', async () => {
    await fill(MAX_RECURRING_RULES);
    const [first] = await db.recurringRules.toArray();

    await deleteRecurringRule(first.id);
    await addRecurringRule({ name: '새로', amount: 1000, categoryId: 'food', paymentMethodId: 'cash' });

    expect(await db.recurringRules.count()).toBe(MAX_RECURRING_RULES);
    const names = (await db.recurringRules.toArray()).map((r) => r.name);
    expect(names).toContain('새로');
  });
});

describe('visibility', () => {
  it('shows a newly made template without asking', async () => {
    const rule = await makeTemplate();
    expect(isTemplateVisible(rule)).toBe(true);
  });

  it('toggles off and back on', async () => {
    const rule = await makeTemplate();

    await setRecurringVisible(rule.id, false);
    expect(isTemplateVisible((await db.recurringRules.get(rule.id))!)).toBe(false);

    await setRecurringVisible(rule.id, true);
    expect(isTemplateVisible((await db.recurringRules.get(rule.id))!)).toBe(true);
  });

  /* Rules made by the scheduled version have no such field. Reading that as
     hidden would make them vanish from the input screen on update — the one
     outcome a user cannot diagnose. */
  it('treats a template from before the field as visible', async () => {
    const rule = await makeTemplate();
    await db.recurringRules.update(rule.id, { visibleOnHome: undefined });

    const legacy = (await db.recurringRules.get(rule.id))!;
    expect('visibleOnHome' in legacy).toBe(false);
    expect(isTemplateVisible(legacy)).toBe(true);
  });

  it('survives an edit', async () => {
    const rule = await makeTemplate();
    await setRecurringVisible(rule.id, false);

    await updateRecurringRule(rule.id, {
      name: '월세 인상',
      amount: 650000,
      categoryId: 'housing',
      paymentMethodId: 'cash',
    });

    const after = (await db.recurringRules.get(rule.id))!;
    expect(after.name).toBe('월세 인상');
    expect(isTemplateVisible(after)).toBe(false);
  });
});
