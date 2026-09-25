import { describe, expect, it } from 'vitest';

import { sumByCategory } from './expenses';
import type { ExpenseRecord } from './types';

/** 이 함수가 보는 건 네 필드뿐이라 나머지는 채우지 않는다. 진짜 행을 흉내
 *  내려 들면 테스트가 무엇을 주장하는지가 잡음에 묻힌다. */
function row(categoryId: string, amount: number, type: 'expense' | 'income' = 'expense') {
  return { id: `${categoryId}-${amount}`, categoryId, amount, type } as unknown as ExpenseRecord;
}

describe('sumByCategory', () => {
  it('같은 카테고리를 합친다', () => {
    expect(sumByCategory([row('food', 8_000), row('food', 12_000)])).toEqual([
      { categoryId: 'food', spend: 20_000 },
    ]);
  });

  /* 이 목록이 답하는 질문은 "이번 달 어디에 제일 많이 썼나"다. 많이 쓴 것이
     위에 있지 않으면 질문에 답하지 못한다. */
  it('많이 쓴 순서로 내놓는다', () => {
    const out = sumByCategory([
      row('cafe', 12_000),
      row('food', 50_000),
      row('daily', 30_000),
    ]);
    expect(out.map((r) => r.categoryId)).toEqual(['food', 'daily', 'cafe']);
  });

  /* sumExpenses와 같은 규칙이다. 수입을 지출에 더하면 총액이 틀리고, 달력의
     "이번 달 지출"과 이 목록의 합이 어긋난다 — 같은 화면에 나란히 놓이므로
     어긋나는 순간 사용자가 알아챈다. */
  it('수입은 빼고 센다', () => {
    expect(sumByCategory([row('salary', 3_000_000, 'income'), row('food', 9_000)])).toEqual([
      { categoryId: 'food', spend: 9_000 },
    ]);
  });

  /* 0원짜리 줄로 화면을 채우지 않는다. 카테고리가 30개인데 그 달에 쓴 게
     셋이면, 안 쓴 27줄이 정작 큰 항목을 밀어낸다. */
  it('쓰지 않은 카테고리는 아예 내놓지 않는다', () => {
    expect(sumByCategory([row('food', 9_000)]).map((r) => r.categoryId)).toEqual(['food']);
    expect(sumByCategory([])).toEqual([]);
  });

  /* 금액이 같을 때 순서가 흔들리면, 리렌더마다 줄이 자리를 바꾸는 것처럼
     보인다. id로 갈라 고정한다. */
  it('금액이 같으면 순서가 흔들리지 않는다', () => {
    const a = sumByCategory([row('daily', 5_000), row('cafe', 5_000)]);
    const b = sumByCategory([row('cafe', 5_000), row('daily', 5_000)]);
    expect(a).toEqual(b);
  });
});
