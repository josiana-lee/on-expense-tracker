import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import {
  addPaymentMethod,
  archivePaymentMethod,
  clearCardStatement,
  setCardStatement,
  updatePaymentMethod,
} from '../../db/paymentMethods';
import type { PaymentMethodRecord } from '../../db/types';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { blurOnEnter } from '../../lib/keyboard';
import styles from './CardSheet.module.css';

type Props = {
  /** An existing card to edit, or null to add one. */
  card: PaymentMethodRecord | null;
  onClose: () => void;
  onDone: (message: string) => void;
};

const MIN_DAY = 1;
const MAX_DAY = 28;

const KINDS: Array<{ value: 'credit' | 'debit'; label: string }> = [
  { value: 'credit', label: '신용카드' },
  { value: 'debit', label: '체크카드' },
];

export function CardSheet({ card, onClose, onDone }: Props) {
  const editing = card !== null;
  const [name, setName] = useState(card?.name ?? '');
  const [kind, setKind] = useState<'credit' | 'debit'>(
    card?.kind === 'debit' ? 'debit' : 'credit',
  );
  const [paymentDay, setPaymentDay] = useState(card?.paymentDay ?? 14);
  // Cycles run back-to-back with no gap, so the statement period is fully
  // determined by its start day alone (see db/paymentMethods.ts). Defaulting
  // it to the payment day itself is the common real-world pattern — "결제일이
  // 9일이면 9일부터 다음달 8일까지가 사용기간" — and needs no extra convention.
  const [statementStartDay, setStatementStartDay] = useState(
    card?.statementStartDay ?? card?.paymentDay ?? 14,
  );
  const { busy, guard } = useGuardedAction();

  const save = () => {
    if (!name.trim()) {
      onDone('카드 이름을 입력해줘 (예: 국민 체크카드)');
      return;
    }

    guard(async () => {
      try {
        /* 결제 주기는 신용카드에만 붙인다. 체크카드는 긁는 즉시 계좌에서
           빠지므로 결제일도 미결제 잔액도 없는데, 여기서 종류를 안 보고
           저장하는 바람에 자산 탭에 "매월 14일 결제 · 미결제 21,050원"이
           떴다 — 앱이 사용자에게 사실이 아닌 문장을 보여주던 유일한 자리다.
           신용카드였다가 체크카드로 바꾼 경우에는 남아 있던 값을 떼어낸다. */
        if (card) {
          await updatePaymentMethod(card.id, { name, kind });
          if (kind === 'credit') await setCardStatement(card.id, paymentDay, statementStartDay);
          else await clearCardStatement(card.id);
          onDone('수정했어!');
        } else {
          const id = await addPaymentMethod({ name, kind });
          if (kind === 'credit') await setCardStatement(id, paymentDay, statementStartDay);
          onDone('카드를 추가했어!');
        }
        onClose();
      } catch {
        onDone(editing ? '수정하지 못했어' : '추가하지 못했어');
      }
    });
  };

  const remove = () => {
    if (!card) return;
    guard(async () => {
      try {
        await archivePaymentMethod(card.id);
        onDone('삭제했어');
        onClose();
      } catch {
        onDone('삭제하지 못했어');
      }
    });
  };

  return (
    <Sheet label={editing ? `${card.name} 수정` : '카드 추가'} onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.title}>{editing ? '카드 수정' : '카드 추가'}</span>
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
        placeholder="카드 이름 (예: 국민 체크카드)"
        enterKeyHint="done"
        onKeyDown={blurOnEnter}
      />

      <div className={styles.kinds}>
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            className={`${styles.kind} ${kind === k.value ? styles.kindOn : ''}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* 체크카드에는 묻지 않는다. 쓰는 즉시 계좌에서 빠지므로 결제일도
          사용기간도 없는 것이고, 칸을 내놓는 것 자체가 "있다"는 말이 된다.
          종류를 바꾸면 이 자리가 나타났다 사라져서, 무엇이 딸린 선택인지도
          그 자리에서 보인다. */}
      {kind === 'credit' ? (
        <>
          <div className={styles.hint}>
            결제일과 사용기간 시작일을 알려주면 이번 달 결제액과 미결제 잔액을 나눠 보여줄게.
          </div>

          <Stepper
            label="결제일"
            value={paymentDay}
            min={MIN_DAY}
            max={MAX_DAY}
            unit="일"
            onChange={setPaymentDay}
          />
          <Stepper
            label="사용기간 시작일"
            value={statementStartDay}
            min={MIN_DAY}
            max={MAX_DAY}
            unit="일"
            onChange={setStatementStartDay}
          />
        </>
      ) : (
        <div className={styles.hint}>체크카드는 쓰는 즉시 빠져나가서 결제일이 따로 없어.</div>
      )}

      <button type="button" className={styles.save} onClick={save} disabled={busy}>
        {editing ? '수정 완료' : '추가!'}
      </button>
    </Sheet>
  );
}
