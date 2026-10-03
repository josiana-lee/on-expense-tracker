import type { Database } from 'sql.js';

/** SQLite 파일을 메모리에서 연다.
 *
 *  sql.js는 SQLite를 WebAssembly로 컴파일한 것이라 파일 하나를 읽자고 650KB가
 *  넘는 코드를 싣는다. 그래서 **이 함수가 불릴 때만** 내려받는다 — 동적 import라
 *  앱 시작 번들에는 들어가지 않고, SQLite 파일을 가져오는 사람에게만 값이
 *  청구된다. 대부분은 평생 한 번도 부르지 않는다.
 *
 *  wasm 파일 위치는 `?url`로 번들러에게 맡긴다. 직접 경로를 적으면 개발 서버와
 *  패키징된 앱에서 위치가 달라서 한쪽에서만 열린다. */
export async function openSqlite(bytes: Uint8Array): Promise<Database> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  return new SQL.Database(bytes);
}
