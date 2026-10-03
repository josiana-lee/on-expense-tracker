import { parseCsv } from './csv';
import { fingerprintOf } from './imported';
import { isMmbak, parseMmbak } from './mmbak';
import { openSqlite, SqliteLoadError } from './sqlite';
import { isWeple, parseWeple } from './weple';
import type { ImportParse } from './types';

/** SQLite 파일은 반드시 이 열여섯 바이트로 시작한다. 확장자는 앱마다 제멋대로고
 *  — 같은 데이터베이스를 `.mmbak`으로도 `.sqlite`로도 내려주는 앱이 있다 —
 *  이름이 아니라 내용으로 가른다. */
const SQLITE_MAGIC = 'SQLite format 3\0';

/** 이 크기를 넘으면 읽어보지 않고 돌려보낸다. 50MB.
 *
 *  파일 선택기는 안드로이드에서 아무 파일이나 고르게 둔다. 동영상 하나면 통째로
 *  문자열이나 메모리로 올리다가 WebView가 죽고, 사용자 눈에는 앱이 그냥 꺼진 것이다
 *  (100MB로 시험했더니 알아보기까지 17초 걸렸다). 복원의 한도와 같다. 9년치 기록이
 *  CSV로 1MB 남짓이라 가계부 파일로는 한참 넉넉하다. */
const MAX_BYTES = 50 * 1024 * 1024;

/** 형식을 가르는 데는 파일 앞부분이면 된다. 헤더 줄 하나가 들어갈 만큼. */
const SNIFF_BYTES = 4096;

/** 사용자에게 그대로 보여줄 문장을 가진 오류. */
export class DetectError extends Error {}

/** 읽을 수 있는 형식이 아니다. */
export class UnknownFileError extends DetectError {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownFileError';
  }
}

/** 형식은 맞는데 열지 못했다. */
export class UnreadableFileError extends DetectError {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableFileError';
  }
}

export type Detected =
  /** 우리 백업. 복원 경로로 보낸다 — 덮어쓰기다. 내용은 복원이 다시 읽는다. */
  | { kind: 'backup' }
  /** 다른 가계부. 더하기다. */
  | { kind: 'import'; parse: ImportParse };

/** 사용자가 고른 파일 하나가 무엇인지 알아본다.
 *
 *  입구를 하나로 둔 이유: 나누면 사용자가 "내 파일은 어느 쪽이지"를 먼저 알아야
 *  한다. 앱이 알아보는 편이 맞고, 알아본 다음 **무슨 일이 벌어질지 미리보기에서
 *  말해준다** — 덮어쓰기와 더하기는 되돌릴 수 없는 차이라, 고르기 전이 아니라
 *  누르기 전에 보여야 한다.
 *
 *  앞부분만 보고 가른다. 예전에는 파일 전체를 문자열로 읽고 CSV 전체를 파싱해서
 *  헤더 한 줄을 봤다 — 우리 백업이면 그 문자열을 복원이 또 읽어서 두 번 읽었다. */
export async function detectFile(file: File): Promise<Detected> {
  if (file.size === 0) throw new UnknownFileError('빈 파일이야');
  if (file.size > MAX_BYTES) {
    throw new UnknownFileError('이 파일은 가계부 파일치고 너무 커. 다른 파일인지 확인해줘');
  }

  const head = await file.slice(0, SNIFF_BYTES).text();
  if (head.slice(0, SQLITE_MAGIC.length) === SQLITE_MAGIC) return detectSqlite(file);

  // 우리 백업은 JSON이다. 내용으로 보는 건 같은 이유 — 확장자는 바뀔 수 있다.
  if (head.trimStart().startsWith('{')) return { kind: 'backup' };

  const firstLine = head.split(/\r?\n/, 1)[0] ?? '';
  if (isWeple(parseCsv(firstLine)[0] ?? [])) {
    // 한 번 읽은 바이트로 글자도 지문도 만든다.
    const bytes = await file.arrayBuffer();
    const parse = parseWeple(new TextDecoder().decode(bytes));
    return { kind: 'import', parse: { ...parse, fingerprint: await fingerprintOf(bytes) } };
  }

  throw new UnknownFileError(
    '무슨 파일인지 모르겠어. 지금은 백업 파일, CSV, SQLite 파일을 읽을 수 있어',
  );
}

/* SQLite는 파일이 아니라 데이터베이스라서 열어봐야 무슨 앱의 것인지 안다. 열고
   나면 닫는다 — 읽은 결과는 이미 평범한 객체로 꺼냈고, 메모리에 올려둔 파일
   사본은 이 함수 밖에서 쓸 데가 없다. */
async function detectSqlite(file: File): Promise<Detected> {
  let db;
  const bytes = await file.arrayBuffer();
  try {
    db = await openSqlite(new Uint8Array(bytes));
  } catch (err) {
    throw new UnreadableFileError(
      err instanceof SqliteLoadError
        ? 'SQLite를 읽을 준비를 못 했어. 다시 시도해줘'
        : 'SQLite 파일을 열지 못했어. 파일이 깨졌을 수 있어',
    );
  }
  try {
    if (!isMmbak(db)) {
      throw new UnknownFileError('이 SQLite 파일은 읽을 수 없는 형식이야');
    }
    return { kind: 'import', parse: { ...parseMmbak(db), fingerprint: await fingerprintOf(bytes) } };
  } finally {
    db.close();
  }
}
