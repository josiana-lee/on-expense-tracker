import { describe, expect, it } from 'vitest';

import { buildMemoStats, memoKey, suggestMemos, type MemoRow } from './memoSuggest';

const TODAY = new Date(2026, 9, 10); // 2026-10-10

function row(memo: string, categoryId: string, amount: number, date: string, extra: Partial<MemoRow> = {}): MemoRow {
  return { memo, categoryId, amount, date, ...extra };
}

const stats = (rows: MemoRow[]) => buildMemoStats(rows, TODAY);
const ask = (rows: MemoRow[], opts: { categoryId?: string; amount?: number; text?: string; limit?: number } = {}) =>
  suggestMemos(stats(rows), { categoryId: 'food', amount: 0, text: '', ...opts });

describe('memoKey', () => {
  it('글자를 조합하는 도중의 끝 자음도 앞부분으로 읽힌다', () => {
    expect(memoKey('롯데리아').startsWith(memoKey('롯ㄷ'))).toBe(true);
    expect(memoKey('롯데리아').startsWith(memoKey('롯데ㄹ'))).toBe(true);
    expect(memoKey('롯데리아').startsWith(memoKey('롯데ㅁ'))).toBe(false);
  });

  it('영문은 대소문자를 가리지 않고, 앞뒤 공백은 뗀다', () => {
    expect(memoKey('  GS25 ')).toBe('gs25');
  });

  /* 글자를 조합하는 중에는 칸의 내용이 완성되기 전 모양이다. 겹받침·겹모음은 그 중간
     모양("달", "호")이 최종 글자("닭", "화")의 앞부분이 아니어서, QA가 이 순간에 칩이
     한 번 사라지는 것을 찾았다. 키보드가 실제로 내보내는 순서대로 모두 본다. */
  describe('조합하는 도중의 모양이 최종 글자의 앞부분이다', () => {
    const typing: Array<[string, string[]]> = [
      ['닭가슴살', ['ㄷ', '다', '달', '닭', '닭ㄱ', '닭가']],
      ['화장품', ['ㅎ', '호', '화', '화ㅈ', '화장']],
      ['과자', ['ㄱ', '고', '과', '과ㅈ']],
      ['읽을책', ['ㅇ', '이', '일', '읽', '읽ㅇ']],
      ['값비싼', ['ㄱ', '가', '갑', '값', '값ㅂ']],
      ['왜관', ['ㅇ', '오', '왜', '왜ㄱ']], // 왜(ㅙ)는 ㅗ 다음에 ㅐ를 쳐서 만든다 — '와'를 거치지 않는다
      ['외식비', ['ㅇ', '오', '외', '외ㅅ']],
      ['의류정리', ['ㅇ', '으', '의', '의ㄹ']],
      ['롯데리아', ['ㄹ', '로', '롯', '롯ㄷ', '롯데', '롯데ㄹ', '롯데리', '롯데리ㅇ']],
      ['앉아', ['ㅇ', '아', '안', '앉']],
    ];
    for (const [memo, steps] of typing) {
      it(memo, () => {
        for (const s of steps) {
          expect(memoKey(memo).startsWith(memoKey(s)), `"${s}" → "${memo}"`).toBe(true);
        }
      });
    }

    /* 받침이 다음 글자의 첫 자음으로 넘어가는 순간. "롯"을 치다가 "로시"가 된다. */
    it('받침과 다음 글자의 첫 자음을 같은 자모로 본다', () => {
      expect(memoKey('로시').startsWith(memoKey('롯'))).toBe(true);
    });

    it('앞부분이 아닌 것은 여전히 거른다', () => {
      expect(memoKey('닭가슴살').startsWith(memoKey('닥'))).toBe(false);
      expect(memoKey('화장품').startsWith(memoKey('후'))).toBe(false);
      expect(memoKey('롯데리아').startsWith(memoKey('롯데ㅁ'))).toBe(false);
    });
  });
});

