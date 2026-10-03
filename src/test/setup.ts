// Gives Dexie a real IndexedDB implementation. docs/data-model.md §11 is
// explicit that migration and constraint bugs only show up against a real
// Dexie instance, so nothing here is mocked.
import 'fake-indexeddb/auto';

import { beforeEach } from 'vitest';

import { db } from '../db/db';
import { copyDb } from '../db/restoreCopy';

// Every test starts from an empty database with the schema freshly applied,
// so one test's seeded rows can't leak into the next.
beforeEach(async () => {
  if (db.isOpen()) db.close();
  await db.delete();
  await db.open();

  // 복원 전 사본은 메인 DB와 따로 있어서 같이 비운다. 안 비우면 앞 테스트의
  // 사본이 남아 "사본이 있으면 그대로 둔다" 규칙 때문에 다음 테스트를 오염시킨다.
  if (copyDb.isOpen()) copyDb.close();
  await copyDb.delete();
  await copyDb.open();
});
