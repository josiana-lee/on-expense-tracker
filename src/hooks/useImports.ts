import { useLiveQuery } from 'dexie-react-hooks';
import { listImports, type ImportEntry } from '../db/importers/undo';

/** 가져온 기록을 가져오기별로 묶은 목록, 새것부터. 로딩 중에는 undefined.
 *
 *  라이브 쿼리라서 되돌리면 그 줄이 바로 사라지고, 마지막 하나를 되돌리면 설정의 줄도
 *  같이 사라진다. 읽기에 실패하면 빈 목록이다 — 줄 하나가 안 보이는 편이 설정 화면
 *  전체가 오류 화면이 되는 것보다 낫다. */
export function useImports(): ImportEntry[] | undefined {
  return useLiveQuery(() => listImports().catch(() => []), []);
}
