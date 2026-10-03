import { parseCsv } from './csv';
import { isMmbak, parseMmbak } from './mmbak';
import { openSqlite } from './sqlite';
import { isWeple, parseWeple } from './weple';
import type { ImportParse } from './types';

/** SQLite 파일은 반드시 이 열여섯 바이트로 시작한다. 확장자는 앱마다 제멋대로고
 *  — 같은 데이터베이스를 `.mmbak`으로도 `.sqlite`로도 내려주는 앱이 있다 —
 *  이름이 아니라 내용으로 가른다. */
const SQLITE_MAGIC = 'SQLite format 3\0';

export class UnknownFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownFileError';
  }
}

export type Detected =
  /** 우리 백업. 복원 경로로 보낸다 — 덮어쓰기다. */
  | { kind: 'backup'; text: string }
  /** 다른 가계부. 더하기다. */
  | { kind: 'import'; parse: ImportParse };

/** 사용자가 고른 파일 하나가 무엇인지 알아본다.
 *
 *  입구를 하나로 둔 이유: 나누면 사용자가 "내 파일은 어느 쪽이지"를 먼저 알아야
 *  한다. 앱이 알아보는 편이 맞고, 알아본 다음 **무슨 일이 벌어질지 미리보기에서
 *  말해준다** — 덮어쓰기와 더하기는 되돌릴 수 없는 차이라, 고르기 전이 아니라
 *  누르기 전에 보여야 한다. */
export async function detectFile(file: File): Promise<Detected> {
  const head = await file.slice(0, SQLITE_MAGIC.length).text();
  if (head === SQLITE_MAGIC) return detectSqlite(file);

  const text = await file.text();
  const trimmed = text.trimStart();

  // 우리 백업은 JSON이다. 내용으로 보는 건 같은 이유 — 확장자는 바뀔 수 있다.
  if (trimmed.startsWith('{')) return { kind: 'backup', text };

  const header = parseCsv(text)[0] ?? [];
  if (isWeple(header)) return { kind: 'import', parse: parseWeple(text) };

  throw new UnknownFileError(
    '무슨 파일인지 모르겠어. 지금은 백업 파일, CSV, SQLite 파일을 읽을 수 있어',
  );
}

/* SQLite는 파일이 아니라 데이터베이스라서 열어봐야 무슨 앱의 것인지 안다. 열고
   나면 닫는다 — 읽은 결과는 이미 평범한 객체로 꺼냈고, 메모리에 올려둔 파일
   사본은 이 함수 밖에서 쓸 데가 없다. */
async function detectSqlite(file: File): Promise<Detected> {
  let db;
  try {
    db = await openSqlite(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new UnknownFileError('SQLite 파일을 열지 못했어. 파일이 깨졌을 수 있어');
  }
  try {
    if (!isMmbak(db)) {
      throw new UnknownFileError('이 SQLite 파일은 읽을 수 없는 형식이야');
    }
    return { kind: 'import', parse: parseMmbak(db) };
  } finally {
    db.close();
  }
}
