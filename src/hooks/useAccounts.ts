import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export function useAccounts() {
  const accounts = useLiveQuery(
    () => db.accounts.filter((a) => !a.archived).sortBy('sortOrder'),
    [],
  );
  return { accounts: accounts ?? [], loading: accounts === undefined };
}
