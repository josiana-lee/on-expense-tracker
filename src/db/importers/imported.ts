import { db } from '../db';
import { now } from '../id';
import type { Epoch, ID } from '../types';

/** 가져온 파일의 기록. 같은 파일을 한 번 더 고르면 알아보려는 것이다.
 *
 *  가져오기는 더하기라서 같은 파일을 두 번 넣으면 전부 두 번 들어간다. 미리보기에
 *  "조심해줘"라고만 적어뒀는데, 파일을 다시 고르는 건 대개 "들어갔나?" 하고
 *  확인하려는 때라서 그 경고를 읽기 전에 버튼을 누른다. */
export type ImportedFile = {
  /** 파일 내용의 SHA-256. 이름이나 날짜가 아니라 내용이다 — 이름은 바뀌고(다운로드 (1)),
   *  내용이 같으면 같은 내보내기다. 지문을 못 만드는 환경에서는 없다. */
  hash?: string;
  /** 이 파일에서 들어간 기록들의 표시. 되돌리기와 같은 값이다. */
  importId: ID;
  at: Epoch;
  count: number;
  /** 이 가져오기가 새로 만든 결제수단. 되돌릴 때 쓰는 곳이 없으면 같이 치운다. */
  createdPaymentIds: ID[];
};

const KEY = 'importedFiles';

/** 오래된 것부터 버린다. 파일을 쉰 번 넘게 가져오는 일은 없다. */
const MAX_ENTRIES = 50;

/** 파일 내용의 지문. 만들 수 없는 환경이면 undefined — 그때는 알아보기를 건너뛰고
 *  가져오기는 그대로 된다. `crypto.subtle`은 보안 컨텍스트(https, localhost)에서만
 *  있는데 앱은 https://localhost에서 돈다. */
export async function fingerprintOf(bytes: ArrayBuffer): Promise<string | undefined> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return undefined;
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

/** 남겨둔 항목 전부. 복원한 백업에서 올 수 있는 값이라 모양을 믿지 않는다. */
export async function readImportedFiles(): Promise<ImportedFile[]> {
  const v = (await db.meta.get(KEY))?.value;
  if (!Array.isArray(v)) return [];
  return v
    .filter((e) => e && typeof e.importId === 'string')
    .map((e) => ({
      ...(typeof e.hash === 'string' ? { hash: e.hash } : {}),
      importId: e.importId as ID,
      at: Number(e.at) || 0,
      count: Number(e.count) || 0,
      createdPaymentIds: Array.isArray(e.createdPaymentIds) ? (e.createdPaymentIds as ID[]) : [],
    }));
}

/** 이 파일을 이미 가져왔고 **그 기록이 아직 남아 있으면** 그 정보, 아니면 null.
 *
 *  기록이 남아 있는지를 같이 본다. 되돌리기는 항목을 치우지만, 복원이나 직접 지우기로
 *  기록이 사라진 경우엔 항목만 남는다 — 그걸로 막으면 이미 없는 기록을 "이미 있다"고
 *  우기는 셈이다. */
export async function findImportedFile(hash: string): Promise<ImportedFile | null> {
  const same = (await readImportedFiles()).filter((e) => e.hash === hash).reverse();
  for (const e of same) {
    if (await db.expenses.filter((r) => r.importId === e.importId).first()) return e;
  }
  return null;
}

/** 가져오기와 **같은 트랜잭션 안에서** 부른다. 기록은 들어갔는데 파일 기록이 안
 *  남으면 같은 파일을 또 넣을 수 있다. */
export async function rememberImportedFile(entry: ImportedFile): Promise<void> {
  const next = [...(await readImportedFiles()).filter((e) => e.importId !== entry.importId), entry].slice(
    -MAX_ENTRIES,
  );
  await db.meta.put({ key: KEY, value: next, updatedAt: now() });
}

/** 가져오기를 되돌렸다. 그 파일은 다시 가져올 수 있어야 한다. */
export async function forgetImportedFile(importId: ID): Promise<void> {
  const all = await readImportedFiles();
  const next = all.filter((e) => e.importId !== importId);
  if (next.length === all.length) return;
  await db.meta.put({ key: KEY, value: next, updatedAt: now() });
}
