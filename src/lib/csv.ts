import type { CategoryRecord, ExpenseRecord, PaymentMethodRecord } from '../db/types';

const HEADERS = ['날짜', '시간', '구분', '금액', '카테고리', '세부항목', '결제수단', '메모'] as const;

/** Escapes one CSV field. Two things a naive `String(v)` misses:
 *
 *  - A value starting with =, +, -, @, tab, or CR is a formula to Excel/
 *    Sheets. A memo like "=HYPERLINK(...)" would execute if the exported
 *    file is ever opened by someone else — prefixing with `'` neutralises
 *    it while keeping the text visible.
 *  - Commas, quotes, and newlines need real CSV quoting, not just a comma
 *    replaced with something else. */
function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type CsvRow = {
  date: string;
  time: string;
  type: string;
  amount: number;
  category: string;
  sub: string;
  payment: string;
  memo: string;
};

export function expenseToCsvRow(
  r: ExpenseRecord,
  byId: Map<string, CategoryRecord>,
  paymentById: Map<string, PaymentMethodRecord>,
): CsvRow {
  return {
    date: r.date,
    time: r.time,
    type: r.type === 'income' ? '입금' : '지출',
    amount: r.amount,
    category: byId.get(r.categoryId)?.name ?? '',
    sub: r.subLabel ?? '',
    payment: paymentById.get(r.paymentMethodId)?.name ?? '',
    memo: r.memo ?? '',
  };
}

const BOM = '\uFEFF';

/** A UTF-8 BOM is required, not optional — without it, Windows Excel (still
 *  the default for most Korean users) reads the file as the system codepage
 *  and every Korean character turns to garbled text. Amounts are written as
 *  plain integers, not "12,345", so Excel imports them as numbers SUM() can
 *  add up rather than as text. */
export function buildExpensesCsv(rows: CsvRow[]): Blob {
  const body = rows
    .map((r) =>
      [r.date, r.time, r.type, r.amount, r.category, r.sub, r.payment, r.memo]
        .map(csvCell)
        .join(','),
    )
    .join('\r\n');
  const csv = `${HEADERS.join(',')}\r\n${body}`;
  return new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' });
}