describe('buildMemoStats', () => {
  it('메모가 없거나 공백뿐인 기록은 건너뛴다', () => {
    expect(stats([row('', 'food', 1000, '2026-10-01'), row('   ', 'food', 1000, '2026-10-01'), { categoryId: 'food', amount: 1, date: '2026-10-01' }])).toEqual([]);
  });

  it('같은 카테고리의 같은 메모는 하나로 모은다', () => {
    const out = stats([row('롯데리아', 'food', 5000, '2026-10-01'), row('롯데리아 ', 'food', 6000, '2026-10-02')]);
    expect(out).toHaveLength(1);
    expect(out[0].memo).toBe('롯데리아');
  });

  /* "GS25"와 "gs25"를 칩 두 개로 따로 보여 주면 같은 가게가 두 칸을 차지하고 어느 쪽이
     맞는지 고민하게 된다. 같은 카테고리에서는 한 후보로 모으고, 보여줄 표기는 가장
     최근에 쓴 것으로 한다. */
  it('대소문자만 다른 메모는 한 후보로 모으고 가장 최근 표기를 쓴다', () => {
    const out = stats([
      row('GS25', 'food', 3000, '2026-09-01'),
      row('gs25', 'food', 3000, '2026-10-01'),
      row('GS25', 'food', 3000, '2026-08-01'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].memo).toBe('gs25');
    expect(out[0].amounts).toHaveLength(3);
  });

  it('같은 날 표기가 갈리면 어느 순서로 들어와도 같은 표기를 쓴다', () => {
    const a = row('GS25', 'food', 1, '2026-10-01');
    const b = row('gs25', 'food', 1, '2026-10-01');
    expect(stats([a, b])[0].memo).toBe(stats([b, a])[0].memo);
  });

  it('카테고리가 다르면 따로 센다', () => {
    expect(stats([row('롯데', 'food', 1, '2026-10-01'), row('롯데', 'shop', 1, '2026-10-01')])).toHaveLength(2);
  });

  /* 6개월 할부는 같은 메모의 행이 여섯 개다. 그대로 세면 한 번 산 것이 여섯 번 쓴 것처럼
     점수를 차지한다. */
  it('할부로 묶인 행은 한 번으로 센다', () => {
    const inst = (n: number) =>
      row('노트북', 'shop', 100_000, `2026-0${n}-01`, { installmentId: 'g1' });
    const grouped = stats([inst(1), inst(2), inst(3)]);
    const once = stats([row('노트북', 'shop', 100_000, '2026-01-01')]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].score).toBeCloseTo(once[0].score, 10);
    expect(grouped[0].amounts).toHaveLength(1);
  });

  it('할부 묶음은 어느 순서로 들어와도 같은 결과다', () => {
    const a = row('노트북', 'shop', 300_000, '2026-01-01', { installmentId: 'g1' });
    const b = row('노트북', 'shop', 300_000, '2026-02-01', { installmentId: 'g1' });
    expect(stats([a, b])).toEqual(stats([b, a]));
  });

  it('금액은 최근 것부터 다섯 개만 남긴다', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row('커피', 'food', 1000 + i, `2026-10-0${i + 1}`));
    expect(stats(rows)[0].amounts).toEqual([1007, 1006, 1005, 1004, 1003]);
  });
});

