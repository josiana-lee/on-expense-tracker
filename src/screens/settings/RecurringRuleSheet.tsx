import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Keypad, applyKey } from '../../components/Keypad';
import { ClearAmount } from '../../components/ClearAmount';
import { Sheet } from '../../components/Sheet';
import { fmt, parseDateStr } from '../../db/date';
import type { RecurringRuleInput } from '../../db/recurring';
import {
  addRecurringRule,
  deleteRecurringRule,
  logRecurringOccurrence,
  materializeDueRules,
  setRecurringActive,
  updateRecurringRule,
} from '../../db/recurring';
import type { DateStr, RecurringRuleRecord } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { useSettings } from '../../hooks/useSettings';
import { won } from '../../lib/format';
import styles from './RecurringRuleSheet.module.css';

const DOWS = ['일', '월', '화', '수', '목', '금', '토'];

const FREQS: Array<{ value: RecurringRuleRecord['interval']; label: string }> = [
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly', label: '매년' },
];

const MODES: Array<{ value: RecurringRuleRecord['mode']; label: string; hint: string }> = [
  { value: 'auto', label: '자동 기록', hint: '날짜가 되면 지출로 자동 기록돼' },
  { value: 'remind', label: '알림만', hint: '날짜가 되면 목록에 표시만 하고, 직접 눌러야 기록돼' },
];

function patternHint(freq: RecurringRuleRecord['interval'], dateStr: DateStr): string {
  const d = parseDateStr(dateStr);
  if (freq === 'weekly') return `매주 ${DOWS[d.getDay()]}요일에 반복돼`;
  if (freq === 'monthly') return `매월 ${d.getDate()}일에 반복돼 (말일이 없는 달은 마지막 날)`;
  return `매년 ${d.getMonth() + 1}월 ${d.getDate()}일에 반복돼`;
}

