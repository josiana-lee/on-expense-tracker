import { describe, expect, it } from 'vitest';

import { planImport } from './plan';
import type { GroupedRow } from './group';
import type { CategoryRecord, PaymentMethodRecord } from '../types';

const cat = (id: string, name: string) => ({ id, name, deprecated: false }) as CategoryRecord;
const pay = (id: string, name: string) => ({ id, name, archived: false }) as PaymentMethodRecord;

const CATS = [cat('food', '식비'), cat('daily', '생필품'), cat('etc', '기타')];
const PAYS = [pay('cash', '현금'), pay('samsung', '삼성카드')];

const row = (p: Partial<GroupedRow> = {}): GroupedRow => ({
  date: '2026-01-01' as GroupedRow['date'],
  amount: 1000,
  type: 'expense',
  categoryName: '식비',
  paymentName: '삼성카드',
  paymentKind: 'credit',
  ...p,
});

describe('planImport', () => {
  it('이름이 같은 분류는 저절로 짝지어진다', () => {
    const plan = planImport({ source: '위플', rows: [row()], skipped: 0 }, CATS, PAYS);
    expect(plan.matched.get('식비')).toBe('food');
    expect(plan.unmatched).toHaveLength(0);
  });

  /* 편한가계부는 분류명 앞에 이모지를 붙인다("🍜 식비"). 그대로 비교하면
     하나도 안 맞아서 사용자가 23개를 전부 손으로 짝지어야 한다. */
  it('이모지와 공백은 떼고 비교한다', () => {
    const plan = planImport(
      { source: 'x', rows: [row({ categoryName: '🍜 식비' })], skipped: 0 },
      CATS,
      PAYS,
    );
    expect(plan.matched.get('🍜 식비')).toBe('food');
  });

  /* 이모지를 뗄 때 숫자까지 지우면 "스터디1"과 "스터디2"가 같은 이름이 되어
     한 카테고리에 섞인다. \p{Emoji_Component}는 0-9와 #, *을 포함한다. */
  it('이름에 든 숫자는 지우지 않는다', () => {
    const cats2 = [cat('s1', '스터디1'), cat('s2', '스터디2')];
    const plan = planImport(
      {
        source: 'x',
        rows: [row({ categoryName: '스터디2' }), row({ categoryName: '🍜 스터디1' })],
        skipped: 0,
      },
      cats2,
      PAYS,
    );
    expect(plan.matched.get('스터디2')).toBe('s2');
    expect(plan.matched.get('🍜 스터디1')).toBe('s1');
  });

  it('못 맞춘 분류는 많이 쓴 순서로 모아 둔다', () => {
    const plan = planImport(
      {
        source: 'x',
        rows: [
          row({ categoryName: '악세사리' }),
          row({ categoryName: '월급' }),
          row({ categoryName: '악세사리' }),
        ],
        skipped: 0,
      },
      CATS,
      PAYS,
    );
    expect(plan.unmatched).toEqual([
      { name: '악세사리', count: 2 },
      { name: '월급', count: 1 },
    ]);
  });

  /* 지워진 카테고리에 새 기록을 붙이면 달력에 이름 없는 줄이 생긴다. */
  it('보관된 카테고리에는 짝짓지 않는다', () => {
    const archived = [{ ...cat('food', '식비'), deprecated: true } as CategoryRecord];
    const plan = planImport({ source: 'x', rows: [row()], skipped: 0 }, archived, PAYS);
    expect(plan.unmatched.map((u) => u.name)).toEqual(['식비']);
  });

  describe('결제수단', () => {
    it('이름이 같으면 쓰던 것을 쓴다', () => {
      const plan = planImport({ source: 'x', rows: [row()], skipped: 0 }, CATS, PAYS);
      expect(plan.payments.get('삼성카드')).toEqual({ id: 'samsung' });
      expect(plan.newPayments).toHaveLength(0);
    });

    /* 없는 카드는 물어보지 않고 만든다. 카드 이름과 종류가 파일에 적혀 있어
       추측할 것이 없고, 여기서 사용자를 세우면 카드 다섯 장에 다섯 번 묻게
       된다. */
    it('없는 결제수단은 만들 목록에 넣는다', () => {
      const plan = planImport(
        { source: 'x', rows: [row({ paymentName: '롯데카드' })], skipped: 0 },
        CATS,
        PAYS,
      );
      expect(plan.newPayments).toEqual([{ name: '롯데카드', kind: 'credit' }]);
      expect(plan.payments.get('롯데카드')).toEqual({ create: { name: '롯데카드', kind: 'credit' } });
    });

    it('같은 이름을 두 번 만들지 않는다', () => {
      const plan = planImport(
        {
          source: 'x',
          rows: [row({ paymentName: '롯데카드' }), row({ paymentName: '롯데카드' })],
          skipped: 0,
        },
        CATS,
        PAYS,
      );
      expect(plan.newPayments).toHaveLength(1);
    });
  });

  describe('미리보기 숫자', () => {
    it('건수·기간·합계를 알려준다', () => {
      const plan = planImport(
        {
          source: '위플',
          rows: [
            row({ date: '2020-03-05' as GroupedRow['date'], amount: 3000 }),
            row({ date: '2026-01-01' as GroupedRow['date'], amount: 7000 }),
            row({ type: 'income', amount: 500000 }),
          ],
          skipped: 2,
        },
        CATS,
        PAYS,
      );
      expect(plan.count).toBe(3);
      expect(plan.skipped).toBe(2);
      expect(plan.from).toBe('2020-03-05');
      expect(plan.to).toBe('2026-01-01');
      // 수입은 지출 합계에 넣지 않는다 — sumExpenses와 같은 규칙.
      expect(plan.spend).toBe(10000);
      expect(plan.incomeCount).toBe(1);
    });

    it('할부 묶음 수를 센다', () => {
      const plan = planImport(
        {
          source: 'x',
          rows: [
            row({ installmentId: 'g1' as GroupedRow['installmentId'] }),
            row({ installmentId: 'g1' as GroupedRow['installmentId'] }),
            row({ installmentId: 'g2' as GroupedRow['installmentId'] }),
            row(),
          ],
          skipped: 0,
        },
        CATS,
        PAYS,
      );
      expect(plan.installmentGroups).toBe(2);
    });
  });
});

describe('현금', () => {
  /* addPaymentMethod는 신용·체크만 만든다 — 현금은 여러 장 가질 수 있는
     것이 아니라 하나뿐인 개념이다. 그래서 이름이 안 맞아도 종류로 찾는다. */
  it('이름이 달라도 현금 계열이면 쓰던 현금 수단에 붙인다', () => {
    const wallet = [{ id: 'cash', name: '지갑', kind: 'cash', archived: false }] as never;
    const plan = planImport(
      {
        source: 'x',
        rows: [row({ paymentName: '현금', paymentKind: 'cash' })],
        skipped: 0,
      },
      CATS,
      wallet,
    );
    expect(plan.payments.get('현금')).toEqual({ id: 'cash' });
    expect(plan.newPayments).toHaveLength(0);
  });

  it('쓸 수 있는 현금 수단이 없으면 만들지 않고 비워둔다', () => {
    const noCash = [{ id: 'k', name: '카드', kind: 'credit', archived: false }] as never;
    const plan = planImport(
      { source: 'x', rows: [row({ paymentName: '현금', paymentKind: 'cash' })], skipped: 0 },
      CATS,
      noCash,
    );
    expect(plan.payments.has('현금')).toBe(false);
    expect(plan.newPayments).toHaveLength(0);
  });
});
