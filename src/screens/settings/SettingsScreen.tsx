import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { updateSettings } from '../../db/settings';
import { useCatalog } from '../../hooks/useCatalog';
import { useSettings } from '../../hooks/useSettings';
import { CategoryManageScreen } from './CategoryManageScreen';
import styles from './SettingsScreen.module.css';

const CHEVRON = 'M9 5l7 7-7 7';

export function SettingsScreen() {
  const settings = useSettings();
  const { categories } = useCatalog();
  const [sub, setSub] = useState<'categories' | null>(null);

  const dark = settings?.themeMode === 'dark';
  const visibleCount = categories.filter((c) => c.visibleOnHome && !c.deprecated).length;

  return (
    <div className={styles.screen}>
      <div className={styles.title}>설정</div>

      <div className={styles.card}>
        <div className={styles.row} style={{ cursor: 'default' }}>
          <span className={styles.rowLabel}>다크모드</span>
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            onClick={() => updateSettings({ themeMode: dark ? 'light' : 'dark' })}
            className={`${styles.switch} ${dark ? styles.switchOn : ''}`}
          >
            <span className={styles.knob} />
          </button>
        </div>

        <button type="button" className={styles.row} onClick={() => setSub('categories')}>
          <span className={styles.rowLabel}>카테고리 관리</span>
          <span className={styles.rowValue}>
            홈 표시 {visibleCount} · 전체 {categories.length}
          </span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>
      </div>

      <div className={styles.footer}>on-expense-tracker v0.1</div>

      {sub === 'categories' && <CategoryManageScreen onBack={() => setSub(null)} />}
    </div>
  );
}
