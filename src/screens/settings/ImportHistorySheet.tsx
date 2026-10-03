import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import type { ImportEntry } from '../../db/importers/undo';
import { won } from '../../lib/format';
import styles from './ImportSheet.module.css';

const CHEVRON = 'M9 5l7 7-7 7';

type Props = {
  entries: ImportEntry[];
  /** 한 줄을 골랐다. 호출한 쪽이 이 시트를 닫고 "되돌릴까?"를 묻는다. */
  onPick: (entry: ImportEntry) => void;
  onClose: () => void;
};

/** 지금까지 가져온 기록을 가져오기별로 보여주고, 골라서 되돌리게 하는 목록.
 *
 *  가져온 직후의 "이대로 쓸게"를 누른 뒤에도, 시트를 닫고 며칠이 지난 뒤에도 쓴다. 되돌릴
 *  수 있는 게 마지막 하나뿐이던 때는 같은 파일을 실수로 두 번 넣으면 첫 번째를 지울 길이
 *  없었다. */
export function ImportHistorySheet({ entries, onPick, onClose }: Props) {
  return (
    <Sheet label="가져온 기록" onClose={onClose}>
      <div className={styles.title}>가져온 기록</div>
      <div className={styles.hint}>
        잘못 가져왔으면 골라서 되돌려. 그때 가져온 기록만 지워지고 나머지는 그대로야.
      </div>

      {entries.length === 0 ? (
        <div className={styles.hint}>되돌릴 수 있는 가져온 기록이 없어.</div>
      ) : (
        <div className={styles.card}>
          {entries.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`${styles.row} ${styles.pick}`}
              onClick={() => onPick(e)}
            >
              <span className={styles.pickMain}>
                <span className={styles.rowLabel}>
                  {new Date(e.at).toLocaleString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className={styles.pickSub}>
                  {e.count.toLocaleString()}건 · {won(e.spend)}원
                </span>
              </span>
              <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
