import { useState } from 'react';
import { Keypad, applyKey } from '../../components/Keypad';
import { Sheet } from '../../components/Sheet';
import { addAccount, deleteAccount, updateAccount } from '../../db/accounts';
import type { AccountRecord } from '../../db/types';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { won } from '../../lib/format';
import styles from './AccountSheet.module.css';

const KINDS: Array<{ value: AccountRecord['kind']; label: string }> = [
  { value: 'checking', label: '입출금' },
  { value: 'savings', label: '저축' },
  { value: 'cash', label: '현금' },
  { value: 'investment', label: '투자' },
  { value: 'other', label: '기타' },
];

type Props = {
  /** An existing account to edit, or null to create one. */
  account: AccountRecord | null;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function AccountSheet({ account, onClose, onDone }: Props) {
  const editing = account !== null;
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountRecord['kind']>(account?.kind ?? 'checking');
  const [amount, setAmount] = useState(account ? String(account.balance) : '');
  const { busy, guard } = useGuardedAction();

  const submit = () => {
    if (!name.trim()) {
      onDone('계좌 이름을 입력해줘');
      return;
    }
    if (!amount) {
      onDone('잔액을 입력해줘');
      return;
    }
    guard(async () => {
      try {
        if (account) {
          await updateAccount(account.id, { name: name.trim(), kind, balance: Number(amount) });
          onDone('수정했어!');
        } else {
          await addAccount({ name: name.trim(), kind, balance: Number(amount) });
          onDone('계좌를 추가했어!');
        }
        onClose();
      } catch {
        onDone(editing ? '수정하지 못했어' : '추가하지 못했어');
      }
    });
  };

  const remove = () => {
    if (!account) return;
    guard(async () => {
      try {
        await deleteAccount(account.id);
        onDone('삭제했어');
        onClose();
      } catch {
        onDone('삭제하지 못했어');
      }
    });
  };

  return (
    <Sheet label={editing ? '계좌 수정' : '계좌 추가'} onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.title}>{editing ? '계좌 수정' : '계좌 추가'}</span>
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
        placeholder="계좌 이름 (예: 농협 주거래)"
        enterKeyHint="done"
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

      <div className={styles.amountRow}>
        <span className={`${styles.amount} tabular`}>{won(amount || '0')}</span>
        <span className={styles.unit}>원</span>
      </div>

      <Keypad compact onPress={(k) => setAmount((a) => applyKey(a, k))} />

      <button type="button" className={styles.save} onClick={submit} disabled={busy}>
        {editing ? '수정 완료' : '추가!'}
      </button>
    </Sheet>
  );
}
