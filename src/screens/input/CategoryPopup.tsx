import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import type { Category } from '../../data/categories';
import type { PaymentMethod } from '../../data/payments';
import { useShell } from '../../shell/ShellContext';
import { won } from '../../lib/format';
import styles from './CategoryPopup.module.css';

export type PopupOrigin = { dx: number; dy: number };

type Props = {
  category: Category;
  origin: PopupOrigin;
  closing: boolean;
  amount: string;
  sub: string | null;
  memo: string;
  payments: PaymentMethod[];
  paymentId: string;
  onSelectSub: (sub: string) => void;
  onMemoChange: (memo: string) => void;
  onSelectPayment: (id: string) => void;
  onSave: () => void;
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
  onSave,
  onClose,
}: Props) {
  const shell = useShell();
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
          <span className={styles.badge} style={{ background: category.color }}>
            <Icon path={category.icon} size={26} />
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

        <button type="button" className={styles.cta} onClick={onSave}>
          추가!
        </button>
      </div>
    </>,
    shell,
  );
}
