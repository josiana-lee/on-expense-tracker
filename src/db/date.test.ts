import { describe, expect, it } from 'vitest';

import { monthGrid } from './date';

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
