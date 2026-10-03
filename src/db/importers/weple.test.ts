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
      categoryName: '식비',
      // 내역이 메모(= 제목)이고, 원본에 메모 칸이 따로 있으면 이어 붙는다.
      memo: '식물원 김밥 · 맛있었음',
      paymentName: '삼성카드',
      paymentKind: 'credit',
    });
  });

  /* 이 앱은 지출만 다룬다. 수입은 넣지 않고 건수만 세서 미리보기에서 알린다 —
     조용히 버리면 건수가 왜 모자란지 알 수 없다. */
  it('수입은 넣지 않고 건수만 센다', () => {
    const out = parseWeple(
      file(
        '내 가계부,2026-02-21,수입,"50,000",용돈,,,현금,현금,',
        '내 가계부,2026-02-22,지출,"1,000",식비,,김밥,현금,현금,',
      ),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.income).toBe(1);
    expect(out.skipped).toBe(0);
  });

  /* 수입도 지출도 아닌 값(이체 등)을 지출로 치면 같은 돈이 두 번 세어진다.
     시트 안내문이 "이체처럼 지출이 아닌 기록"이라고 말하는데 코드는 반대로 했다. */
  it('수입도 지출도 아닌 값은 읽지 못한 줄로 센다', () => {
    const out = parseWeple(file('내 가계부,2026-02-21,이체,"500,000",이체,,내 계좌로,현금,현금,'));
    expect(out.rows).toHaveLength(0);
    expect(out.income).toBe(0);
    expect(out.skipped).toBe(1);
  });

  /* 내역이 비어 있는 행이 있다(월급 등). 메모도 세부항목도 비워 둔다 — 직접 입력에서 아무것도
     안 쓴 것과 같고, 목록에서는 우리 쪽 카테고리 이름이 제목이 된다. 예전에는 분류명을 세부항목에
     복사해 넣었는데, 칩에서 고르는 칸이라 수정 화면에서 지울 수도 없었다. */
  it('내역이 비면 메모도 세부항목도 비워 둔다', () => {
    const [row] = parseWeple(file('내 가계부,2022-12-28,지출,"4,000",식비,,,현금,현금,')).rows;
    expect(row.memo).toBeUndefined();
    expect(row.label).toBeUndefined();
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

  /* 하위 분류를 쓰는 사람도 있다. 우리 입력과 같은 칸에 넣는다 — 하위 분류는 세부항목,
     내역은 메모(= 제목). 둘 다 버리지 않는다. */
  it('하위 분류는 세부항목, 내역은 메모로 보낸다', () => {
    const [row] = parseWeple(
      file('내 가계부,2026-01-01,지출,"9,000",식비,점심,식물원 김밥,카드,삼성카드,'),
    ).rows;
    expect(row.label).toBe('점심');
    expect(row.memo).toBe('식물원 김밥');
  });

  it('원본의 메모 칸이 따로 있으면 내역 뒤에 이어 붙인다', () => {
    const [row] = parseWeple(
      file('내 가계부,2026-01-01,지출,"9,000",식비,점심,김밥,카드,삼성카드,원래메모'),
    ).rows;
    expect(row.memo).toBe('김밥 · 원래메모');
    expect(row.label).toBe('점심');
  });

  it('내역 없이 메모 칸만 있으면 그것이 메모다', () => {
    const [row] = parseWeple(
      file('내 가계부,2026-01-01,지출,"9,000",식비,,,카드,삼성카드,혼자 먹음'),
    ).rows;
    expect(row.memo).toBe('혼자 먹음');
  });

  describe('할부', () => {
    it('내역 끝의 (n/m)을 할부로 읽고 이름에서는 뗀다', () => {
      const [row] = parseWeple(
        file('내 가계부,2026-10-01,지출,"151,086",식비,,갤럭시 폴드8 급구매(14/14),카드,삼성카드,'),
      ).rows;
      expect(row.memo).toBe('갤럭시 폴드8 급구매');
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

    /* QA가 넣어 본 값들. 정규식과 Number()만으로는 전부 통과해서 조용히 틀린 값이
       들어갔다. 14자리 금액 하나가 9월 합계를 100,000,000,435,516원으로 만들었다. */
    it('달력에 없는 날짜와 말이 안 되는 연도는 건너뛴다', () => {
      const out = parseWeple(
        file(
          '내 가계부,2026-13-45,지출,"1,000",식비,,가,현금,현금,',
          '내 가계부,2026-02-30,지출,"1,000",식비,,나,현금,현금,',
          '내 가계부,0000-01-01,지출,"1,000",식비,,다,현금,현금,',
          '내 가계부,9999-12-31,지출,"1,000",식비,,라,현금,현금,',
        ),
      );
      expect(out.rows).toHaveLength(0);
      expect(out.skipped).toBe(4);
    });

    it('소수·16진수·지수·초과 금액은 건너뛴다', () => {
      const out = parseWeple(
        file(
          '내 가계부,2026-01-01,지출,"15,400.5",식비,,가,현금,현금,',
          '내 가계부,2026-01-01,지출,0x10,식비,,나,현금,현금,',
          '내 가계부,2026-01-01,지출,1e3,식비,,다,현금,현금,',
          '내 가계부,2026-01-01,지출,"99,999,999,999,999",식비,,라,현금,현금,',
        ),
      );
      expect(out.rows).toHaveLength(0);
      expect(out.skipped).toBe(4);
    });

    it('2026-02-29처럼 평년에 없는 날도 건너뛴다', () => {
      expect(
        parseWeple(file('내 가계부,2027-02-29,지출,"1,000",식비,,가,현금,현금,')).skipped,
      ).toBe(1);
    });
  });

  describe('결제수단과 분류가 비었을 때', () => {
    /* 지불과 카드가 둘 다 비면 이름 없는 신용카드("")가 새로 만들어졌다. 편한가계부
       어댑터처럼 현금으로 둔다 — 가장 덜 틀린 가정이다. */
    it('둘 다 비면 현금으로 둔다', () => {
      const [row] = parseWeple(file('내 가계부,2026-01-01,지출,"1,000",식비,,가,,,')).rows;
      expect(row.paymentName).toBe('현금');
      expect(row.paymentKind).toBe('cash');
    });

    /* 모르는 지불 값은 신용카드가 아니라 체크로 친다. 신용카드로 만들면 할부 칩이
       열려서 영향이 더 크고, 다른 어댑터와 "모르면 이쪽"이 갈린다. */
    it('모르는 지불 값은 체크카드로 둔다', () => {
      const [row] = parseWeple(
        file('내 가계부,2026-01-01,지출,"1,000",식비,,가,계좌이체,토스,'),
      ).rows;
      expect(row.paymentKind).toBe('debit');
    });

    it('분류가 비면 "분류 없음"으로 부른다', () => {
      const [row] = parseWeple(file('내 가계부,2026-01-01,지출,"1,000",,,가,현금,현금,')).rows;
      expect(row.categoryName).toBe('분류 없음');
    });
  });

  describe('출처', () => {
    /* 화면에 보이는 건 형식 이름뿐이다. 어느 앱 파일인지 알아보긴 하지만
       그 앱 이름을 우리 화면에 띄우지는 않는다. */
    it('출처는 앱 이름이 아니라 형식으로 말한다', () => {
      expect(parseWeple(file()).source).toBe('CSV');
    });
  });
});
