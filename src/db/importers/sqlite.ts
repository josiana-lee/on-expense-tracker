import type { Database, SqlJsStatic } from 'sql.js';

/** sql.js 자체를 불러오지 못했다. 파일 탓이 아니다. */
export class SqliteLoadError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('SQLite를 읽는 도구를 불러오지 못했어', options);
    this.name = 'SqliteLoadError';
  }
}

let loading: Promise<SqlJsStatic> | null = null;

/** sql.js는 SQLite를 WebAssembly로 컴파일한 것이라 파일 하나를 읽자고 650KB가
 *  넘는 코드를 싣는다. 그래서 **처음 부를 때만** 내려받는다 — 동적 import라
 *  앱 시작 번들에는 들어가지 않고, SQLite 파일을 가져오는 사람에게만 값이
 *  청구된다. 대부분은 평생 한 번도 부르지 않는다.
 *
 *  한 번 불러온 것은 쥐고 있는다. 파일을 잘못 골라 두 번째로 열 때마다 wasm을
 *  다시 초기화할 이유가 없다. 실패하면 비워서 다음 시도가 다시 불러오게 한다 —
 *  실패한 약속을 쥐고 있으면 앱을 껐다 켜기 전까지 계속 실패한다.
 *
 *  wasm 파일 위치는 `?url`로 번들러에게 맡긴다. 직접 경로를 적으면 개발 서버와
 *  패키징된 앱에서 위치가 달라서 한쪽에서만 열린다. */
function load(): Promise<SqlJsStatic> {
  loading ??= (async () => {
    const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
      import('sql.js'),
      import('sql.js/dist/sql-wasm.wasm?url'),
    ]);
    return initSqlJs({ locateFile: () => wasmUrl });
  })().catch((cause: unknown) => {
    loading = null;
    throw new SqliteLoadError({ cause });
  });
  return loading;
}

/** SQLite 파일을 메모리에서 연다.
 *
 *  도구를 못 불러온 것(SqliteLoadError)과 파일이 열리지 않는 것(그 밖의 오류)을
 *  가른다. 둘 다 "파일이 깨졌을 수 있어"로 말하면, 오프라인이 아닌데도 멀쩡한
 *  파일을 탓하게 된다. */
export async function openSqlite(bytes: Uint8Array): Promise<Database> {
  const SQL = await load();
  return new SQL.Database(bytes);
}
