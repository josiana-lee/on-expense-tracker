import { Icon } from '../../components/Icon';
import { Toast } from '../../components/Toast';
import { setCategoryVisible } from '../../db/categories';
import { MAX_HOME_CATEGORIES } from '../../data/categories';
import { useCatalog } from '../../hooks/useCatalog';
import { useToast } from '../../hooks/useToast';
import styles from './SettingsScreen.module.css';

const BACK_ICON = 'M15 5l-7 7 7 7';

type Props = {
  onBack: () => void;
};

export function CategoryManageScreen({ onBack }: Props) {
  const { categories } = useCatalog();
  const { text: toast, flash } = useToast();
  // Deprecated presets (dropped from the catalogue) still hold historical
  // records, but there's nothing to toggle for them here.
  const rows = categories.filter((c) => !c.deprecated);
  const visibleCount = rows.filter((c) => c.visibleOnHome).length;
  const atCap = visibleCount >= MAX_HOME_CATEGORIES;

  const toggle = (id: string, current: boolean) => {
    if (!current && atCap) {
      flash(`입력 화면엔 최대 ${MAX_HOME_CATEGORIES}개까지만 표시할 수 있어. 다른 카테고리를 먼저 꺼줘.`);
      return;
    }
    setCategoryVisible(id, !current);
  };

  return (
    <div className={styles.sub}>
      <div className={styles.subHead}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="뒤로">
          <Icon path={BACK_ICON} size={19} stroke="var(--tx)" strokeWidth={2.2} />
        </button>
        <span className={styles.subTitle}>카테고리 관리</span>
        <span className={styles.subMeta}>
          홈 표시 {visibleCount} / 전체 {rows.length}
        </span>
      </div>

      <div className={styles.subBody}>
        <p className={styles.subNote}>
          전체 {rows.length}개 중 입력 화면에는 최대 {MAX_HOME_CATEGORIES}개까지 보여줄 수 있어.
          탭해서 켜고 꺼줘 — 하나를 끄면 다른 걸 켤 수 있어.
        </p>
        <div className={styles.subCard}>
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id, c.visibleOnHome)}
              aria-pressed={c.visibleOnHome}
              className={`${styles.catRow} ${c.visibleOnHome ? '' : styles.catRowDim}`}
            >
              <span className={styles.catBadge} style={{ background: c.colorHex }}>
                <Icon path={c.iconPath} size={17} strokeWidth={1.8} />
              </span>
              <div className={styles.catMain}>
                <div className={styles.catName}>{c.name}</div>
                <div className={styles.catSubs}>{c.subs.slice(0, 3).join(' · ')}</div>
              </div>
              <span
                className={`${styles.catState} ${
                  c.visibleOnHome ? styles.catStateOn : styles.catStateOff
                }`}
              >
                {c.visibleOnHome ? '표시 중' : '숨김'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {toast && <Toast key={toast} text={toast} />}
    </div>
  );
}
