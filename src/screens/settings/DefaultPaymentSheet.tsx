import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { updateSettings } from '../../db/settings';
import { useCatalog } from '../../hooks/useCatalog';
import styles from './DefaultPaymentSheet.module.css';

const CHECK_ICON = 'M4 12.5l5.5 5.5L20 6';

type Props = {
  value: string | null;
  onClose: () => void;
};

export function DefaultPaymentSheet({ value, onClose }: Props) {
  const { payments } = useCatalog();
  const selected = value ?? payments[0]?.id;

  return (
    <Sheet label="기본 결제수단 설정" onClose={onClose}>
      <div className={styles.title}>기본 결제수단</div>
      <div className={styles.hint}>
        입력 화면과 달력에서 새 기록을 시작할 때 기본으로 선택돼 있을 결제수단이야.
      </div>

      <div className={styles.list}>
        {payments.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => updateSettings({ defaultPaymentMethodId: p.id })}
            aria-pressed={selected === p.id}
            className={styles.row}
          >
            <span className={styles.tag} style={{ background: p.colorHex }}>
              {p.tag}
            </span>
            <span className={styles.name}>{p.name}</span>
            {selected === p.id && (
              <span className={styles.check}>
                <Icon path={CHECK_ICON} size={18} stroke="currentColor" strokeWidth={2.6} />
              </span>
            )}
          </button>
        ))}
      </div>

      <button type="button" className={styles.done} onClick={onClose}>
        완료
      </button>
    </Sheet>
  );
}
