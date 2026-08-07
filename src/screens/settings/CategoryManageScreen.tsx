import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Toast } from '../../components/Toast';
import { MAX_HOME_CATEGORIES } from '../../data/categories';
import type { CategoryRecord } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { useToast } from '../../hooks/useToast';
import { CategorySheet } from './CategorySheet';
import { useBackHandler } from '../../shell/useBackHandler';
import styles from './SettingsScreen.module.css';

const BACK_ICON = 'M15 5l-7 7 7 7';
const INFO_ICON = 'M12 8h.01M12 12v5';

type Props = {
  onBack: () => void;
};

export function CategoryManageScreen({ onBack }: Props) {
  useBackHandler(true, onBack);
  const { categories } = useCatalog();
  const { text: toast, flash } = useToast();
  // Deprecated presets (dropped from the catalogue) still hold historical
  // records, but there's nothing to toggle for them here.
  const rows = categories.filter((c) => !c.deprecated);
  const visibleCount = rows.filter((c) => c.visibleOnHome).length;

  const [editing, setEditing] = useState<CategoryRecord | 'new' | null>(null);

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
        <button type="button" className={styles.addBtn} onClick={() => setEditing('new')}>
          + 카테고리 추가
        </button>

        <div className={styles.noteBox}>
          <span className={styles.noteIcon}>
            <Icon path={INFO_ICON} size={16} stroke="currentColor" strokeWidth={2.4} />
          </span>
          <p className={styles.noteText}>
            전체 {rows.length}개 중 입력 화면에는 최대 {MAX_HOME_CATEGORIES}개까지 보여줄 수 있어.
            눌러서 이름·아이콘·표시 여부를 바꾸거나 삭제할 수 있어.
          </p>
        </div>
        <div className={styles.subCard}>
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setEditing(c)}
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

      {editing && (
        <CategorySheet
          category={editing === 'new' ? null : editing}
          otherVisibleCount={
            editing === 'new' ? visibleCount : visibleCount - (editing.visibleOnHome ? 1 : 0)
          }
          onClose={() => setEditing(null)}
          onDone={flash}
        />
      )}
    </div>
  );
}
