import { useCallback, useMemo, useState } from 'react';

export type ExpenseRecord = {
  id: string;
  /** KRW, always a whole number. */
  amount: number;
  categoryId: string;
  sub: string | null;
  memo: string;
  paymentId: string;
  /** Epoch ms of the moment the record was made. */
  at: number;
};

export type NewExpense = Omit<ExpenseRecord, 'id'>;

function sameDay(a: number, b: Date): boolean {
  const d = new Date(a);
  return (
    d.getFullYear() === b.getFullYear() &&
    d.getMonth() === b.getMonth() &&
    d.getDate() === b.getDate()
  );
}

export function useExpenses(today: Date) {
  const [records, setRecords] = useState<ExpenseRecord[]>([]);

  const add = useCallback((input: NewExpense) => {
    setRecords((prev) => [{ ...input, id: crypto.randomUUID() }, ...prev]);
  }, []);

  const todayRecords = useMemo(
    () => records.filter((r) => sameDay(r.at, today)).sort((a, b) => b.at - a.at),
    [records, today],
  );

  const todayTotal = useMemo(
    () => todayRecords.reduce((sum, r) => sum + r.amount, 0),
    [todayRecords],
  );

  return { records, todayRecords, todayTotal, add };
}
