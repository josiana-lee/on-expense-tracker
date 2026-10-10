import { describe, expect, it } from 'vitest';

import { currentAccountingMonth, fmt, monthGrid, monthRange } from './date';

/* 달력 화면과 날짜 피커가 같이 쓰는 격자다. 한쪽만 고쳐져서 두 달력이 다른
   요일로 시작하는 일이 없도록 여기서 잠가둔다. */
describe('monthGrid', () => {
  it('일요일 시작이면 요일 머리글이 일월화수목금토', () => {
    expect(monthGrid(2026, 10, 0).dows).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('월요일 시작이면 머리글이 한 칸 돌아간다', () => {
    expect(monthGrid(2026, 10, 1).dows).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  /* 2026년 10월 1일은 목요일. 일요일 시작이면 앞에 빈칸 4개(일·월·화·수),
     월요일 시작이면 3개가 와야 1일이 목요일 자리에 선다. */
  it('주 시작요일에 따라 앞 빈칸 수가 달라진다', () => {
    const blanks = (w: number) =>
      monthGrid(2026, 10, w).cells.findIndex((c) => c.date !== null);
    expect(blanks(0)).toBe(4);
    expect(blanks(1)).toBe(3);
  });

  it('그 달의 날짜를 하나도 빠뜨리지 않는다', () => {
    const days = monthGrid(2026, 10, 0).cells.filter((c) => c.date !== null);
    expect(days).toHaveLength(31);
    expect(days[0].date?.dateKey).toBe('2026-10-01');
    expect(days[30].date?.dateKey).toBe('2026-10-31');
  });

  /* 윤년 2월. 날짜 계산을 손으로 하면 제일 먼저 틀리는 곳이다. */
  it('윤년 2월은 29일까지', () => {
    const days = monthGrid(2028, 2, 0).cells.filter((c) => c.date !== null);
    expect(days).toHaveLength(29);
    expect(days[28].date?.dateKey).toBe('2028-02-29');
  });

  it('평년 2월은 28일까지', () => {
    expect(monthGrid(2026, 2, 0).cells.filter((c) => c.date !== null)).toHaveLength(28);
  });

  /* 빈칸은 key가 겹치면 안 된다 — React가 칸을 재사용해서 격자가 어긋난다. */
  it('칸마다 key가 겹치지 않는다', () => {
    const keys = monthGrid(2026, 10, 1).cells.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/* 월 시작일은 예산과 카드 사용기간이 같이 쓴다. 시작일이 그 달에 없는 날(31일인데
   4월, 29일인데 평년 2월)일 때 두 함수가 같은 주기를 가리켜야 한다. */
describe('monthRange', () => {
  it('1일이면 달력 한 달이다', () => {
    expect(monthRange(2026, 2, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange(2028, 2, 1)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('달 이름은 주기가 시작하는 달이다', () => {
    expect(monthRange(2026, 8, 25)).toEqual({ from: '2026-08-25', to: '2026-09-24' });
  });

  it('12월 주기는 다음 해 1월에 끝난다', () => {
    expect(monthRange(2026, 12, 25)).toEqual({ from: '2026-12-25', to: '2027-01-24' });
  });

  /* 31일 시작: 말일이 31일이 아닌 달에는 말일에 시작한다. */
  it('없는 날은 그 달 말일에 시작한다', () => {
    expect(monthRange(2026, 1, 31)).toEqual({ from: '2026-01-31', to: '2026-02-27' });
    expect(monthRange(2026, 2, 31)).toEqual({ from: '2026-02-28', to: '2026-03-30' });
    expect(monthRange(2026, 3, 31)).toEqual({ from: '2026-03-31', to: '2026-04-29' });
    expect(monthRange(2026, 4, 31)).toEqual({ from: '2026-04-30', to: '2026-05-30' });
  });

  it('윤년 2월에는 29일에 시작한다', () => {
    expect(monthRange(2028, 2, 29)).toEqual({ from: '2028-02-29', to: '2028-03-28' });
    expect(monthRange(2026, 2, 29)).toEqual({ from: '2026-02-28', to: '2026-03-28' });
  });

  it('12월 31일 시작은 다음 해 1월 30일에 끝난다', () => {
    expect(monthRange(2026, 12, 31)).toEqual({ from: '2026-12-31', to: '2027-01-30' });
  });
});

describe('currentAccountingMonth', () => {
  it('시작일 전이면 지난달 주기다', () => {
    expect(currentAccountingMonth(25, new Date(2026, 9, 10))).toEqual({ year: 2026, month: 9 });
    expect(currentAccountingMonth(25, new Date(2026, 9, 25))).toEqual({ year: 2026, month: 10 });
  });

  it('1월 초는 지난해 12월 주기다', () => {
    expect(currentAccountingMonth(25, new Date(2027, 0, 5))).toEqual({ year: 2026, month: 12 });
  });

  /* 이 둘이 어긋나면 "오늘이 어느 주기에도 안 들어가는" 날이 생긴다. 31일 시작에서
     3월 2일이 그 예였다(1월 주기 1/31~3/2 안인데 "2월 주기"라고 답했다). */
  it('모든 시작일에서, 모든 날이 정확히 자기가 가리킨 주기 안에 있다', () => {
    for (let startDay = 1; startDay <= 31; startDay++) {
      for (let t = new Date(2026, 0, 1); t < new Date(2029, 0, 1); t.setDate(t.getDate() + 1)) {
        const { year, month } = currentAccountingMonth(startDay, t);
        const { from, to } = monthRange(year, month, startDay);
        const day = fmt(t);
        if (day < from || day > to) {
          throw new Error(`시작일 ${startDay}: ${day}이 ${year}-${month} 주기 ${from}~${to} 밖이다`);
        }
      }
    }
  });

  it('이어지는 두 주기는 비지도 겹치지도 않는다', () => {
    for (let startDay = 1; startDay <= 31; startDay++) {
      for (let m = 1; m <= 12; m++) {
        const here = monthRange(2026, m, startDay);
        const next = m === 12 ? monthRange(2027, 1, startDay) : monthRange(2026, m + 1, startDay);
        const after = new Date(here.to.replace(/-/g, '/'));
        after.setDate(after.getDate() + 1);
        expect(fmt(after), `시작일 ${startDay}, ${m}월`).toBe(next.from);
      }
    }
  });
});
