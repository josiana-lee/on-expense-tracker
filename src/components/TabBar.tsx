import { Icon } from './Icon';
import { useBackupOverdue } from '../hooks/useBackupOverdue';
import styles from './TabBar.module.css';

export const TABS = [
  { id: 'input', name: '입력', icon: 'M12 5v14M5 12h14' },
  {
    id: 'calendar',
    name: '달력',
    icon: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13H4zM4 10h16M8 3v4M16 3v4',
  },
  { id: 'budget', name: '예산', icon: 'M4 19V9M10 19V5M16 19v-7M21 19H3' },
  {
    id: 'assets',
    name: '자산',
    icon: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 11h18M16.5 15.5h2',
  },
  {
    id: 'settings',
    name: '설정',
    icon: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-2.72 1.13V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.1 19.4l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 3 13.9H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.1l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 10 4.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.9 1.06l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 20.9 10H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  },
] as const;

export type TabId = (typeof TABS)[number]['id'];

type Props = {
  active: TabId;
  onChange: (id: TabId) => void;
};

export function TabBar({ active, onChange }: Props) {
  const backupOverdue = useBackupOverdue();

  return (
    <nav className={styles.bar}>
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? 'page' : undefined}
          className={`${styles.tab} ${active === t.id ? styles.active : ''}`}
        >
          <span className={styles.iconWrap}>
            <Icon path={t.icon} size={21} stroke="currentColor" strokeWidth={1.8} />
            {t.id === 'settings' && backupOverdue && (
              <span className={styles.badge} aria-label="백업이 필요해" />
            )}
          </span>
          <span className={styles.label}>{t.name}</span>
        </button>
      ))}
    </nav>
  );
}
