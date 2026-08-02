import { db } from './db';
import { now } from './id';
import type { ID } from './types';

export async function setCategoryVisible(id: ID, visibleOnHome: boolean): Promise<void> {
  await db.categories.update(id, { visibleOnHome, updatedAt: now() });
}
