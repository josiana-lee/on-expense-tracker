import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Toast } from '../../components/Toast';
import type { RecurringRuleRecord } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { useRecurringRules } from '../../hooks/useRecurringRules';
import { useToast } from '../../hooks/useToast';
import { logFromTemplate } from '../../db/recurring';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { won } from '../../lib/format';
import { RecurringRuleSheet } from './RecurringRuleSheet';
import { useBackHandler } from '../../shell/useBackHandler';
import styles from './SettingsScreen.module.css';

const BACK_ICON = 'M15 5l-7 7 7 7';
type Props = {
  onBack: () => void;
};

export function RecurringManageScreen({ onBack }: Props) {
  useBackHandler(true, onBack);
  const rules = useRecurringRules();
  const { byId } = useCatalog();
  const { text: toast, flash } = useToast();
  const [editing, setEditing] = useState<RecurringRuleRecord | 'new' | null>(null);
  const { busy, guard } = useGuardedAction();

  /** The whole point of a saved expense: file it without retyping anything.
   *  Separate from the row itself, which opens the editor — one tap has to
   *  mean one thing, and mixing "use this" with "change this" on the same
   *  target is how you log an expense while trying to rename it. */
  const logNow = (rule: RecurringRuleRecord) => {
    guard(async () => {
      try {
        await logFromTemplate(rule);
        flash(`${rule.name} ${won(rule.amount)}원 기록했어!`);
      } catch {
        flash('기록하지 못했어');
      }
    });
  };

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
              return (
                <div key={rule.id} className={styles.catRow}>
                  <button
                    type="button"
                    className={styles.ruleMain}
                    onClick={() => setEditing(rule)}
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
                        {category?.name}
                        {rule.subLabel ? ` · ${rule.subLabel}` : ''} · {won(rule.amount)}원
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={styles.ruleLog}
                    onClick={() => logNow(rule)}
                    disabled={busy}
                  >
                    기록
                  </button>
                </div>
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
