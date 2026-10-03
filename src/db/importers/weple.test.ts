import { describe, expect, it } from 'vitest';

import { isWeple, parseWeple } from './weple';

const HEAD = '사용자,거래일,수입/지출,금액,분류,하위 분류,내역,지불,카드,메모';
const file = (...lines: string[]) => [HEAD, ...lines].join('\n');

describe('isWeple', () => {
  it('위플 헤더를 알아본다', () => {
    expect(isWeple(HEAD.split(','))).toBe(true);
  });

  it('남의 헤더는 아니라고 한다', () => {
    expect(isWeple(['날짜', '시간', '구분', '금액'])).toBe(false);
    expect(isWeple([])).toBe(false);
  });

  /* 열 순서가 바뀌거나 하나 늘어도 이름이 다 있으면 받는다 — 앱이 업데이트
     되면서 열이 붙는 건 흔하고, 그때마다 못 읽는다고 하면 쓸모가 없다. */
  it('열이 하나 더 붙어도 알아본다', () => {
    expect(isWeple([...HEAD.split(','), '태그'])).toBe(true);
  });
});

describe('parseWeple', () => {
  it('한 줄을 우리 모양으로 바꾼다', () => {
    const [row] = parseWeple(
      file('내 가계부,2026-09-11,지출,"15,400",식비,,식물원 김밥,카드,삼성카드,맛있었음'),
    ).rows;
    expect(row).toEqual({
      date: '2026-09-11',
      amount: 15400,
      type: 'expense',
      categoryName: '식비',
      label: '식물원 김밥',
      memo: '맛있었음',
      paymentName: '삼성카드',
      paymentKind: 'credit',
    });
  });

  it('수입을 지출과 구분한다', () => {
    const [row] = parseWeple(file('내 가계부,2026-02-21,수입,"50,000",용돈,,,현금,현금,')).rows;
    expect(row.type).toBe('income');
    expect(row.paymentKind).toBe('cash');
  });

  /* 내역이 비어 있는 행이 있다(월급 등). 그대로 두면 기록에 분류명만 남아
     "기타"로 보이므로, 원본 분류명을 이름으로 쓴다. */
  it('내역이 비면 분류명을 이름으로 쓴다', () => {
    const [row] = parseWeple(file('내 가계부,2022-12-28,수입,"4,705,814",월급,,,현금,현금,')).rows;
    expect(row.label).toBe('월급');
  });

  it('지불 종류로 결제수단 종류를 정한다', () => {
    const rows = parseWeple(
      file(
        '내 가계부,2026-01-01,지출,"1,000",식비,,가,카드,롯데카드,',
        '내 가계부,2026-01-02,지출,"1,000",식비,,나,현금,현금,',
        '내 가계부,2026-01-03,지출,"1,000",식비,,다,체크카드,체크카드,',
      ),
    ).rows;
    expect(rows.map((r) => r.paymentKind)).toEqual(['credit', 'cash', 'debit']);
  });

  /* 하위 분류를 쓰는 사람도 있다. 그때는 그쪽이 이름이고 내역은 메모로
     간다 — 둘 다 버리지 않는다. */
  it('하위 분류가 있으면 그것을 이름으로 쓰고 내역은 메모로 보낸다', () => {
    const [row] = parseWeple(
      file('내 가계부,2026-01-01,지출,"9,000",식비,점심,식물원 김밥,카드,삼성카드,'),
    ).rows;
    expect(row.label).toBe('점심');
    expect(row.memo).toBe('식물원 김밥');
  });

  it('메모가 이미 있으면 내역을 메모에 덧붙이지 않는다', () => {
    const [row] = parseWeple(
      file('내 가계부,2026-01-01,지출,"9,000",식비,점심,김밥,카드,삼성카드,원래메모'),
    ).rows;
    expect(row.memo).toBe('원래메모');
  });

  describe('할부', () => {
    it('내역 끝의 (n/m)을 할부로 읽고 이름에서는 뗀다', () => {
      const [row] = parseWeple(
        file('내 가계부,2026-10-01,지출,"151,086",식비,,갤럭시 폴드8 급구매(14/14),카드,삼성카드,'),
      ).rows;
      expect(row.label).toBe('갤럭시 폴드8 급구매');
      expect(row.installment).toEqual({
        groupKey: '갤럭시 폴드8 급구매|14|삼성카드',
        no: 14,
        months: 14,
      });
    });

    /* 같은 이름·같은 카드로 2개월 할부를 두 번 하면 (1/2)(2/2)가 네 줄이
       된다. 묶음 키만으로 나누면 한 묶음에 1,1,2,2가 들어가 깨진다 —
       회차 순서로 끊는 건 여기가 아니라 묶는 쪽의 일이다. */
    it('묶음 키는 이름·개월·카드로 만든다', () => {
      const rows = parseWeple(
        file(
          '내 가계부,2026-01-01,지출,"1,000",식비,,보톡스(1/2),카드,삼성카드,',
          '내 가계부,2026-02-01,지출,"1,000",식비,,보톡스(2/2),카드,삼성카드,',
          '내 가계부,2026-05-01,지출,"1,000",식비,,보톡스(1/2),카드,현대카드,',
        ),
      ).rows;
      expect(rows[0].installment?.groupKey).toBe(rows[1].installment?.groupKey);
      expect(rows[2].installment?.groupKey).not.toBe(rows[0].installment?.groupKey);
    });

    it('할부가 아닌 행에는 할부 정보가 없다', () => {
      const [row] = parseWeple(
        file('내 가계부,2026-01-01,지출,"1,000",식비,,김밥,카드,삼성카드,'),
      ).rows;
      expect(row.installment).toBeUndefined();
    });
  });

  describe('못 읽는 줄', () => {
    it('날짜나 금액이 이상한 줄은 버리고 세어둔다', () => {
      const out = parseWeple(
        file(
          '내 가계부,2026-01-01,지출,"1,000",식비,,정상,카드,삼성카드,',
          '내 가계부,날짜아님,지출,"1,000",식비,,나쁨,카드,삼성카드,',
          '내 가계부,2026-01-03,지출,금액아님,식비,,나쁨,카드,삼성카드,',
          '내 가계부,2026-01-04,지출,0,식비,,영원,카드,삼성카드,',
        ),
      );
      expect(out.rows).toHaveLength(1);
      expect(out.skipped).toBe(3);
    });

    it('출처 이름을 알려준다', () => {
      expect(parseWeple(file()).source).toBe('위플 가계부');
    });
  });
});
