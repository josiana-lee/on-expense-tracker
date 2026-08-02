import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { updateSettings } from '../../db/settings';
import { useCatalog } from '../../hooks/useCatalog';
import { useSettings } from '../../hooks/useSettings';
import { CategoryManageScreen } from './CategoryManageScreen';
import { DefaultPaymentSheet } from './DefaultPaymentSheet';
import { MonthStartDaySheet } from './MonthStartDaySheet';
import { WeekStartDaySheet } from './WeekStartDaySheet';
import styles from './SettingsScreen.module.css';

const CHEVRON = 'M9 5l7 7-7 7';
const DOWS = ['일', '월', '화', '수', '목', '금', '토'];

type Sheet = 'monthStart' | 'weekStart' | 'defaultPayment' | null;

export function SettingsScreen() {
  const settings = useSettings();
  const { categories, payments, paymentById } = useCatalog();
  const [sub, setSub] = useState<'categories' | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);

  const dark = settings?.themeMode === 'dark';
  const visibleCount = categories.filter((c) => c.visibleOnHome && !c.deprecated).length;
  const monthStartDay = settings?.monthStartDay ?? 1;
  const weekStartDay = settings?.weekStartDay ?? 0;
  const defaultPaymentId = settings?.defaultPaymentMethodId ?? payments[0]?.id ?? null;
  const defaultPaymentName = defaultPaymentId ? paymentById.get(defaultPaymentId)?.name : undefined;

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

        <button type="button" className={styles.row} onClick={() => setSheet('monthStart')}>
          <span className={styles.rowLabel}>월 시작일</span>
          <span className={styles.rowValue}>{monthStartDay}일</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <button type="button" className={styles.row} onClick={() => setSheet('weekStart')}>
          <span className={styles.rowLabel}>주 시작요일</span>
          <span className={styles.rowValue}>{DOWS[weekStartDay]}요일</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <button type="button" className={styles.row} onClick={() => setSheet('defaultPayment')}>
          <span className={styles.rowLabel}>기본 결제수단</span>
          <span className={styles.rowValue}>{defaultPaymentName ?? '없음'}</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>
      </div>

      <div className={styles.footer}>on-expense-tracker v0.1</div>

      {sub === 'categories' && <CategoryManageScreen onBack={() => setSub(null)} />}

      {sheet === 'monthStart' && (
        <MonthStartDaySheet value={monthStartDay} onClose={() => setSheet(null)} />
      )}
      {sheet === 'weekStart' && (
        <WeekStartDaySheet value={weekStartDay} onClose={() => setSheet(null)} />
      )}
      {sheet === 'defaultPayment' && (
        <DefaultPaymentSheet
          value={settings?.defaultPaymentMethodId ?? null}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
