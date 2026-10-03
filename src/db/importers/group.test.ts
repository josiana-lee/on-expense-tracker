import { describe, expect, it } from 'vitest';

import { dropInstallment, groupInstallments } from './group';
import type { ImportRow } from './types';

const row = (date: string, no: number, months: number, key = 'A', amount = 1000): ImportRow => ({
  date: date as ImportRow['date'],
  amount,
  categoryName: '식비',
  paymentName: '삼성카드',
  paymentKind: 'credit',
  installment: { groupKey: key, no, months },
});

const plain = (date: string): ImportRow => ({
  date: date as ImportRow['date'],
  amount: 1000,
  categoryName: '식비',
  paymentName: '현금',
  paymentKind: 'cash',
});

describe('groupInstallments', () => {
  it('1..m이 다 모이면 한 묶음으로 만든다', () => {
    const out = groupInstallments([row('2026-01-01', 1, 3), row('2026-02-01', 2, 3), row('2026-03-01', 3, 3)]);
    const ids = out.map((r) => r.installmentId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBeDefined();
    expect(out.map((r) => r.installmentNo)).toEqual([1, 2, 3]);
    expect(out.every((r) => r.installmentMonths === 3)).toBe(true);
  });

  /* 총액은 회차 합이다. 다시 나누지 않는다 — 원본 앱이 이미 나눈 값이고,
     우리가 splitInstallment로 다시 쪼개면 나머지 처리 방식이 달라서 1원씩
     어긋날 수 있다. 그러면 카드 명세와 안 맞는다. */
  it('총액은 회차 금액의 합이다', () => {
    const out = groupInstallments([
      row('2026-01-01', 1, 3, 'A', 33334),
      row('2026-02-01', 2, 3, 'A', 33333),
      row('2026-03-01', 3, 3, 'A', 33333),
    ]);
    expect(out.every((r) => r.installmentTotal === 100000)).toBe(true);
  });

  /* 회차가 비면 묶지 않는다. 반쪽 할부는 달력에 "3개월 할부 1/3"과 "3/3"만
     남아서 사용자가 읽을 수 없다. 개별 지출로 두면 적어도 합계는 맞는다. */
  it('회차가 비면 묶지 않고 개별 지출로 둔다', () => {
    const out = groupInstallments([row('2026-01-01', 1, 3), row('2026-03-01', 3, 3)]);
    expect(out.every((r) => r.installmentId === undefined)).toBe(true);
  });

  /* 같은 이름·같은 카드로 2개월 할부를 두 번 하면 1,1,2,2가 한 키에 들어온다.
     날짜 순으로 보며 회차 1을 만날 때마다 새 묶음을 시작하면 갈린다 —
     실제 파일에서 이 처리로 복원율이 96%에서 98.3%로 올랐다. */
  it('같은 키에 묶음이 둘이면 회차 1에서 끊는다', () => {
    const out = groupInstallments([
      row('2026-01-01', 1, 2),
      row('2026-02-01', 2, 2),
      row('2026-06-01', 1, 2),
      row('2026-07-01', 2, 2),
    ]);
    const ids = out.map((r) => r.installmentId);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[2]);
  });

  it('키가 다르면 섞이지 않는다', () => {
    const out = groupInstallments([
      row('2026-01-01', 1, 2, 'A'),
      row('2026-01-01', 1, 2, 'B'),
      row('2026-02-01', 2, 2, 'A'),
      row('2026-02-01', 2, 2, 'B'),
    ]);
    expect(new Set(out.map((r) => r.installmentId)).size).toBe(2);
  });

  it('할부가 아닌 행은 그대로 둔다', () => {
    const out = groupInstallments([plain('2026-01-01'), row('2026-01-01', 1, 1)]);
    expect(out[0].installmentId).toBeUndefined();
  });

  /* 1개월짜리는 할부가 아니다. splitInstallment도 2개월부터만 받는다. */
  it('1개월은 할부로 치지 않는다', () => {
    const out = groupInstallments([row('2026-01-01', 1, 1)]);
    expect(out[0].installmentId).toBeUndefined();
  });

  /* 같은 이름·같은 카드·같은 개월 수의 할부 두 건이 한 달 어긋나게 겹치면, 회차
     번호만 보고 이으면 서로 다른 구매가 한 묶음이 된다. A는 1·2·3월에 10만 원,
     B는 2·3·4월에 1만 원일 때 B1+B2+A3이 총액 12만 원짜리 하나로 묶였다.
     할부는 한 달에 한 번이다 — 앞 회차 다음 달이 아니면 이어진 회차가 아니다. */
  it('다음 달로 이어지지 않는 회차는 같은 묶음이 아니다', () => {
    const out = groupInstallments([
      row('2026-01-05', 1, 3, 'K', 100_000),
      row('2026-02-05', 2, 3, 'K', 100_000),
      row('2026-02-20', 1, 3, 'K', 10_000),
      row('2026-03-20', 2, 3, 'K', 10_000),
      row('2026-03-25', 3, 3, 'K', 100_000), // A의 3회차가 B의 2회차 뒤에 온다
      row('2026-04-20', 3, 3, 'K', 10_000),
    ]);
    // 어느 쪽도 잘못 합쳐지지 않는다. 합쳐진 묶음이 있다면 총액이 12만 원일 것이다.
    const totals = out.map((r) => r.installmentTotal).filter((t) => t !== undefined);
    expect(totals).not.toContain(120_000);
    expect(totals).not.toContain(210_000);
  });

  /* 위플은 말일이 없는 달을 넘겨서 적는다. 12/30 구매의 2회차는 1/30, 3회차는 2월 30일
     이 없어서 3/2다. 실제 9년치 파일에서 멀쩡한 할부 하나(3행)가 "정확히 다음 달"
     규칙에 걸려 거절됐다. 앞이 29일 이후이고 다음이 3일 이전일 때만 두 달 건너뛴
     것을 이어진 것으로 본다 — 그냥 "두 달까지"로 풀면 틀리게 합치는 길이 다시 열린다. */
  it('말일 날짜가 다음 달로 넘친 회차는 이어진 것으로 본다', () => {
    const out = groupInstallments([
      row('2022-12-30', 1, 3, 'K', 116_000),
      row('2023-01-30', 2, 3, 'K', 116_000),
      row('2023-03-02', 3, 3, 'K', 116_000),
    ]);
    expect(new Set(out.map((r) => r.installmentId)).size).toBe(1);
    expect(out[0].installmentId).toBeDefined();
  });

  it('말일이 아닌 두 달 건너뜀은 이어진 것으로 보지 않는다', () => {
    const out = groupInstallments([
      row('2026-01-10', 1, 3),
      row('2026-02-10', 2, 3),
      row('2026-04-10', 3, 3), // 3월이 빠졌다
    ]);
    expect(out.every((r) => r.installmentId === undefined)).toBe(true);
  });

  /* 묶이지 못한 회차는 이름에서 "(2/3)"을 이미 뗐다. 그대로 두면 "이어폰" 한 줄이
     왜 금액이 이런지 단서가 사라진다 — 메모로 남긴다. */
  it('묶이지 못한 회차는 회차를 메모로 남긴다', () => {
    const out = groupInstallments([row('2026-02-01', 2, 3)]);
    expect(out[0].installmentId).toBeUndefined();
    expect(out[0].memo).toBe('할부 2/3회차');
  });

  it('원래 메모가 있으면 덮어쓰지 않는다', () => {
    const r = { ...row('2026-02-01', 2, 3), memo: '선물' };
    expect(groupInstallments([r])[0].memo).toBe('선물');
  });

  describe('dropInstallment', () => {
    /* 묶음의 일부 회차만 가져오게 되면(분류를 "가져오지 않기"로 골라서) 남은 회차를
       할부로 두면 "3개월 할부 1/3"과 총액 30만 원이 달린 반쪽 할부가 된다. */
    it('할부 필드를 떼고 회차를 메모로 남긴다', () => {
      const [r] = groupInstallments([
        row('2026-01-01', 1, 2),
        row('2026-02-01', 2, 2),
      ]);
      const plainRow = dropInstallment(r);
      expect(plainRow.installmentId).toBeUndefined();
      expect(plainRow.installmentTotal).toBeUndefined();
      expect(plainRow.memo).toBe('할부 1/2회차');
    });
  });

  it('행 개수와 순서는 그대로다', () => {
    const input = [plain('2026-01-02'), row('2026-01-01', 1, 2), row('2026-02-01', 2, 2)];
    const out = groupInstallments(input);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.date)).toEqual(['2026-01-02', '2026-01-01', '2026-02-01']);
  });
});
