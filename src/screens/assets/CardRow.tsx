import { useCardStatement } from '../../hooks/useCardStatement';
import type { PaymentMethodRecord } from '../../db/types';
import { won } from '../../lib/format';
import styles from './AssetsScreen.module.css';

type Props = {
  card: PaymentMethodRecord;
  today: Date;
  onTap: () => void;
};

/** Its own component so useCardStatement — which itself calls useLiveQuery —
 *  runs once per card rather than inside a .map() in the parent. */
export function CardRow({ card, today, onTap }: Props) {
  const statement = useCardStatement(card, today);

  return (
    <button type="button" className={styles.row} onClick={onTap}>
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
  );
}
