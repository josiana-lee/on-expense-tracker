import type { CategoryRecord, DateStr, ID, PaymentMethodRecord } from '../types';
import { groupInstallments, type GroupedRow } from './group';
import type { ImportParse, ImportRow } from './types';

/** 쓰려는 결제수단: 이미 있는 것이거나, 만들어야 하는 것. */
export type PaymentTarget = { id: ID } | { create: { name: string; kind: ImportRow['paymentKind'] } };

export type ImportPlan = {
  source: string;
  rows: GroupedRow[];
  /** 저절로 짝지어진 것. 원본 분류명 → 우리 카테고리 id. */
  matched: Map<string, ID>;
  /** 사용자가 골라야 하는 것. 많이 쓴 순서. */
  unmatched: { name: string; count: number }[];
  payments: Map<string, PaymentTarget>;
  newPayments: { name: string; kind: ImportRow['paymentKind'] }[];

  count: number;
  skipped: number;
  from: DateStr | null;
  to: DateStr | null;
  /** 지출 합계. 수입은 빼고 센다 — sumExpenses와 같은 규칙이라, 가져온 뒤
   *  달력에 뜨는 숫자와 미리보기가 어긋나지 않는다. */
  spend: number;
  incomeCount: number;
  installmentGroups: number;
};

/** 비교할 때만 쓰는 모양으로 깎는다.
 *
 *  편한가계부는 분류명 앞에 이모지를 붙인다("🍜 식비"). 글자 그대로 비교하면
 *  스물세 개가 전부 안 맞아서 사용자가 하나하나 손으로 짝지어야 한다. 이모지와
 *  공백만 떼면 대부분 그냥 맞는다 — 가계부들이 쓰는 분류 이름이 원래 거기서
 *  거기다. */
function key(name: string): string {
  return name
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Component}]/gu, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** 읽은 행들을 우리 카테고리·결제수단에 비춰보고, 무엇이 저절로 맞고 무엇을
 *  물어봐야 하는지 정리한다. 아직 아무것도 쓰지 않는다 — 이 결과가 그대로
 *  미리보기 화면이 된다. */
export function planImport(
  parse: ImportParse,
  categories: CategoryRecord[],
  payments: PaymentMethodRecord[],
): ImportPlan {
  const rows = groupInstallments(parse.rows);

  /* 보관·삭제된 것에는 짝짓지 않는다. 지워진 카테고리에 새 기록을 붙이면
     달력에 이름 없는 줄이 생긴다. */
  const catByKey = new Map<string, ID>();
  for (const c of categories) {
    if (c.deprecated) continue;
    const k = key(c.name);
    if (!catByKey.has(k)) catByKey.set(k, c.id);
  }
  const payByKey = new Map<string, ID>();
  for (const p of payments) {
    if (p.archived) continue;
    const k = key(p.name);
    if (!payByKey.has(k)) payByKey.set(k, p.id);
  }

  const matched = new Map<string, ID>();
  const missing = new Map<string, number>();
  const paymentTargets = new Map<string, PaymentTarget>();
  const newPayments: ImportPlan['newPayments'] = [];

  for (const r of rows) {
    if (!matched.has(r.categoryName)) {
      const id = catByKey.get(key(r.categoryName));
      if (id) matched.set(r.categoryName, id);
    }
    if (!matched.has(r.categoryName)) {
      missing.set(r.categoryName, (missing.get(r.categoryName) ?? 0) + 1);
    }

    if (!paymentTargets.has(r.paymentName)) {
      const id = payByKey.get(key(r.paymentName));
      if (id) {
        paymentTargets.set(r.paymentName, { id });
      } else {
        /* 없는 카드는 묻지 않고 만든다. 이름과 종류가 파일에 적혀 있어
           추측할 것이 없고, 여기서 사용자를 세우면 카드 다섯 장에 다섯 번
           묻게 된다. 카테고리와 다른 점은 거기엔 고를 것이 있다는 것이다. */
        const create = { name: r.paymentName, kind: r.paymentKind };
        paymentTargets.set(r.paymentName, { create });
        newPayments.push(create);
      }
    }
  }

  const dates = rows.map((r) => r.date).sort();
  const groups = new Set(rows.map((r) => r.installmentId).filter(Boolean));

  return {
    source: parse.source,
    rows,
    matched,
    unmatched: [...missing.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    payments: paymentTargets,
    newPayments,
    count: rows.length,
    skipped: parse.skipped,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    spend: rows.reduce((sum, r) => (r.type === 'income' ? sum : sum + r.amount), 0),
    incomeCount: rows.filter((r) => r.type === 'income').length,
    installmentGroups: groups.size,
  };
}
