import { Sheet } from '../../components/Sheet';
import { keepRestore, undoRestore } from '../../db/restore';
import type { RestoreCopy } from '../../db/restoreCopy';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import styles from './ImportSheet.module.css';

type Props = {
  copy: RestoreCopy;
  /** 방금 복원한 직후인지. 문구만 달라진다. */
  fresh: boolean;
  /** 고르지 않고 닫는 길. 되돌리기 줄은 설정에 남는다. */
  onClose: () => void;
  onDone: (message: string) => void;
};

/** 복원한 결과를 두고 갈지, 복원 전으로 되돌릴지 고르는 화면.
 *
 *  복원은 전부 덮어써서 "이 파일이 아니었네"가 되면 지금 데이터가 이미 없다.
 *  그래서 복원하기 전 사본을 앱 안에 남겨두고, 복원한 직후 이 화면이 뜬다.
 *  가져오기 되돌리기와 같은 모양으로 짰다 — 닫아도 설정에 줄이 남는 것까지. */
export function RestoreUndoSheet({ copy, fresh, onClose, onDone }: Props) {
  const { busy, guard } = useGuardedAction();
  const when = new Date(copy.takenAt).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const keep = () => {
    guard(async () => {
      await keepRestore();
      onClose();
    });
  };

  const undo = () => {
    guard(async () => {
      try {
        const rows = await undoRestore();
        onDone(rows === null ? '돌아갈 사본이 없어' : '복원하기 전으로 되돌렸어');
        onClose();
      } catch {
        onDone('되돌리지 못했어. 다시 시도해줘');
      }
    });
  };

  return (
    <Sheet label="복원 결과" onClose={onClose}>
      <div className={styles.title}>{fresh ? '복원했어!' : '복원 전으로 되돌리기'}</div>
      <div className={styles.hint}>
        {fresh
          ? '살펴보고, 마음에 안 들면 복원하기 전으로 되돌릴 수 있어.'
          : `${when}에 복원하기 전의 지출 ${copy.expenses.toLocaleString()}건이 앱 안에 있어.`}
      </div>

      <div className={styles.warnBox}>
        되돌리면 지금 데이터가 사라지고 복원하기 전 상태로 돌아가. 복원한 뒤에 적은 기록도
        같이 사라져. 이 사본은 앱 안에만 있어서, 앱을 지우면 같이 사라져.
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={keep} disabled={busy}>
          이대로 쓸게
        </button>
        <button
          type="button"
          className={`${styles.confirm} ${styles.danger}`}
          onClick={undo}
          disabled={busy}
        >
          되돌리기
        </button>
      </div>
    </Sheet>
  );
}
