import { useMemo, useState } from 'react';
import { Toast } from '../../components/Toast';
import type { AccountRecord, PaymentMethodRecord } from '../../db/types';
import { useAccounts } from '../../hooks/useAccounts';
import { useCatalog } from '../../hooks/useCatalog';
import { useToast } from '../../hooks/useToast';
import { won } from '../../lib/format';
import { AccountSheet } from './AccountSheet';
import { CardRow } from './CardRow';
import { CardSheet } from './CardSheet';
import styles from './AssetsScreen.module.css';

const KIND_LABEL: Record<AccountRecord['kind'], string> = {
  checking: '입출금',
  savings: '저축',
  cash: '현금',
  investment: '투자',
  other: '기타',
};

const KIND_COLOR: Record<AccountRecord['kind'], string> = {
  checking: '#B3DCC3',
  savings: '#A8C9F7',
  cash: '#FFE0A0',
  investment: '#C0B6F4',
  other: '#CFD5DE',
};

export function AssetsScreen() {
  const { accounts } = useAccounts();
  const { payments } = useCatalog();
  const { text: toast, flash } = useToast();
  const today = useMemo(() => new Date(), []);

  const [accountSheet, setAccountSheet] = useState<{ account: AccountRecord | null } | null>(
    null,
  );
  const [cardSheet, setCardSheet] = useState<{ card: PaymentMethodRecord | null } | null>(null);

  const cards = payments.filter((p) => p.kind !== 'cash');
  const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className={styles.screen}>
      <div className={styles.title}>자산</div>

      <div className={styles.netCard}>
        <div className={styles.netLabel}>총 자산</div>
        <div className={styles.netRow}>
          <span className={`${styles.netValue} ${netWorth < 0 ? styles.netValueNeg : ''} tabular`}>
            {won(Math.abs(netWorth))}
          </span>
          <span className={styles.netUnit}>{netWorth < 0 ? '원 마이너스' : '원'}</span>
        </div>
        <div className={styles.netHint}>
          내 계좌 잔액의 합이야. 카드 결제액은 따로 아래에서 확인해줘.
        </div>
      </div>

      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>내 계좌</span>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setAccountSheet({ account: null })}
        >
          + 계좌 추가
        </button>
      </div>
      <div className={styles.card}>
        {accounts.length === 0 ? (
          <p className={styles.empty}>등록된 계좌가 없어</p>
        ) : (
          accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={styles.row}
              onClick={() => setAccountSheet({ account: a })}
            >
              <span className={styles.tag} style={{ background: KIND_COLOR[a.kind] }}>
                {a.name.slice(0, 1)}
              </span>
              <div className={styles.rowMain}>
                <div className={styles.rowName}>{a.name}</div>
                <div className={styles.rowSub}>{KIND_LABEL[a.kind]}</div>
              </div>
              <span
                className={`${styles.rowValue} ${a.balance < 0 ? styles.rowValueNeg : ''} tabular`}
              >
                {won(a.balance)}원
              </span>
            </button>
          ))
        )}
      </div>

      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>내 카드</span>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setCardSheet({ card: null })}
        >
          + 카드 추가
        </button>
      </div>
      <div className={styles.card}>
        {cards.length === 0 ? (
          <p className={styles.empty}>등록된 카드가 없어</p>
        ) : (
          cards.map((c) => (
            <CardRow key={c.id} card={c} today={today} onTap={() => setCardSheet({ card: c })} />
          ))
        )}
      </div>

      <div className={styles.spacer} />

      {accountSheet && (
        <AccountSheet
          account={accountSheet.account}
          onClose={() => setAccountSheet(null)}
          onDone={flash}
        />
      )}

      {cardSheet && (
        <CardSheet card={cardSheet.card} onClose={() => setCardSheet(null)} onDone={flash} />
      )}

      {toast && <Toast key={toast} text={toast} />}
    </div>
  );
}
