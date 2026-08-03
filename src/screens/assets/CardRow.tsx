import { Icon } from '../../components/Icon';
import { useCardStatement } from '../../hooks/useCardStatement';
import type { PaymentMethodRecord } from '../../db/types';
import { won } from '../../lib/format';
import styles from './AssetsScreen.module.css';

const CHEVRON_UP = 'M6 15l6-6 6 6';
const CHEVRON_DOWN = 'M6 9l6 6 6-6';

type Props = {
  card: PaymentMethodRecord;
  today: Date;
  onTap: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
};

/** Its own component so useCardStatement — which itself calls useLiveQuery —
 *  runs once per card rather than inside a .map() in the parent. */
export function CardRow({ card, today, onTap, onMoveUp, onMoveDown, isFirst, isLast }: Props) {
  const statement = useCardStatement(card, today);

  return (
    <div className={styles.row}>
      <button type="button" className={styles.rowBtn} onClick={onTap}>
        <span className={styles.tag} style={{ background: card.colorHex }}>
          {card.tag}
        </span>
        <div className={styles.rowMain}>
          <div className={styles.rowName}>{card.name}</div>
          <div className={styles.rowSub}>
            {statement.configured
              ? `매월 ${statement.paymentDay}일 결제 · 미결제 ${won(statement.unpaid)}원`
              : '탭해서 결제 주기 설정'}
          </div>
        </div>
        <span className={styles.rowValue}>
          {statement.configured ? `${won(statement.billed)}원` : '-'}
        </span>
      </button>

      <div className={styles.reorder}>
        <button
          type="button"
          className={styles.reorderBtn}
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label={`${card.name} 위로 이동`}
        >
          <Icon path={CHEVRON_UP} size={15} stroke="currentColor" strokeWidth={2.4} />
        </button>
        <button
          type="button"
          className={styles.reorderBtn}
          onClick={onMoveDown}
          disabled={isLast}
          aria-label={`${card.name} 아래로 이동`}
        >
          <Icon path={CHEVRON_DOWN} size={15} stroke="currentColor" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
