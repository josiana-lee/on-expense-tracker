import { useLiveQuery } from 'dexie-react-hooks';
import { listAllExpenses } from '../db/expenses';

export function useAllExpenses() {
  const records = useLiveQuery(() => listAllExpenses(), []);
  return { records: records ?? [], loading: records === undefined };
}