type Props = {
  /** An existing rule to edit, or null to create one. */
  rule: RecurringRuleRecord | null;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function RecurringRuleSheet({ rule, onClose, onDone }: Props) {
  const { categories, payments } = useCatalog();
  const settings = useSettings();
  const editing = rule !== null;
  const { busy, guard } = useGuardedAction();

  const [name, setName] = useState(rule?.name ?? '');
  const [amount, setAmount] = useState(rule ? String(rule.amount) : '');
  const [pickedCategory, setPickedCategory] = useState<string | null>(rule?.categoryId ?? null);
  const [subLabel, setSubLabel] = useState<string | undefined>(rule?.subLabel);
  const [pickedPayment, setPickedPayment] = useState<string | null>(
    rule?.paymentMethodId ?? null,
  );
  const [memo, setMemo] = useState(rule?.memo ?? '');
  const [freq, setFreq] = useState<RecurringRuleRecord['interval']>(rule?.interval ?? 'monthly');
  const [startDate, setStartDate] = useState<DateStr>(rule?.startDate ?? fmt(new Date()));
  const [hasEndDate, setHasEndDate] = useState(!!rule?.endDate);
  const [endDate, setEndDate] = useState<DateStr>(rule?.endDate ?? fmt(new Date()));
  const [mode, setMode] = useState<RecurringRuleRecord['mode']>(rule?.mode ?? 'auto');
  const [active, setActive] = useState(rule?.active ?? true);

  const categoryId = pickedCategory ?? categories[0]?.id ?? '';
  const paymentId = pickedPayment ?? settings?.defaultPaymentMethodId ?? payments[0]?.id ?? '';
  const category = categories.find((c) => c.id === categoryId);

  const pickCategory = (id: string) => {
    setPickedCategory(id);
    setSubLabel(undefined);
  };

  const today = fmt(new Date());
  const overdueRemind = editing && rule.mode === 'remind' && rule.active && rule.nextRunDate <= today;

  const submit = () => {
    if (!name.trim()) {
      onDone('이름을 입력해줘');
      return;
    }
    if (!amount) {
      onDone('금액을 입력해줘');
      return;
    }
    if (!paymentId) {
      onDone('결제수단을 먼저 만들어줘');
      return;
    }

    guard(async () => {
      try {
        const input: RecurringRuleInput = {
          name,
          amount: Number(amount),
          categoryId,
          subLabel,
          paymentMethodId: paymentId,
          memo,
          interval: freq,
          startDate,
          endDate: hasEndDate ? endDate : undefined,
          mode,
        };

        if (rule) {
          await updateRecurringRule(rule.id, input);
          if (active !== rule.active) await setRecurringActive(rule.id, active);
          onDone('수정했어!');
        } else {
          await addRecurringRule(input);
          onDone('반복 지출을 추가했어!');
        }
        // Start dates on or before today are due right away — without this,
        // an auto-mode rule wouldn't materialize its first occurrence until
        // the next app reload, which reads as "I just added it, why isn't
        // it in today's list yet."
        if (active) await materializeDueRules();
        onClose();
      } catch {
        onDone(editing ? '수정하지 못했어' : '추가하지 못했어');
      }
    });
  };

  const remove = () => {
    if (!rule) return;
    guard(async () => {
      try {
        await deleteRecurringRule(rule.id);
        onDone('삭제했어');
        onClose();
      } catch {
        onDone('삭제하지 못했어');
      }
    });
  };

  const logNow = () => {
    if (!rule) return;
    guard(async () => {
      try {
        const created = await logRecurringOccurrence(rule);
        // The schedule advances either way, so this isn't a failure — but
        // saying "기록했어!" when nothing was written would have the user
        // looking for an expense that doesn't exist.
        onDone(created ? '기록했어!' : '이미 기록된 회차야. 다음 회차로 넘길게');
        onClose();
      } catch {
        onDone('기록하지 못했어');
      }
    });
  };

  return (
    <Sheet label={editing ? '반복 지출 수정' : '반복 지출 추가'} onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.title}>{editing ? '반복 지출 수정' : '반복 지출 추가'}</span>
        {editing && (
          <button type="button" className={styles.delete} onClick={remove} disabled={busy}>
            삭제
          </button>
        )}
      </div>

      <input
        className={styles.name}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="이름 (예: 넷플릭스)"
        enterKeyHint="done"
      />

      {overdueRemind && rule && (
        <button type="button" className={styles.logNow} onClick={logNow} disabled={busy}>
          {rule.nextRunDate} 기록 대기 중 · 지금 기록하기
        </button>
      )}

      <div className={styles.amountRow}>
        <span className={`${styles.amount} tabular`}>{won(amount || '0')}</span>
        <span className={styles.unit}>원</span>
        {amount && <ClearAmount onClear={() => setAmount('')} />}
      </div>

      <div className={styles.cats}>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => pickCategory(c.id)}
            aria-label={c.name}
            aria-pressed={categoryId === c.id}
            className={`${styles.cat} ${categoryId === c.id ? styles.catOn : ''}`}
          >
            <span className={styles.catCircle} style={{ background: c.colorHex }}>
              <Icon path={c.iconPath} size={20} strokeWidth={1.8} />
            </span>
            <span className={styles.catName}>{c.name}</span>
          </button>
        ))}
      </div>

      {category && category.subs.length > 0 && (
        <div className={styles.subs}>
          {category.subs.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSubLabel((cur) => (cur === s ? undefined : s))}
              className={`${styles.sub} ${subLabel === s ? styles.subOn : ''}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <input
        className={styles.memo}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="메모 (선택)"
        enterKeyHint="done"
      />

      <div className={styles.pays}>
        {payments.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPickedPayment(p.id)}
            className={`${styles.pay} ${paymentId === p.id ? styles.payOn : ''}`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <Keypad compact onPress={(k) => setAmount((a) => applyKey(a, k))} />

      <div className={styles.segmented}>
        {FREQS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFreq(f.value)}
            className={`${styles.segBtn} ${freq === f.value ? styles.segBtnOn : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.dateRow}>
        <span className={styles.dateLabel}>시작일</span>
        <input
          type="date"
          className={styles.dateInput}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      <p className={styles.hint}>{patternHint(freq, startDate)}</p>

      <div className={styles.dateRow}>
        <span className={styles.dateLabel}>종료일</span>
        <button
          type="button"
          role="switch"
          aria-checked={hasEndDate}
          onClick={() => setHasEndDate((v) => !v)}
          className={`${styles.switch} ${hasEndDate ? styles.switchOn : ''}`}
        >
          <span className={styles.knob} />
        </button>
      </div>
      {hasEndDate && (
        <div className={styles.dateRow}>
          <span className={styles.dateLabel}>종료 날짜</span>
          <input
            type="date"
            className={styles.dateInput}
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      )}

      <div className={styles.segmented}>
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`${styles.segBtn} ${mode === m.value ? styles.segBtnOn : ''}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className={styles.hint}>{MODES.find((m) => m.value === mode)?.hint}</p>

      <div className={styles.dateRow}>
        <span className={styles.dateLabel}>사용</span>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          onClick={() => setActive((v) => !v)}
          className={`${styles.switch} ${active ? styles.switchOn : ''}`}
        >
          <span className={styles.knob} />
        </button>
      </div>

      <button type="button" className={styles.save} onClick={submit} disabled={busy}>
        {editing ? '수정 완료' : '추가!'}
      </button>
    </Sheet>
  );
}
