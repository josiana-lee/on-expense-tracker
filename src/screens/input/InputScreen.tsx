import { useCallback, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { ClearAmount } from '../../components/ClearAmount';
import { Keypad, applyKey } from '../../components/Keypad';
import { Sheet } from '../../components/Sheet';
import { Toast } from '../../components/Toast';
import { addExpense } from '../../db/expenses';
import { useCatalog } from '../../hooks/useCatalog';
import { useDayExpenses } from '../../hooks/useExpenses';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { useNow } from '../../hooks/useNow';
import { useSettings } from '../../hooks/useSettings';
import { useToast } from '../../hooks/useToast';
import { amountSize, dateText, timeText, won } from '../../lib/format';
import { offsetFromShellCentre, useShell } from '../../shell/ShellContext';
import { CategoryPopup, type PopupOrigin } from './CategoryPopup';
import styles from './InputScreen.module.css';

/** Where a bare "추가!" press files an entry when nothing was ever confirmed
 *  in a category popup. */
const FALLBACK_CATEGORY = 'etc';

const POPUP_EXIT_MS = 250;


type PopupState = PopupOrigin & { categoryId: string };

export function InputScreen() {
  const now = useNow();
  const shell = useShell();
  const { homeCategories, byId, payments, paymentById } = useCatalog();
  const settings = useSettings();
  const { records, total } = useDayExpenses(now);
  const { text: toast, flash } = useToast();
  const { busy: saving, guard } = useGuardedAction();

  const [amount, setAmount] = useState('');
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<number | undefined>(undefined);

  /* Tapping an icon only opens a popup to review it — nothing is written
   *  anywhere yet. "입력 완료" inside the popup commits that pick into these
   *  four, which is what "추가!" actually saves. Two separate actions, on
   *  purpose: picking a category and saving the expense are not the same
   *  step, so a cancelled popup can never leak into the next record.
   *
   *  Payment is here too, even though it also has its own always-visible
   *  chips on the main screen. Those chips commit immediately — there's
   *  nothing to cancel out there. But the popup carries a redundant copy of
   *  the same chips for convenience, and *that* copy has to behave like the
   *  rest of the popup: tapping it inside a popup you go on to cancel must
   *  leave the outer selection untouched. */
  const [stagedCategoryId, setStagedCategoryId] = useState<string | null>(null);
  const [stagedSub, setStagedSub] = useState<string | null>(null);
  const [stagedMemo, setStagedMemo] = useState('');
  const [stagedPaymentId, setStagedPaymentId] = useState<string | null>(null);

  /** Live only while a popup is open — what the user is currently editing,
   *  before they press "입력 완료". Reopening the already-staged category
   *  resumes its sub/memo; opening a different one starts those blank. The
   *  payment draft always starts from the current staged payment, since it
   *  isn't tied to any one category. */
  const [draftSub, setDraftSub] = useState<string | null>(null);
  const [draftMemo, setDraftMemo] = useState('');
  const [draftPayment, setDraftPayment] = useState<string | null>(null);

  const paymentId =
    stagedPaymentId ?? settings?.defaultPaymentMethodId ?? payments[0]?.id ?? null;

  const openPopup = useCallback(
    (categoryId: string, el: HTMLElement) => {
      window.clearTimeout(exitTimer.current);
      setClosing(false);
      if (categoryId === stagedCategoryId) {
        setDraftSub(stagedSub);
        setDraftMemo(stagedMemo);
      } else {
        setDraftSub(null);
        setDraftMemo('');
      }
      setDraftPayment(paymentId);
      setPopup({ categoryId, ...offsetFromShellCentre(el, shell) });
    },
    [shell, stagedCategoryId, stagedSub, stagedMemo, paymentId],
  );

  /** Plays the popup back into the icon it grew from. Used both when the
   *  user cancels and right after they confirm. */
  const closePopup = useCallback(() => {
    setClosing(true);
    exitTimer.current = window.setTimeout(() => {
      setPopup(null);
      setClosing(false);
    }, POPUP_EXIT_MS);
  }, []);

  const confirmPopup = useCallback(() => {
    if (!popup) return;
    setStagedCategoryId(popup.categoryId);
    setStagedSub(draftSub);
    setStagedMemo(draftMemo);
    setStagedPaymentId(draftPayment);
    closePopup();
  }, [popup, draftSub, draftMemo, draftPayment, closePopup]);

  const save = useCallback(() => {
    if (!amount) {
      flash('금액부터 입력해줘');
      return;
    }
    if (!paymentId) {
      flash('결제수단을 먼저 만들어줘');
      return;
    }

    guard(async () => {
      try {
        await addExpense({
          amount: Number(amount),
          categoryId: stagedCategoryId ?? FALLBACK_CATEGORY,
          subLabel: stagedSub ?? undefined,
          memo: stagedMemo,
          paymentMethodId: paymentId,
        });
        flash(`${won(amount)}원 저장했어!`);
        setAmount('');
        setStagedCategoryId(null);
        setStagedSub(null);
        setStagedMemo('');
      } catch {
        flash('저장하지 못했어. 다시 눌러줘');
      }
    });
  }, [amount, paymentId, stagedCategoryId, stagedSub, stagedMemo, flash, guard]);

  const popupCategory = popup ? byId.get(popup.categoryId) : undefined;
  const stagedCategory = stagedCategoryId ? byId.get(stagedCategoryId) : undefined;
  const ctaLabel = stagedCategory
    ? `${stagedCategory.name}${stagedSub ? ` · ${stagedSub}` : ''} 추가!`
    : '추가!';

  return (
    <div className={styles.screen}>
      {/* Everything above the save button scrolls. On a 412x892 screen it all
          fits and nothing moves; on a 360x640 the user can still reach the
          grid, and the button below stays pinned either way. */}
      <div className={styles.scroller}>
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
              data-size={amountSize(amount)}
            >
              {amount ? won(amount) : '0'}
            </span>
            <span className={styles.amountUnit}>원</span>
          </div>
        </button>

        <div className={styles.grid}>
          {homeCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.cat}
              onClick={(e) => openPopup(c.id, e.currentTarget)}
            >
              <span
                className={`${styles.catBadge} ${c.id === stagedCategoryId ? styles.catBadgeOn : ''}`}
                style={{ background: c.colorHex }}
              >
                <Icon path={c.iconPath} size={26} />
              </span>
              <span className={styles.catName}>{c.name}</span>
            </button>
          ))}
        </div>

        <div className={styles.pays}>
          {payments.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setStagedPaymentId(p.id)}
              className={`${styles.pay} ${paymentId === p.id ? styles.payOn : ''}`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <section className={styles.today}>
          <div className={styles.todayHead}>
            <span className={styles.todayLabel}>오늘 기록</span>
            <span className={`${styles.todayTotal} tabular`}>{won(total)}원</span>
          </div>
          {records.length === 0 ? (
            <p className={styles.empty}>아직 오늘 기록이 없어</p>
          ) : (
            records.map((r) => {
              const cat = byId.get(r.categoryId);
              const pay = paymentById.get(r.paymentMethodId);
              return (
                <div key={r.id} className={styles.row}>
                  <span className={styles.rowBadge} style={{ background: cat?.colorHex }}>
                    {cat && <Icon path={cat.iconPath} size={15} strokeWidth={2} />}
                  </span>
                  <span className={styles.rowName}>{r.subLabel || cat?.name}</span>
                  <span className={styles.rowMeta}>
                    {r.time} · {pay?.name}
                  </span>
                  <span className={`${styles.rowAmount} tabular`}>{won(r.amount)}</span>
                </div>
              );
            })
          )}
        </section>

        {/* The ad slot is out for the first release. AdFit only registers an
            Android placement against a live Play Store URL, so there is no ad
            unit to show until after launch — and a "광고 영역" placeholder with
            nothing in it just reads as unfinished. Restore <AdSlot /> here,
            below 오늘 기록 per design-brief §6, once a real unit exists; its
            height should then match AdFit's banner rather than the 52px
            AdMob-standard guess it reserves today. */}
      </div>

      <div className={styles.ctaWrap}>
        <button
          type="button"
          className={`${styles.cta} ${amount ? styles.ctaReady : ''}`}
          onClick={save}
          disabled={saving}
        >
          <span className={styles.ctaLabel}>{ctaLabel}</span>
        </button>
      </div>

      {keypadOpen && (
        <Sheet label="금액 입력" onClose={() => setKeypadOpen(false)}>
          {/* Clear sits right after the amount rather than in the keypad,
              which has no free slot and, more to the point, is not where the
              user is looking — noticing a wrong amount means reading it. */}
          <div className={styles.keypadHead}>
            <span className={styles.keypadLabel}>금액</span>
            {/* Same ladder as the card. This row is tighter — it also carries
                the label and the clear button — so at eleven digits the
                number pushed the button off the edge. */}
            <span className={`${styles.keypadValue} tabular`} data-size={amountSize(amount)}>
              {won(amount || '0')}원
            </span>
            {amount && <ClearAmount onClear={() => setAmount('')} />}
          </div>
          <Keypad onPress={(k) => setAmount((a) => applyKey(a, k))} />
          <button type="button" className={styles.done} onClick={() => setKeypadOpen(false)}>
            완료
          </button>
        </Sheet>
      )}

      {popup && popupCategory && draftPayment && (
        <CategoryPopup
          category={popupCategory}
          origin={popup}
          closing={closing}
          amount={amount}
          sub={draftSub}
          memo={draftMemo}
          payments={payments}
          paymentId={draftPayment}
          onSelectSub={setDraftSub}
          onMemoChange={setDraftMemo}
          onSelectPayment={setDraftPayment}
          onConfirm={confirmPopup}
          onClose={closePopup}
        />
      )}

      {toast && <Toast key={toast} text={toast} />}
    </div>
  );
}
