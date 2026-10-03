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
