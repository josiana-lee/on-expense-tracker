import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { ClearAmount } from '../../components/ClearAmount';
import { Keypad, applyKey } from '../../components/Keypad';
import { InstallmentChips } from '../../components/InstallmentChips';
import { InstallmentSheet } from '../../components/InstallmentSheet';
import { Sheet } from '../../components/Sheet';
import { Toast } from '../../components/Toast';
import { addExpense } from '../../db/expenses';
import {
  InstallmentRangeError,
  addInstallment,
  isInstallment,
  supportsInstallment,
} from '../../db/installments';
import { useCatalog } from '../../hooks/useCatalog';
import { useDayExpenses } from '../../hooks/useExpenses';
import { useVisibleRecurringRules } from '../../hooks/useRecurringRules';
import { templateAmountText, touchTemplate } from '../../db/recurring';
import type { RecurringRuleRecord } from '../../db/types';
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
  const templates = useVisibleRecurringRules();
  const { text: toast, flash } = useToast();
  const { busy: saving, guard } = useGuardedAction();

  const [amount, setAmount] = useState('');
  /** 1이면 일시불. 그 위는 할부 개월 수. */
  const [months, setMonths] = useState(1);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<number | undefined>(undefined);

  /* Tapping an icon only opens a popup to review it — nothing is written
   *  anywhere yet. "입력 완료" inside the popup commits that pick into these
   *  three, which is what "추가!" actually saves. Two separate actions, on
   *  purpose: picking a category and saving the expense are not the same
   *  step, so a cancelled popup can never leak into the next record.
   *
   *  결제수단은 여기 없다. 팝업에도 같은 칩을 한 벌 더 두었다가 뺐다 — 메인
   *  화면 칩이 늘 보이는 자리에 있어서 중복이었고, 그 사본만 "취소하면
   *  되돌아가야 하는" 초안 상태를 따로 들고 있어야 했다. 결제수단은
   *  카테고리에 딸린 값이 아니라 화면 전체의 값이라 바로 확정해도 된다. */
  const [stagedCategoryId, setStagedCategoryId] = useState<string | null>(null);
  const [stagedSub, setStagedSub] = useState<string | null>(null);
  const [stagedMemo, setStagedMemo] = useState('');
  const [stagedPaymentId, setStagedPaymentId] = useState<string | null>(null);

  /** 저장해둔 지출로 채웠다면 그게 어느 것이었는지. 저장이 끝난 뒤에 "썼다"고
   *  표시하려고 들고 있는다. 채운 뒤 금액을 고쳐도 그대로 두는 건, 이 값이
   *  정확한 이력이 아니라 목록 정렬용 신호이기 때문이다 — 손이 간 건 맞다. */
  const [fromTemplateId, setFromTemplateId] = useState<string | null>(null);

  /** Live only while a popup is open — what the user is currently editing,
   *  before they press "입력 완료". Reopening the already-staged category
   *  resumes its sub/memo; opening a different one starts those blank. */
  const [draftSub, setDraftSub] = useState<string | null>(null);
  const [draftMemo, setDraftMemo] = useState('');

  const paymentId =
    stagedPaymentId ?? settings?.defaultPaymentMethodId ?? payments[0]?.id ?? null;

  /* 할부는 신용카드에만 있다. 현금이나 체크카드로 나눠 낼 수는 없다. */
  const canInstall = supportsInstallment(paymentId ? paymentById.get(paymentId) : undefined);

  /* 결제수단은 이 화면의 칩에서도, 카테고리 팝업 안에서도 바뀐다. 두 경로에
     각각 되돌리는 코드를 두면 하나는 반드시 빠뜨리므로, 결과만 보고 되돌린다.
     신용카드로 3개월을 고른 뒤 현금으로 바꾸면 할부는 조용히 풀린다. */
  useEffect(() => {
    if (!canInstall && months > 1) setMonths(1);
  }, [canInstall, months]);

  /* 떠 있는 할부 칩을 지금 고른 카드 바로 아래에 붙인다. 결제수단 줄 왼쪽 끝에
     두면 세 번째 카드를 골랐을 때 칩이 화면 반대편에 떠 있어서, 무엇에 딸린
     선택인지 보이지 않는다.

     CSS로는 못 한다 — 몇 번째 칩이 선택됐는지, 그 칩이 얼마나 넓은지, 줄이
     옆으로 얼마나 밀렸는지는 그려봐야 안다. 그래서 재서 넣는다. */
  const paysWrapRef = useRef<HTMLDivElement>(null);
  const installFloatRef = useRef<HTMLDivElement>(null);
  const [floatLeft, setFloatLeft] = useState(0);

  useLayoutEffect(() => {
    if (!canInstall) return undefined;
    const wrap = paysWrapRef.current;
    const float = installFloatRef.current;
    const chip = wrap?.querySelector<HTMLElement>('[data-pay-on]');
    const pays = chip?.parentElement;
    if (!wrap || !float || !chip || !pays) return undefined;

    const place = () => {
      /* getBoundingClientRect가 아니라 offsetLeft를 쓴다. 결제수단 칩은
         선택되는 순간 chipPop 애니메이션으로 1.14배까지 커지는데, 그 도중에
         다시 재면(카드를 누른 직후 줄을 미는 건 흔하다) 확대된 사각형을
         재서 어긋난 값이 그대로 굳는다. offsetLeft는 transform을 타지 않는다.
         offsetParent가 .paysWrap(position: relative)이라 그대로 wrap 기준이다. */
      const x = chip.offsetLeft - pays.scrollLeft;
      /* 오른쪽 끝 카드를 고르면 칩이 본문 밖으로 나간다. 안쪽으로 당긴다. */
      const max = Math.max(0, wrap.clientWidth - float.offsetWidth);
      setFloatLeft(Math.min(Math.max(0, x), max));
    };

    place();
    // 결제수단 줄은 옆으로 스크롤된다. 밀면 붙어 있던 칩이 따라가야 한다.
    pays.addEventListener('scroll', place, { passive: true });

    /* 폭이 바뀌어도 다시 잰다. 둘을 따로 봐야 한다.

       wrap: 접는 폰을 펼치거나 화면을 돌리면 셸이 넓어져 오른쪽 한계가 달라진다.
       chip: 칩 자체의 폭. 웹폰트가 늦게 떠서 바뀌는 게 여기다 — Pretendard의
       한글 폭이 폴백보다 좁아서, 폴백으로 먼저 그려진 뒤 스왑되면 세 번째
       카드 기준 10px 넘게 밀린다. wrap은 flex 자식이라 폭이 컬럼에 맞춰
       고정이고 칩이 바뀌어도 꿈쩍하지 않으므로, wrap만 봐서는 이걸 못 잡는다. */
    const observer = new ResizeObserver(place);
    observer.observe(wrap);
    observer.observe(chip);

    return () => {
      pays.removeEventListener('scroll', place);
      observer.disconnect();
    };
    /* months가 바뀌면 "할부"가 "3개월 할부"로 넓어져서 오른쪽 한계가 달라지고,
       payments가 바뀌면(카드 이름 변경·추가) 칩의 폭과 자리가 달라진다. */
  }, [canInstall, paymentId, months, payments]);


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
      setPopup({ categoryId, ...offsetFromShellCentre(el, shell) });
    },
    [shell, stagedCategoryId, stagedSub, stagedMemo],
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
    closePopup();
  }, [popup, draftSub, draftMemo, closePopup]);

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
      const common = {
        categoryId: stagedCategoryId ?? FALLBACK_CATEGORY,
        subLabel: stagedSub ?? undefined,
        memo: stagedMemo,
        paymentMethodId: paymentId,
      };
      try {
        /* 할부는 회차마다 한 건씩, 다음 달들에 미리 적힌다. 나눠서 표시하는
           게 아니라 실제 기록이라 달력·예산·카드 청구액이 저절로 맞는다. */
        if (months > 1) await addInstallment({ ...common, total: Number(amount), months });
        else await addExpense({ ...common, amount: Number(amount) });

        /* 지출은 이미 저장됐다. 사용 표시는 정렬용 부가 정보라 여기서
           실패해도 저장을 되돌리거나 실패로 알릴 일이 아니다. */
        if (fromTemplateId) await touchTemplate(fromTemplateId).catch(() => {});
        flash(
          months > 1 ? `${months}개월 할부로 저장했어!` : `${won(amount)}원 저장했어!`,
        );
        setAmount('');
        setMonths(1);
        setStagedCategoryId(null);
        setStagedSub(null);
        setStagedMemo('');
        /* 결제수단도 기본값으로 되돌린다. 여기만 빠져 있어서, 카드로 한 건
           넣은 뒤 한참 있다 현금 지출을 적으면 조용히 그 카드로 기록됐다.
           설정의 기본 결제수단이 이미 "새 기록은 여기서 시작한다"는 뜻이라,
           주로 쓰는 카드를 기본값으로 둔 사람은 이 초기화로 잃는 게 없다. */
        setStagedPaymentId(null);
        setFromTemplateId(null);
      } catch (e) {
        /* 금액이 회차 수보다 적을 때. 왜 안 되는지 말해주지 않으면 사용자는
           같은 버튼을 계속 누른다. */
        if (e instanceof InstallmentRangeError) flash(e.message);
        else flash('저장하지 못했어. 다시 눌러줘');
      }
    });
  }, [
    amount,
    months,
    paymentId,
    stagedCategoryId,
    stagedSub,
    stagedMemo,
    fromTemplateId,
    flash,
    guard,
  ]);

  /** 저장해둔 지출을 골랐을 때. 바로 기록하지 않고 화면만 채운 뒤 시트를
   *  닫는다 — 여기는 금액을 입력하려고 연 시트고, 열자마자 기록이 생기면
   *  되돌릴 방법이 없다. 스케줄을 뺄 때 세운 기준과 같다: 빠진 기록보다
   *  잘못된 기록이 비싸다. 채워두면 "추가!"가 한 번 남는다. */
  const useTemplate = useCallback(
    (rule: RecurringRuleRecord) => {
      setAmount(templateAmountText(rule));
      setStagedCategoryId(rule.categoryId);
      setStagedSub(rule.subLabel ?? null);
      setStagedMemo(rule.memo ?? '');
      setStagedPaymentId(rule.paymentMethodId);
      setFromTemplateId(rule.id);
      /* 저장해둔 지출은 일시불 금액이다. 할부를 켜둔 채로 채우면 그 금액이
         회차로 쪼개져서, 사용자가 고른 것과 다른 값이 저장된다. */
      setMonths(1);
      setKeypadOpen(false);
    },
    [],
  );

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

        {/* 할부 칩을 감싸는 기준. 흐름에 넣으면 이 화면이 통째로 움직인다 —
            scroller가 space-between이라 flex 자식이 하나 늘어나는 순간 열 전체가
            다시 배분되고, 금액 카드까지 위로 밀린다. 카드를 골랐을 뿐인데 화면이
            흔들리는 것으로 보인다. */}
        <div className={styles.paysWrap} ref={paysWrapRef}>
          <div className={styles.pays}>
            {payments.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setStagedPaymentId(p.id)}
                className={`${styles.pay} ${paymentId === p.id ? styles.payOn : ''}`}
                data-pay-on={paymentId === p.id ? '' : undefined}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* 결제수단 바로 아래에 떠 있다. 신용카드를 고른 순간 나타난다 —
              할부는 금액이 아니라 결제수단에 딸린 선택이다. */}
          {canInstall && (
            <div className={styles.installFloat} ref={installFloatRef} style={{ left: floatLeft }}>
              <InstallmentChips
                months={months}
                onCash={() => setMonths(1)}
                onOpen={() => setInstallOpen(true)}
              />
            </div>
          )}
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
                  {/* 회차 번호까지 쓰면 이 줄은 시각·결제수단·금액까지 안고
                      있어서 이름이 먼저 잘린다. 할부라는 것만 표시하고, 몇
                      회차인지는 달력에서 본다. */}
                  {isInstallment(r) && <span className={styles.rowTag}>할부</span>}
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

          {/* 저장해둔 지출. 결제수단 칩과 같이 가로로 흐르게 두는 건 열 개가
              차도 키패드를 밀어내지 않게 하려는 것 — 이 시트에서 제일 중요한
              건 여전히 숫자판이다. */}
          {templates.length > 0 && (
            <div className={styles.templates}>
              {templates.map((t) => {
                const cat = byId.get(t.categoryId);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={styles.template}
                    onClick={() => useTemplate(t)}
                  >
                    <span
                      className={styles.templateDot}
                      style={{ background: cat?.colorHex ?? '#CFD5DE' }}
                    />
                    <span className={styles.templateName}>{t.name}</span>
                    <span className={`${styles.templateAmount} tabular`}>{won(t.amount)}</span>
                  </button>
                );
              })}
            </div>
          )}

          <Keypad onPress={(k) => setAmount((a) => applyKey(a, k))} />
          <button type="button" className={styles.done} onClick={() => setKeypadOpen(false)}>
            완료
          </button>
        </Sheet>
      )}

      {installOpen && (
        <InstallmentSheet
          months={months}
          amount={amount}
          onDone={setMonths}
          onClose={() => setInstallOpen(false)}
        />
      )}

      {popup && popupCategory && (
        <CategoryPopup
          category={popupCategory}
          origin={popup}
          closing={closing}
          amount={amount}
          sub={draftSub}
          memo={draftMemo}
          onSelectSub={setDraftSub}
          onMemoChange={setDraftMemo}
          onConfirm={confirmPopup}
          onClose={closePopup}
        />
      )}

      {toast && <Toast key={toast} text={toast} />}
    </div>
  );
}