describe('suggestMemos', () => {
  const R = [
    row('롯데리아', 'food', 6000, '2026-10-01'),
    row('스타벅스', 'food', 5500, '2026-10-02'),
    row('김밥천국', 'food', 7000, '2026-10-03'),
    row('롯데마트', 'shop', 40000, '2026-10-04'),
  ];

  describe('글자를 치지 않았을 때', () => {
    it('이 카테고리에서 쓴 메모만 보인다', () => {
      expect(ask(R).sort()).toEqual(['김밥천국', '롯데리아', '스타벅스'].sort());
      expect(ask(R)).not.toContain('롯데마트');
    });

    it('기록이 없으면 빈 목록이다', () => {
      expect(ask([])).toEqual([]);
    });
  });

  describe('글자를 쳤을 때', () => {
    it('그 글자로 시작하는 것만 남긴다', () => {
      expect(ask(R, { text: '롯' })).toEqual(['롯데리아', '롯데마트']);
      expect(ask(R, { text: '스' })).toEqual(['스타벅스']);
    });

    it('중간에 들어 있는 글자로는 찾지 않는다', () => {
      expect(ask(R, { text: '리아' })).toEqual([]);
    });

    it('다른 카테고리의 메모는 같은 카테고리 것 뒤에 온다', () => {
      expect(ask(R, { text: '롯' })).toEqual(['롯데리아', '롯데마트']);
      expect(ask(R, { text: '롯', categoryId: 'shop' })).toEqual(['롯데마트', '롯데리아']);
    });

    it('이미 칸에 그대로 적힌 메모는 후보에서 뺀다', () => {
      expect(ask(R, { text: '롯데리아' })).toEqual([]);
    });

    it('그 메모를 더 길게 쓴 것은 남는다', () => {
      const rows = [...R, row('롯데리아 불고기버거', 'food', 7000, '2026-10-05')];
      expect(ask(rows, { text: '롯데리아' })).toEqual(['롯데리아 불고기버거']);
    });

    it('조합 중인 끝 자음이 있어도 앞글자가 맞으면 남는다', () => {
      expect(ask(R, { text: '롯ㄷ' })).toEqual(['롯데리아', '롯데마트']);
    });

    it('겹받침·겹모음을 치는 도중에도 칩이 남는다', () => {
      const rows = [row('닭가슴살', 'food', 9000, '2026-10-01'), row('화장품', 'food', 9000, '2026-10-01')];
      expect(ask(rows, { text: '달' })).toEqual(['닭가슴살']);
      expect(ask(rows, { text: '호' })).toEqual(['화장품']);
    });

    it('철자만 다른 메모는 그대로 친 것도 후보에서 뺀다', () => {
      const rows = [row('GS25', 'food', 3000, '2026-10-01'), row('gs25', 'food', 3000, '2026-10-02')];
      expect(ask(rows, { text: 'gs25' })).toEqual([]);
      expect(ask(rows, { text: 'GS' })).toEqual(['gs25']);
    });

    it('앞뒤 공백과 대소문자는 가리지 않는다', () => {
      const rows = [row('GS25', 'food', 3000, '2026-10-01')];
      expect(ask(rows, { text: ' gs' })).toEqual(['GS25']);
    });
  });

  describe('순서', () => {
    /* 금액이 비슷한 것이 위다. 같은 카테고리라도 점수가 낮은 쪽이 먼저 올라온다. */
    it('금액이 비슷한 것을 위로 올린다', () => {
      const rows = [
        row('커피빈', 'food', 5000, '2026-10-09'),
        row('커피빈', 'food', 5000, '2026-10-08'),
        row('커피숍', 'food', 12000, '2026-01-01'),
      ];
      expect(ask(rows, { text: '커피' })).toEqual(['커피빈', '커피숍']);
      expect(ask(rows, { text: '커피', amount: 12500 })).toEqual(['커피숍', '커피빈']);
    });

    it('비슷하다는 건 지난 금액의 ±15%다', () => {
      const rows = [row('A', 'food', 10000, '2026-09-01'), row('B', 'food', 99999, '2026-10-09')];
      // B가 더 최근이지만 11,500은 A(10,000)의 +15% 안이라 A가 위.
      expect(ask(rows, { amount: 11500 })).toEqual(['A', 'B']);
      // 11,501은 벗어난다 → 최근 쓴 B가 위.
      expect(ask(rows, { amount: 11501 })).toEqual(['B', 'A']);
      // 8,500은 −15% 경계.
      expect(ask(rows, { amount: 8500 })).toEqual(['A', 'B']);
    });

    it('금액을 아직 안 쳤으면 금액으로는 가르지 않는다', () => {
      const rows = [row('A', 'food', 10000, '2026-09-01'), row('B', 'food', 99999, '2026-10-09')];
      expect(ask(rows, { amount: 0 })).toEqual(['B', 'A']);
    });

    /* 금액이 비슷한 다른 카테고리 것이 같은 카테고리 것보다 위로 올라오면 안 된다. */
    it('같은 카테고리가 금액이 비슷한 다른 카테고리보다 앞이다', () => {
      const rows = [
        row('롯데리아', 'food', 20000, '2026-09-01'),
        row('롯데마트', 'shop', 6000, '2026-10-09'),
      ];
      expect(ask(rows, { text: '롯', amount: 6000 })).toEqual(['롯데리아', '롯데마트']);
    });

    it('자주 쓴 것이 위다', () => {
      const rows = [
        row('A', 'food', 1000, '2026-10-01'),
        row('B', 'food', 1000, '2026-10-01'),
        row('B', 'food', 1000, '2026-09-30'),
      ];
      expect(ask(rows)).toEqual(['B', 'A']);
    });

    /* 몇 년 전에 매일 가던 곳이 지금 가는 곳을 밀어내면 안 된다. */
    it('예전에 많이 쓴 것보다 요즘 쓴 것이 위일 수 있다', () => {
      const old = Array.from({ length: 5 }, (_, i) => row('옛날식당', 'food', 8000, `2021-03-0${i + 1}`));
      const recent = [row('새식당', 'food', 8000, '2026-10-09')];
      expect(ask([...old, ...recent])).toEqual(['새식당', '옛날식당']);
    });

    it('점수가 같으면 가나다순이라 매번 같은 순서다', () => {
      const rows = [row('나', 'food', 1000, '2026-10-01'), row('가', 'food', 1000, '2026-10-01')];
      expect(ask(rows)).toEqual(['가', '나']);
      expect(ask([...rows].reverse())).toEqual(['가', '나']);
    });
  });

  describe('개수와 중복', () => {
    it('최대 8개까지만 준다', () => {
      const rows = Array.from({ length: 12 }, (_, i) => row(`가게${i}`, 'food', 1000, '2026-10-01'));
      expect(ask(rows)).toHaveLength(8);
    });

    it('개수를 정할 수 있다', () => {
      const rows = Array.from({ length: 12 }, (_, i) => row(`가게${i}`, 'food', 1000, '2026-10-01'));
      expect(ask(rows, { limit: 3 })).toHaveLength(3);
    });

    it('여러 카테고리에 있는 같은 메모는 한 번만 보인다', () => {
      const rows = [row('롯데', 'food', 1, '2026-10-01'), row('롯데', 'shop', 1, '2026-10-01')];
      expect(ask(rows, { text: '롯' })).toEqual(['롯데']);
    });

    it('다른 카테고리에 철자만 다르게 있어도 한 번만 보인다', () => {
      const rows = [row('GS25', 'food', 1, '2026-10-01'), row('gs25', 'daily', 1, '2026-10-02')];
      expect(ask(rows, { text: 'g' })).toEqual(['GS25']);
    });
  });
});
