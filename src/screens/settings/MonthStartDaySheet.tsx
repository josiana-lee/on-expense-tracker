import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { updateSettings } from '../../db/settings';
import styles from './MonthStartDaySheet.module.css';

type Props = {
  value: number;
  onClose: () => void;
};

/** Each nudge saves immediately — there's nothing to confirm, unlike an
 *  amount the user is still typing. "완료" just closes the sheet. */
export function MonthStartDaySheet({ value, onClose }: Props) {
  return (
    <Sheet label="월 시작일 설정" onClose={onClose}>
      <div className={styles.title}>월 시작일</div>
      <div className={styles.hint}>
        예산과 카드 결제 주기를 계산할 때 "이번 달"의 시작으로 쓸 날짜야. 월급날이나 카드
        결제일에 맞춰두면 실제 씀씀이 주기랑 더 잘 맞아.
      </div>

      <Stepper label="시작일" value={value} min={1} max={28} unit="일" onChange={(v) => updateSettings({ monthStartDay: v })} />

      <button type="button" className={styles.done} onClick={onClose}>
        완료
      </button>
    </Sheet>
  );
}
