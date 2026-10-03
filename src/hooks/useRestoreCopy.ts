import { useLiveQuery } from 'dexie-react-hooks';
import { readRestoreCopy, type RestoreCopy } from '../db/restoreCopy';

/** 복원 전으로 돌아갈 사본이 남아 있으면 그 정보, 없으면 null.
 *
 *  사본은 메인 DB와 다른 DB에 있지만 같은 Dexie라서 라이브 쿼리가 그대로 따라온다.
 *  "이대로 쓸게"나 "되돌리기"를 누르는 즉시 설정의 줄이 사라진다. */
export function useRestoreCopy(): RestoreCopy | null | undefined {
  /* 사본 DB는 따로 열리는 데이터베이스라 메인 DB와 따로 실패할 수 있다(저장 공간이
     모자라거나 막혔을 때). useLiveQuery는 쿼리가 던지면 렌더 중에 다시 던져서,
     설정 화면 전체가 오류 화면으로 바뀐다. 줄 하나 안 보이는 것이 낫다. */
  return useLiveQuery(() => readRestoreCopy().catch(() => null), []);
}
