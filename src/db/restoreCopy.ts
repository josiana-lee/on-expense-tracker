import Dexie, { type EntityTable } from 'dexie';
import { buildBackupFile } from './backup';
import { now } from './id';
import type { Epoch } from './types';

/** 복원하기 직전 데이터의 사본을 앱 안에 한 부 둔다.
 *
 *  복원은 전부 덮어쓴다. 예전에는 그 전에 공유창을 띄워 파일로 저장하게 했는데,
 *  그 창을 닫으면 복원이 멈췄고 — 처음 보는 사람은 "복원한다더니 왜 공유?" 하고
 *  닫기 쉬웠다 — 설정에 "중간에 뜨는 창을 취소하면 멈춰"라고 미리 적어둘 정도였다.
 *  앱 안에 사본을 남기면 그 창이 필요 없고, 마음에 안 들면 한 번에 돌아간다.
 *
 *  **메인 DB와 따로 둔 DB다.** 같은 DB의 표로 두면 백업 대상에 들어가서 백업할
 *  때마다 이전 사본이 같이 실려 나가고(사본 안에 사본이 쌓인다), 표를 더하려면
 *  이미 설치된 기기의 DB 버전도 올려야 한다. 따로 두면 둘 다 필요 없다.
 *
 *  **앱을 지우면 이 사본도 같이 사라진다.** 실수(잘못된 파일로 복원)를 되돌리는
 *  용도이지 기기를 잃어버렸을 때의 백업이 아니다. 그건 파일로 내보낸 백업의 몫이다. */
class CopyDb extends Dexie {
  copies!: EntityTable<CopyRecord, 'id'>;

  constructor() {
    super('on-expense-tracker-copy');
    this.version(1).stores({ copies: 'id' });
  }
}

type CopyRecord = {
  id: typeof SLOT;
  takenAt: Epoch;
  /** 사본에 든 지출 건수. 화면에 "이 상태로 돌아가"를 말할 때 쓴다. */
  expenses: number;
  /** BackupFile을 문자열로. 되돌릴 때 복원과 같은 검증(parseBackupFile)을 거치므로
   *  파일처럼 다루는 편이 낫다. */
  json: string;
};

/** 한 자리뿐이다. 목록이 아니라 "복원 전으로" 한 번이다. */
const SLOT = 'preRestore';

export const copyDb = new CopyDb();

export type RestoreCopy = { takenAt: Epoch; expenses: number };

export async function readRestoreCopy(): Promise<RestoreCopy | null> {
  const row = await copyDb.copies.get(SLOT);
  return row ? { takenAt: row.takenAt, expenses: row.expenses } : null;
}

/** 지금 데이터를 사본으로 남긴다. 이미 사본이 있으면 **그대로 둔다.**
 *
 *  틀린 파일로 한 번 복원하고 곧바로 맞는 파일로 또 복원하는 건 자연스러운
 *  순서다. 두 번째 사본이 첫 번째를 덮으면 "복원 전"이 틀린 파일의 내용이 되어,
 *  정작 지키려던 원래 데이터가 영영 사라진다. 사본은 사용자가 "이대로 쓸게"나
 *  "되돌리기"를 고를 때까지 맨 처음 것을 지킨다.
 *
 *  **새로 만들었으면 true, 이미 있어서 그대로 뒀으면 false.** 복원이 중간에 실패했을
 *  때 방금 만든 사본만 치우려면 누가 만든 것인지 알아야 한다. */
export async function saveRestoreCopy(): Promise<boolean> {
  if (await copyDb.copies.get(SLOT)) return false;

  const file = await buildBackupFile();
  await copyDb.copies.put({
    id: SLOT,
    takenAt: now(),
    expenses: file.counts.expenses,
    json: JSON.stringify(file),
  });
  return true;
}

/** 되돌릴 때 복원 경로에 넘길 파일. 없으면 null. */
export async function readRestoreCopyFile(): Promise<File | null> {
  const row = await copyDb.copies.get(SLOT);
  return row ? new File([row.json], 'restore-copy.json', { type: 'application/json' }) : null;
}

export async function discardRestoreCopy(): Promise<void> {
  await copyDb.copies.delete(SLOT);
}
