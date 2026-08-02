import { useCallback, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Keypad, applyKey } from '../../components/Keypad';
import { Sheet } from '../../components/Sheet';
import { Toast } from '../../components/Toast';
import { CATEGORIES, CATEGORY_BY_ID, DEFAULT_VISIBLE } from '../../data/categories';
import { DEFAULT_PAYMENTS } from '../../data/payments';
import { useExpenses } from '../../hooks/useExpenses';
import { useNow } from '../../hooks/useNow';
import { useToast } from '../../hooks/useToast';
import { dateText, timeText, won } from '../../lib/format';
import { offsetFromShellCentre, useShell } from '../../shell/ShellContext';
import { CategoryPopup, type PopupOrigin } from './CategoryPopup';
import styles from './InputScreen.module.css';

/** Category a bare "추가!" press files under when no icon was picked. */
const FALLBACK_CATEGORY = 'etc';

const POPUP_EXIT_MS = 250;

type PopupState = PopupOrigin & { categoryId: string };

export function InputScreen() {
  const now = useNow();
  const shell = useShell();
  const { todayRecords, todayTotal, add } = useExpenses(now);
  const { text: toast, flash } = useToast();

  const [amount, setAmount] = useState('');
  const [paymentId, setPaymentId] = useState(DEFAULT_PAYMENTS[0].id);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [closing, setClosing] = useState(false);
  const [sub, setSub] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const exitTimer = useRef<number | undefined>(undefined);

  const visible = DEFAULT_VISIBLE.map((id) => CATEGORY_BY_ID.get(id)).filter(
    (c): c is (typeof CATEGORIES)[number] => Boolean(c),
  );

  const openPopup = useCallback(
    (categoryId: string, el: HTMLElement) => {
      window.clearTimeout(exitTimer.current);
      setClosing(false);
      setPopup({ categoryId, ...offsetFromShellCentre(el, shell) });
    },
    [shell],
  );

  const closePopup = useCallback(() => {
    setClosing(true);
    exitTimer.current = window.setTimeout(() => {
      setPopup(null);
      setClosing(false);
    }, POPUP_EXIT_MS);
  }, []);

  const save = useCallback(() => {
    if (!amount) {
      flash('금액부터 입력해줘');
      return;
    }
    add({
      amount: Number(amount),
      categoryId: popup?.categoryId ?? FALLBACK_CATEGORY,
      sub,
      memo: memo.trim(),
      paymentId,
      at: Date.now(),
    });
    flash(`${won(amount)}원 저장했어!`);
    setAmount('');
    setSub(null);
    setMemo('');
    setPopup(null);
    setClosing(false);
  }, [amount, popup, sub, memo, paymentId, add, flash]);

  const popupCategory = popup ? CATEGORY_BY_ID.get(popup.categoryId) : undefined;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div>
          <div className={styles.date}>{dateText(now)}</div>
          <div className={`${styles.time} tabular`}>{timeText(now)}</div>
        </div>
        <div className={styles.stamp}>
          <span className={styles.dot} />이 시각으로 기록돼
        </div>
      </header>

      <button type="button" className={styles.amountCard} onClick={() => setKeypadOpen(true)}>
        <div className={styles.amountLabel}>얼마 썼어?</div>
        <div className={styles.amountRow}>
          <span
            className={`${styles.amountValue} ${amount ? '' : styles.amountEmpty} tabular`}
          >
            {amount ? won(amount) : '0'}
          </span>
          <span className={styles.amountUnit}>원</span>
        </div>
      </button>

      <div className={styles.grid}>
        {visible.map((c) => (
          <button
            key={c.id}
            type="button"
            className={styles.cat}
            onClick={(e) => openPopup(c.id, e.currentTarget)}
          >
            <span className={styles.catBadge} style={{ background: c.color }}>
              <Icon path={c.icon} size={26} />
            </span>
            <span className={styles.catName}>{c.name}</span>
          </button>
        ))}
      </div>

      <div className={styles.pays}>
        {DEFAULT_PAYMENTS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPaymentId(p.id)}
            className={`${styles.pay} ${paymentId === p.id ? styles.payOn : ''}`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <section className={styles.today}>
        <div className={styles.todayHead}>
          <span className={styles.todayLabel}>오늘 기록</span>
          <span className={`${styles.todayTotal} tabular`}>{won(todayTotal)}원</span>
        </div>
        {todayRecords.length === 0 ? (
          <p className={styles.empty}>아직 오늘 기록이 없어</p>
        ) : (
          todayRecords.map((r) => {
            const cat = CATEGORY_BY_ID.get(r.categoryId);
            const pay = DEFAULT_PAYMENTS.find((p) => p.id === r.paymentId);
            return (
              <div key={r.id} className={styles.row}>
                <span className={styles.rowBadge} style={{ background: cat?.color }}>
                  {cat && <Icon path={cat.icon} size={15} strokeWidth={2} />}
                </span>
                <span className={styles.rowName}>{r.sub || cat?.name}</span>
                <span className={styles.rowMeta}>
                  {timeText(new Date(r.at))} · {pay?.name}
                </span>
                <span className={`${styles.rowAmount} tabular`}>{won(r.amount)}</span>
              </div>
            );
          })
        )}
      </section>

      <div className={styles.ctaWrap}>
        <button
          type="button"
          className={`${styles.cta} ${amount ? styles.ctaReady : ''}`}
          onClick={save}
        >
          추가!
        </button>
      </div>

      {keypadOpen && (
        <Sheet label="금액 입력" onClose={() => setKeypadOpen(false)}>
          <div className={styles.keypadHead}>
            <span className={styles.keypadLabel}>금액</span>
            <span className={`${styles.keypadValue} tabular`}>{won(amount || '0')}원</span>
          </div>
          <Keypad onPress={(k) => setAmount((a) => applyKey(a, k))} />
          <button type="button" className={styles.done} onClick={() => setKeypadOpen(false)}>
            완료
          </button>
        </Sheet>
      )}

      {popup && popupCategory && (
        <CategoryPopup
          category={popupCategory}
          origin={popup}
          closing={closing}
          amount={amount}
          sub={sub}
          memo={memo}
          payments={DEFAULT_PAYMENTS}
          paymentId={paymentId}
          onSelectSub={setSub}
          onMemoChange={setMemo}
          onSelectPayment={setPaymentId}
          onSave={save}
          onClose={closePopup}
        />
      )}

      {toast && <Toast text={toast} />}
    </div>
  );
}
