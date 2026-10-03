import { Sheet } from '../../components/Sheet';
import { keepImport, undoImport, type LastImport } from '../../db/importers/undo';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import styles from './ImportSheet.module.css';

type Props = {
  last: LastImport;
  /** 방금 가져온 직후인지. 문구만 달라진다. */
  fresh: boolean;
  /** 고르지 않고 닫는 길. 되돌리기 줄은 설정에 남는다. */
  onClose: () => void;
  onDone: (message: string) => void;
};

/** 가져온 기록을 두고 갈지 되돌릴지 고르는 화면.
 *
 *  가져오기는 더하기만 하므로 5천 건이 들어온 뒤에 "이게 아니었네"가 되면 손으로
 *  지울 수가 없다. 그래서 가져온 직후 이 화면이 뜨고, 고르지 않고 닫아도 설정에
 *  줄이 남는다 — 사용자가 마음을 바꾸는 건 결과를 달력에서 한참 살펴본 뒤일 수
 *  있어서, 이 시트가 열려 있는 동안만 되돌릴 수 있으면 부족하다. */
export function ImportUndoSheet({ last, fresh, onClose, onDone }: Props) {
  const { busy, guard } = useGuardedAction();
  const when = new Date(last.at).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const keep = () => {
    guard(async () => {
      try {
        await keepImport();
        onClose();
      } catch {
        // 지워지지 않았는데 닫으면 설정에 줄이 그대로 남아서 눌렀는데 안 된 것처럼 보인다.
        onDone('처리하지 못했어. 다시 시도해줘');
      }
    });
  };

  const undo = () => {
    guard(async () => {
      try {
        const out = await undoImport(last);
        onDone(
          out.removed === 0
            ? '지울 기록이 없었어. 이미 바뀐 것 같아'
            : `${out.removed.toLocaleString()}건을 되돌렸어`,
        );
        onClose();
      } catch {
        onDone('되돌리지 못했어. 다시 시도해줘');
      }
    });
  };

  return (
    <Sheet label="가져온 기록" onClose={onClose}>
      <div className={styles.title}>
        {fresh ? `${last.count.toLocaleString()}건을 가져왔어!` : '가져온 기록 되돌리기'}
      </div>
      <div className={styles.hint}>
        {fresh
          ? '달력에서 살펴보고, 마음에 안 들면 지금 되돌릴 수 있어.'
          : `${when}에 가져온 ${last.count.toLocaleString()}건이 있어.`}
      </div>

      <div className={styles.warnBox}>
        되돌리면 이때 가져온 기록이 모두 지워져. 가져온 뒤에 고친 내용도 같이 사라지고,
        그 전에 있던 기록은 그대로야.
        {last.createdPaymentIds.length > 0 &&
          ` 가져오면서 새로 만든 결제수단 ${last.createdPaymentIds.length}개도 쓰는 기록이 없으면 함께 지워져.`}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={keep} disabled={busy}>
          이대로 쓸게
        </button>
        <button type="button" className={`${styles.confirm} ${styles.danger}`} onClick={undo} disabled={busy}>
          되돌리기
        </button>
      </div>
    </Sheet>
  );
}
