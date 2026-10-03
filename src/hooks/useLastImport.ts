import { useLiveQuery } from 'dexie-react-hooks';
import { readLastImport, type LastImport } from '../db/importers/undo';

/** 되돌릴 수 있는 가져오기가 남아 있으면 그 정보, 없으면 null.
 *
 *  라이브 쿼리라서 "이대로 쓸게"나 "되돌리기"를 누르는 즉시 설정의 줄이 사라진다.
 *  로딩 중에는 undefined가 나오는데 null과 같이 없는 것으로 읽으면 된다. */
export function useLastImport(): LastImport | null | undefined {
  return useLiveQuery(() => readLastImport(), []);
}
