import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import type { CategoryRecord, PaymentMethodRecord } from '../../db/types';
import { useShell } from '../../shell/ShellContext';
import { won } from '../../lib/format';
import { useBackHandler } from '../../shell/useBackHandler';
import styles from './CategoryPopup.module.css';

export type PopupOrigin = { dx: number; dy: number };

type Props = {
  category: CategoryRecord;
  origin: PopupOrigin;
  closing: boolean;
  amount: string;
  sub: string | null;
  memo: string;
  payments: PaymentMethodRecord[];
  paymentId: string;
  onSelectSub: (sub: string) => void;
  onMemoChange: (memo: string) => void;
  onSelectPayment: (id: string) => void;
  /** Stages this category/sub/memo on the screen behind it — does not touch
   *  the database. Only the screen's own "추가!" button does that. */
  onConfirm: () => void;
  onClose: () => void;
};

export function CategoryPopup({
  category,
  origin,
  closing,
  amount,
  sub,
  memo,
  payments,
  paymentId,
  onSelectSub,
  onMemoChange,
  onSelectPayment,
  onConfirm,
  onClose,
}: Props) {
  const shell = useShell();
  /* Back cancels the pick rather than confirming it — the popup exists so a
     category can be reviewed and backed out of without touching what the next
     save will use. Registered while the exit animation plays too, which is
     harmless: onClose is idempotent. */
  useBackHandler(true, onClose);

  if (!shell) return null;

  // The popup grows out of the icon the user tapped and collapses back into it.
  const originVars = { '--dx': `${origin.dx}px`, '--dy': `${origin.dy}px` } as CSSProperties;

  return createPortal(
    <>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="닫기" />
      <div
        className={`${styles.popup} ${closing ? styles.closing : ''}`}
        style={originVars}
        role="dialog"
        aria-modal="true"
        aria-label={`${category.name} 기록`}
      >
        <div className={styles.head}>
          <span className={styles.badge} style={{ background: category.colorHex }}>
            <Icon path={category.iconPath} size={26} />
          </span>
          <div>
            <div className={styles.name}>{category.name}</div>
            <div className={styles.amount}>{won(amount || '0')}원</div>
          </div>
        </div>

        <div className={styles.subs}>
          {category.subs.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSelectSub(s)}
              className={`${styles.sub} ${sub === s ? styles.subOn : ''}`}
            >
              {s}
            </button>
          ))}
        </div>

        <input
          className={styles.memo}
          value={memo}
          onChange={(e) => onMemoChange(e.target.value)}
          placeholder="메모 (선택)"
          enterKeyHint="done"
        />

        <div className={styles.pays}>
          {payments.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPayment(p.id)}
              className={`${styles.pay} ${paymentId === p.id ? styles.payOn : ''}`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Not a save — this only hands the pick back to the screen. Distinct
            from the screen's own "추가!", which is the one action that
            actually writes a record. */}
        <button type="button" className={styles.cta} onClick={onConfirm}>
          입력 완료
        </button>
      </div>
    </>,
    shell,
  );
}
