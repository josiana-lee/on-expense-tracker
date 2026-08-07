import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Toast } from '../../components/Toast';
import type { RecurringRuleRecord } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { useRecurringRules } from '../../hooks/useRecurringRules';
import { useToast } from '../../hooks/useToast';
import {
  MAX_RECURRING_RULES,
  isTemplateVisible,
  logFromTemplate,
  setRecurringVisible,
} from '../../db/recurring';
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

  /** 표시 여부는 시트에 들어가지 않고 여기서 바로 뒤집는다. 켜고 끄는 걸
   *  자주 하게 되는 설정이라 열고-바꾸고-저장은 세 배로 든다. */
  const toggleVisible = (rule: RecurringRuleRecord) => {
    const next = !isTemplateVisible(rule);
    guard(async () => {
      try {
        await setRecurringVisible(rule.id, next);
        flash(next ? `${rule.name} 입력 화면에 표시할게` : `${rule.name} 숨겼어`);
      } catch {
        flash('바꾸지 못했어');
      }
    });
  };

  const full = rules.length >= MAX_RECURRING_RULES;

  return (
    <div className={styles.sub}>
      <div className={styles.subHead}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="뒤로">
          <Icon path={BACK_ICON} size={19} stroke="var(--tx)" strokeWidth={2.2} />
        </button>
        <span className={styles.subTitle}>반복 지출</span>
        <span className={styles.subMeta}>
          {rules.length} / {MAX_RECURRING_RULES}
        </span>
      </div>

      <div className={styles.subBody}>
        {/* 상한에 닿으면 버튼을 지우지 않고 막는다. 사라진 버튼은 왜 없는지
            설명하지 못해서, 사용자가 자기 실수인지 앱 고장인지 모른다. */}
        <button
          type="button"
          className={styles.addBtn}
          onClick={() =>
            full
              ? flash(`반복 지출은 ${MAX_RECURRING_RULES}개까지야. 안 쓰는 걸 먼저 지워줘`)
              : setEditing('new')
          }
          aria-disabled={full}
          data-full={full || undefined}
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
              const visible = isTemplateVisible(rule);
              return (
                <div
                  key={rule.id}
                  className={`${styles.catRow} ${visible ? '' : styles.catRowDim}`}
                >
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
                        {[category?.name, rule.subLabel, `${won(rule.amount)}원`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  </button>
                  {/* 표시와 기록은 결과의 무게가 다르다 — 하나는 칩이
                      나타났다 사라지고 하나는 돈 기록이 생긴다. 잘못 눌렀을
                      때를 생각해 채운 버튼은 기록 쪽에만 둔다. */}
                  <button
                    type="button"
                    className={`${styles.ruleShow} ${visible ? styles.ruleShowOn : ''}`}
                    onClick={() => toggleVisible(rule)}
                    disabled={busy}
                    aria-pressed={visible}
                  >
                    {visible ? '표시 중' : '숨김'}
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
