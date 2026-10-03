import type { DateStr } from '../types';
import { parseCsv } from './csv';
import type { ImportParse, ImportRow } from './types';

/* 화면에 보이는 이름은 형식만 말한다. 어느 앱에서 나온 파일인지 알아보긴
   하지만 그 앱 이름을 우리 화면에 박지는 않는다 — 남의 상표고, 그쪽이 이름을
   바꾸면 우리 문구가 틀린 말이 된다. 파일 이름(weple.ts)은 우리끼리 쓰는
   것이라 상관없다. */
const SOURCE = 'CSV';

/** 위플 CSV의 열 이름. 이 이름들이 **다 있으면** 위플로 친다.
 *
 *  순서나 개수로 보지 않는 이유: 앱이 업데이트되면서 열이 하나 붙는 건 흔한
 *  일이고, 그때마다 "못 읽는 파일"이 되면 쓸모가 없다. 이름이 다 있으면
 *  우리가 찾는 칸은 전부 찾을 수 있다. */
const REQUIRED = ['거래일', '수입/지출', '금액', '분류', '내역', '지불'] as const;

export function isWeple(header: string[]): boolean {
  const set = new Set(header.map((h) => h.trim()));
  return REQUIRED.every((h) => set.has(h));
}

/* 지불 열이 결제수단의 종류를 말해준다. 모르는 값은 신용카드로 친다 —
   가계부에서 가장 흔하고, 틀려도 사용자가 카드 관리에서 바꿀 수 있다. */
const KIND: Record<string, ImportRow['paymentKind']> = {
  현금: 'cash',
  체크카드: 'debit',
  카드: 'credit',
};

// "갤럭시 폴드8 급구매(14/14)" → 이름과 회차로 가른다.
const INSTALMENT = /^(.*?)\s*\((\d+)\/(\d+)\)\s*$/;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseWeple(text: string): ImportParse {
  const table = parseCsv(text);
  const header = table[0] ?? [];
  const at = new Map(header.map((h, i) => [h.trim(), i]));
  const get = (row: string[], name: string) => (row[at.get(name) ?? -1] ?? '').trim();

  const rows: ImportRow[] = [];
  let skipped = 0;

  for (const raw of table.slice(1)) {
    const date = get(raw, '거래일');
    // 쉼표만 떼면 된다. 위플은 통화 기호도 음수도 쓰지 않고, 수입/지출을
    // 별도 열로 구분한다.
    const amount = Number(get(raw, '금액').replace(/,/g, ''));

    if (!DATE.test(date) || !Number.isFinite(amount) || amount <= 0) {
      skipped++;
      continue;
    }

    const categoryName = get(raw, '분류');
    const sub = get(raw, '하위 분류');
    const memo = get(raw, '메모');
    let detail = get(raw, '내역');

    let installment: ImportRow['installment'];
    const m = INSTALMENT.exec(detail);
    if (m) {
      const [, base, no, months] = m;
      detail = base;
      /* 묶음 키에 카드까지 넣는다. 같은 이름으로 다른 카드에 건 할부는
         다른 결제다. 회차가 겹치는 경우(같은 이름·같은 카드로 두 번)는
         여기서 가르지 않고 묶는 쪽이 회차 순서로 끊는다. */
      installment = { groupKey: `${base}|${months}|${get(raw, '카드')}`, no: +no, months: +months };
    }

    /* 이름은 하나뿐인데 후보가 둘이다 — 하위 분류와 내역.
       하위 분류를 쓰는 사람에겐 그게 이름이고 내역은 설명이므로 메모로
       보낸다. 안 쓰는 사람(대부분)에겐 내역이 곧 이름이다. 어느 쪽이든
       버리는 값이 없다. */
    const label = sub || detail || categoryName;
    const extra = sub && detail ? detail : '';

    rows.push({
      date: date as DateStr,
      amount,
      type: get(raw, '수입/지출') === '수입' ? 'income' : 'expense',
      categoryName,
      label: label || undefined,
      memo: memo || extra || undefined,
      paymentName: get(raw, '카드') || get(raw, '지불'),
      paymentKind: KIND[get(raw, '지불')] ?? 'credit',
      installment,
    });
  }

  return { source: SOURCE, rows, skipped };
}
