// Gives Dexie a real IndexedDB implementation. docs/data-model.md §11 is
// explicit that migration and constraint bugs only show up against a real
// Dexie instance, so nothing here is mocked.
import 'fake-indexeddb/auto';

import { beforeEach } from 'vitest';

import { db } from '../db/db';

// Every test starts from an empty database with the schema freshly applied,
// so one test's seeded rows can't leak into the next.
beforeEach(async () => {
  if (db.isOpen()) db.close();
  await db.delete();
  await db.open();
});
