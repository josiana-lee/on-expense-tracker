import { parseCsv } from './csv';
import { isWeple, parseWeple } from './weple';
import type { ImportParse } from './types';

/** SQLite 파일은 반드시 이 열여섯 바이트로 시작한다. 확장자는 앱마다 제멋대로라
 *  — 편한가계부는 백업을 `.mmbak`으로, 메일로 보낼 땐 `.sqlite`로 준다 —
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
  if (head === SQLITE_MAGIC) {
    throw new UnknownFileError(
      '편한가계부 백업 파일이네. 아직 읽을 수 있는 준비가 안 됐어 — 다음 업데이트를 기다려줘',
    );
  }

  const text = await file.text();
  const trimmed = text.trimStart();

  // 우리 백업은 JSON이다. 내용으로 보는 건 같은 이유 — 확장자는 바뀔 수 있다.
  if (trimmed.startsWith('{')) return { kind: 'backup', text };

  const header = parseCsv(text)[0] ?? [];
  if (isWeple(header)) return { kind: 'import', parse: parseWeple(text) };

  throw new UnknownFileError(
    '어느 가계부 파일인지 모르겠어. 지금은 온:On 백업과 위플 가계부 CSV를 읽을 수 있어',
  );
}
