import { db } from './db';
import { fmt } from './date';
import { listAllExpenses } from './expenses';
import { buildExpensesCsv, expenseToCsvRow } from '../lib/csv';
import { shareOrDownload } from '../lib/download';

/** Builds and hands off the full expense history as CSV. Returns the row
 *  count so the caller can tell the difference between "nothing to export"
 *  and a real export, without duplicating the query itself. */
export async function exportExpensesCsv(): Promise<number> {
  const [records, categories, paymentMethods] = await Promise.all([
    listAllExpenses(),
    db.categories.toArray(),
    db.paymentMethods.toArray(),
  ]);
  if (records.length === 0) return 0;

  const byId = new Map(categories.map((c) => [c.id, c]));
  const paymentById = new Map(paymentMethods.map((p) => [p.id, p]));

  // listAllExpenses is newest-first (what the search screen wants); a
  // spreadsheet reads better oldest-to-newest top-to-bottom.
  const rows = [...records].reverse().map((r) => expenseToCsvRow(r, byId, paymentById));
  const blob = buildExpensesCsv(rows);
  await shareOrDownload(blob, `가계부_${fmt(new Date())}.csv`);

  return records.length;
}
