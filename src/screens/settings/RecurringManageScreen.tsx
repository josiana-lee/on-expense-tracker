import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Toast } from '../../components/Toast';
import type { RecurringRuleRecord } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { useRecurringRules } from '../../hooks/useRecurringRules';
import { useToast } from '../../hooks/useToast';
import { fmt } from '../../db/date';
import { won } from '../../lib/format';
import { RecurringRuleSheet } from './RecurringRuleSheet';
import styles from './SettingsScreen.module.css';

const BACK_ICON = 'M15 5l-7 7 7 7';
const DOWS = ['일', '월', '화', '수', '목', '금', '토'];

function scheduleText(rule: RecurringRuleRecord): string {
  if (rule.interval === 'weekly') return `매주 ${DOWS[rule.weekday ?? 0]}요일`;
  if (rule.interval === 'monthly') return `매월 ${rule.dayOfMonth}일`;
  return `매년 ${rule.monthOfYear}월 ${rule.dayOfMonth}일`;
}

type Props = {
  onBack: () => void;
};

export function RecurringManageScreen({ onBack }: Props) {
  const rules = useRecurringRules();
  const { byId } = useCatalog();
  const { text: toast, flash } = useToast();
  const [editing, setEditing] = useState<RecurringRuleRecord | 'new' | null>(null);

  const today = fmt(new Date());

  return (
    <div className={styles.sub}>
      <div className={styles.subHead}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="뒤로">
          <Icon path={BACK_ICON} size={19} stroke="var(--tx)" strokeWidth={2.2} />
        </button>
        <span className={styles.subTitle}>반복 지출</span>
        <span className={styles.subMeta}>{rules.length}개</span>
      </div>

      <div className={styles.subBody}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setEditing('new')}
        >
          + 반복 지출 추가
        </button>

        {rules.length === 0 ? (
          <div className={styles.subCard}>
            <p className={styles.empty}>등록된 반복 지출이 없어</p>
          </div>
        ) : (
          <div className={styles.subCard}>
            {rules.map((rule) => {
              const category = byId.get(rule.categoryId);
              const overdue = rule.active && rule.nextRunDate <= today;
              return (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => setEditing(rule)}
                  className={`${styles.catRow} ${rule.active ? '' : styles.catRowDim}`}
                >
                  <span
                    className={styles.catBadge}
                    style={{ background: category?.colorHex ?? '#CFD5DE' }}
                  >
                    {category && (
                      <Icon path={category.iconPath} size={17} strokeWidth={1.8} />
                    )}
                  </span>
                  <div className={styles.catMain}>
                    <div className={styles.catName}>{rule.name}</div>
                    <div className={styles.catSubs}>
                      {scheduleText(rule)} · {won(rule.amount)}원
                      {overdue && rule.mode === 'remind' ? ' · 기록 대기 중' : ''}
                    </div>
                  </div>
                  <span
                    className={`${styles.catState} ${
                      rule.active ? styles.catStateOn : styles.catStateOff
                    }`}
                  >
                    {rule.active ? '사용중' : '중지됨'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {toast && <Toast key={toast} text={toast} />}

      {editing && (
        <RecurringRuleSheet
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={flash}
        />
      )}
    </div>
  );
}
