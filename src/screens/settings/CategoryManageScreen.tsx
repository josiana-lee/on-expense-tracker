import { Icon } from '../../components/Icon';
import { setCategoryVisible } from '../../db/categories';
import { useCatalog } from '../../hooks/useCatalog';
import styles from './SettingsScreen.module.css';

const BACK_ICON = 'M15 5l-7 7 7 7';

type Props = {
  onBack: () => void;
};

export function CategoryManageScreen({ onBack }: Props) {
  const { categories } = useCatalog();
  // Deprecated presets (dropped from the catalogue) still hold historical
  // records, but there's nothing to toggle for them here.
  const rows = categories.filter((c) => !c.deprecated);
  const visibleCount = rows.filter((c) => c.visibleOnHome).length;

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
          입력 화면에 보일 카테고리를 골라줘. 탭할 때마다 켜고 꺼져.
        </p>
        <div className={styles.subCard}>
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryVisible(c.id, !c.visibleOnHome)}
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
    </div>
  );
}
