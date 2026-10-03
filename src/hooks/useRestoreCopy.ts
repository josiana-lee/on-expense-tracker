import { useLiveQuery } from 'dexie-react-hooks';
import { readRestoreCopy, type RestoreCopy } from '../db/restoreCopy';

/** 복원 전으로 돌아갈 사본이 남아 있으면 그 정보, 없으면 null.
 *
 *  사본은 메인 DB와 다른 DB에 있지만 같은 Dexie라서 라이브 쿼리가 그대로 따라온다.
 *  "이대로 쓸게"나 "되돌리기"를 누르는 즉시 설정의 줄이 사라진다. */
export function useRestoreCopy(): RestoreCopy | null | undefined {
  return useLiveQuery(() => readRestoreCopy(), []);
}
