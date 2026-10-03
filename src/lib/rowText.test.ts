import { describe, expect, it } from 'vitest';

import type { ExpenseRecord } from '../db/types';
import { compactTitle, detailText, rowText } from './rowText';

const rec = (over: Partial<ExpenseRecord> = {}) =>
  ({
    id: 'e1',
    date: '2026-10-04',
    time: '00:48',
    amount: 12000,
    type: 'expense',
    categoryId: 'culture',
    paymentMethodId: 'card',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }) as ExpenseRecord;

describe('rowText', () => {
  describe('직접 입력한 기록', () => {
    /* 폰에서 본 그대로다. "영화"가 위에 뜨고 쓴 글이 아래로 밀려 있었다. */
    it('메모가 있으면 메모가 제목이고, 아래는 "카테고리 › 세부항목"이다', () => {
      const out = rowText(
        rec({ subLabel: '영화', memo: '치이카와 인어섬의 비밀' }),
        '문화생활',
        '삼성카드',
      );
      expect(out.title).toBe('치이카와 인어섬의 비밀');
      expect(detailText(out)).toBe('문화생활 › 영화 · 삼성카드');
    });

    /* 굵게 그릴 부분을 가르는 건 이 구조다. 카테고리만 굵고 세부항목은 보통이다. */
    it('카테고리와 세부항목은 한 덩어리로, 카테고리가 앞이다', () => {
      const out = rowText(rec({ subLabel: '영화', memo: '메모' }), '문화생활', '삼성카드');
      expect(out.detail[0]).toEqual({ kind: 'category', category: '문화생활', sub: '영화' });
    });

    it('세부항목 없이 메모만 있어도 메모가 제목이다', () => {
      const out = rowText(rec({ memo: '친구랑' }), '문화생활', '삼성카드');
      expect(out.title).toBe('친구랑');
      expect(detailText(out)).toBe('문화생활 · 삼성카드');
      expect(out.detail[0]).toEqual({ kind: 'category', category: '문화생활' });
    });

    /* 폰 스크린샷 그대로다. 식비 기록이 "점심"이라는 한 단어로 보였다. 세부항목은 카테고리의
       하위라서 윗줄은 카테고리여야 한다. */
    it('메모가 없으면 카테고리가 제목이고 세부항목은 아래 줄 맨 앞에 온다', () => {
      const out = rowText(rec({ categoryId: 'food', subLabel: '점심' }), '식비', '삼성카드');
      expect(out.title).toBe('식비');
      expect(detailText(out)).toBe('점심 · 삼성카드');
    });

    it('메모와 세부항목이 둘 다 있으면 제목은 메모, 아래는 카테고리 › 세부항목', () => {
      const out = rowText(rec({ categoryId: 'food', subLabel: '점심', memo: '추어탕' }), '식비', '삼성카드');
      expect(out.title).toBe('추어탕');
      expect(detailText(out)).toBe('식비 › 점심 · 삼성카드');
    });

    it('아무것도 없으면 카테고리가 제목이고 카테고리를 되풀이하지 않는다', () => {
      const out = rowText(rec(), '문화생활', '삼성카드');
      expect(out.title).toBe('문화생활');
      expect(detailText(out)).toBe('삼성카드');
    });

    it('할부 회차는 아래 줄 맨 앞에 둔다', () => {
      const out = rowText(
        rec({
          memo: '노트북',
          installmentId: 'g',
          installmentNo: 2,
          installmentMonths: 3,
          installmentTotal: 300000 as ExpenseRecord['amount'],
        }),
        '문화생활',
        '삼성카드',
      );
      expect(out.title).toBe('노트북');
      expect(detailText(out).startsWith('3개월 할부 2/3')).toBe(true);
    });
  });

  describe('가져온 기록', () => {
    /* 폰에서 "이게 맞다"고 하신 모양이다. 제목은 바꾸지 않는다. */
    it('내역이 제목이고 카테고리가 아래에 온다', () => {
      const out = rowText(
        rec({ importId: 'imp', subLabel: '퍼릿 자동화장실' }),
        '반려동물',
        '삼성카드',
      );
      expect(out.title).toBe('퍼릿 자동화장실');
      expect(detailText(out)).toBe('반려동물 · 삼성카드');
    });

    /* 위플 파일의 "메모" 칸은 부가 설명이다. 직접 입력과 같은 규칙을 쓰면 이 메모가 내역을
       밀어내고 제목이 된다. */
    it('원본의 메모가 있어도 내역이 제목이고, 메모는 아래에 보인다', () => {
      const out = rowText(
        rec({ importId: 'imp', subLabel: '퍼릿 자동화장실', memo: '선물용' }),
        '반려동물',
        '삼성카드',
      );
      expect(out.title).toBe('퍼릿 자동화장실');
      expect(detailText(out)).toBe('반려동물 · 선물용 · 삼성카드');
    });

    it('내역이 없으면 카테고리가 제목이다', () => {
      const out = rowText(rec({ importId: 'imp' }), '반려동물', '삼성카드');
      expect(out.title).toBe('반려동물');
      expect(detailText(out)).toBe('삼성카드');
    });
  });

  /* 입력한 값이 목록에서 사라지면 사용자는 "저장이 안 됐나?" 하고 의심한다. 어떤 조합으로
     입력해도 메모·세부항목·카테고리·결제수단이 제목이나 아래 줄 어디엔가는 보여야 한다.
     규칙을 손볼 때 값이 슬쩍 빠지는 걸 막는다. */
  describe('입력한 값은 어디엔가 반드시 보인다', () => {
    const memos = [undefined, '치이카와 인어섬의 비밀'];
    const subs = [undefined, '영화'];
    const imports = [undefined, 'imp'];

    for (const importId of imports) {
      for (const memo of memos) {
        for (const subLabel of subs) {
          const label = `${importId ? '가져온' : '직접'} 메모=${memo ? '있음' : '없음'} 세부항목=${subLabel ? '있음' : '없음'}`;
          it(label, () => {
            const out = rowText(rec({ importId, memo, subLabel }), '문화생활', '삼성카드');
            const shown = `${out.title} | ${detailText(out)}`;
            for (const value of [memo, subLabel, '문화생활', '삼성카드']) {
              if (value) expect(shown).toContain(value);
            }
          });
        }
      }
    }
  });

  /* 입력 화면 "오늘 기록"은 한 줄뿐이라 아래 줄이 없다. 메모가 없을 때 세부항목이 사라지면
     안 된다. */
  describe('compactTitle (한 줄짜리 목록)', () => {
    it('메모도 세부항목도 없으면 카테고리', () => {
      expect(compactTitle(rec(), '식비')).toBe('식비');
    });

    it('메모가 없고 세부항목이 있으면 "카테고리 › 세부항목"', () => {
      expect(compactTitle(rec({ subLabel: '점심' }), '식비')).toBe('식비 › 점심');
    });

    it('메모가 있으면 메모', () => {
      expect(compactTitle(rec({ subLabel: '점심', memo: '추어탕' }), '식비')).toBe('추어탕');
    });

    it('가져온 기록은 내역 그대로', () => {
      expect(compactTitle(rec({ importId: 'imp', subLabel: '퍼릿 자동화장실' }), '반려동물')).toBe(
        '퍼릿 자동화장실',
      );
    });
  });

  it('카테고리나 결제수단이 없어도 깨지지 않는다', () => {
    const out = rowText(rec({ memo: '메모' }), undefined, undefined);
    expect(out.title).toBe('메모');
    expect(out.detail).toEqual([]);
  });
});
