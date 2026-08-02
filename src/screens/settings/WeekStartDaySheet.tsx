import { updateSettings } from '../../db/settings';
import { Sheet } from '../../components/Sheet';
import styles from './WeekStartDaySheet.module.css';

const DOWS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  value: number;
  onClose: () => void;
};

export function WeekStartDaySheet({ value, onClose }: Props) {
  return (
    <Sheet label="주 시작요일 설정" onClose={onClose}>
      <div className={styles.title}>주 시작요일</div>
      <div className={styles.hint}>
        달력과 예산의 주간 구간을 나눌 때 한 주가 어느 요일부터 시작하는지야.
      </div>

      <div className={styles.days}>
        {DOWS.map((name, i) => (
          <button
            key={i}
            type="button"
            onClick={() => updateSettings({ weekStartDay: i })}
            aria-pressed={value === i}
            className={`${styles.day} ${value === i ? styles.dayOn : ''}`}
          >
            {name}
          </button>
        ))}
      </div>

      <button type="button" className={styles.done} onClick={onClose}>
        완료
      </button>
    </Sheet>
  );
}
