import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { ClearAmount } from '../../components/ClearAmount';
import { Keypad, applyKey } from '../../components/Keypad';
import { InstallmentSheet } from '../../components/InstallmentSheet';
import { EntrySheet } from '../../components/EntrySheet';
import { ForeignPanel } from '../../components/ForeignPanel';
import { useForeignEntry } from '../../components/useForeignEntry';
import { PaymentChips } from '../../components/PaymentChips';
import { Sheet } from '../../components/Sheet';
import { Toast } from '../../components/Toast';
import { HOME_CATEGORIES_PER_PAGE } from '../../data/categories';
import { rememberCategoryPayment } from '../../db/categories';
import { fmt } from '../../db/date';
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
import type { ExpenseRecord, RecurringRuleRecord } from '../../db/types';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { useNow } from '../../hooks/useNow';
import { useSettings } from '../../hooks/useSettings';
import { useToast } from '../../hooks/useToast';
import { amountSize, dateText, timeText, won } from '../../lib/format';
import { currencyOf } from '../../lib/currency';
import { compactRow } from '../../lib/rowText';
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
  /* 외화로 치면 환산한 원화가 곧바로 `amount`에 들어간다 — 외화는 기록에 남지 않고, 원화 금액을
     만들어 내는 입력 도구다. 시트가 닫히면 원화로 돌아간다. */
  const fx = useForeignEntry({
    open: keypadOpen,
    fxLookup: settings?.fxLookup,
    onAmount: setAmount,
  });
  const [installOpen, setInstallOpen] = useState(false);
  /** 할부 개월 수를 치는 중인 글자. 시트가 닫혀 있으면 null. 카드 칩의 "할부" 칸이 이걸 따라 바뀐다 —
   *  누르는 순간 포커스가 그 칸으로 가고, 치는 숫자가 칸에 보인다. 취소하면 칩은 원래대로 돌아온다. */
  const [installDraft, setInstallDraft] = useState<string | null>(null);
  const openInstall = () => {
    setInstallDraft(months > 1 ? String(months) : '');
    setInstallOpen(true);
  };
  const closeInstall = () => {
    setInstallOpen(false);
    setInstallDraft(null);
  };
  /** 오늘 기록에서 탭한 줄. 그 자리에서 고칠 수 있어야 한다 — 방금 잘못 넣은
   *  걸 고치려고 달력까지 건너가는 건 되돌리기가 아니라 수색이다. */
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
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

  const stagedCategory = stagedCategoryId ? byId.get(stagedCategoryId) : undefined;

  /* 이 카테고리로 마지막에 낸 결제수단이 있고, 그게 아직 고를 수 있는
     결제수단 목록에 있으면 그걸 기본값으로 쓴다. 카드를 지워도
     lastPaymentMethodId는 그대로 남을 수 있어서(archivePaymentMethod가
     정리하지 않는다) 목록에 있는지부터 확인한다 — 없으면 죽은 카드가
     조용히 선택된 것처럼 보인다. */
  const rememberedPaymentId = stagedCategory?.lastPaymentMethodId;
  const rememberedPayment =
    rememberedPaymentId && payments.some((p) => p.id === rememberedPaymentId)
      ? rememberedPaymentId
      : undefined;

  const paymentId =
    stagedPaymentId ??
    rememberedPayment ??
    settings?.defaultPaymentMethodId ??
    payments[0]?.id ??
    null;

  /* 할부는 신용카드에만 있다. 현금이나 체크카드로 나눠 낼 수는 없다. */
  const canInstall = supportsInstallment(paymentId ? paymentById.get(paymentId) : undefined);

  /* 결제수단은 이 화면의 칩에서도, 카테고리 팝업 안에서도 바뀐다. 두 경로에
     각각 되돌리는 코드를 두면 하나는 반드시 빠뜨리므로, 결과만 보고 되돌린다.
     신용카드로 3개월을 고른 뒤 현금으로 바꾸면 할부는 조용히 풀린다. */
  useEffect(() => {
    if (!canInstall && months > 1) setMonths(1);
  }, [canInstall, months]);

  /* 할부는 그 카드에 건 것이다. 삼성카드로 6개월을 걸고 현대카드를 누르면 현대카드 칩에 "6개월 할부"가
     그대로 따라와서, 건 적 없는 할부가 걸린 것처럼 보였다. 결제수단이 바뀌면 — 칩을 눌러서든, 카테고리를
     골라 마지막에 쓴 카드로 넘어가서든 — 일시불로 돌아간다. 위와 같은 이유로 바뀐 결과만 본다. */
  const lastPaymentRef = useRef(paymentId);
  useEffect(() => {
    if (lastPaymentRef.current === paymentId) return;
    lastPaymentRef.current = paymentId;
    setMonths(1);
  }, [paymentId]);

  /* 카테고리는 8개씩(4열 × 2줄) 페이지로 나눠 옆으로 넘긴다. 지금 몇 번째
     페이지인지는 스크롤 위치에서 읽는다 — 손으로 넘긴 것도 코드로 넘긴 것도
     같은 길로 점에 반영된다. */
  const pagerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const pages = Array.from(
    { length: Math.ceil(homeCategories.length / HOME_CATEGORIES_PER_PAGE) },
    (_, i) =>
      homeCategories.slice(i * HOME_CATEGORIES_PER_PAGE, (i + 1) * HOME_CATEGORIES_PER_PAGE),
  );

  const showPage = useCallback((i: number) => {
    const pager = pagerRef.current;
    const first = pager?.children[0] as HTMLElement | undefined;
    const target = pager?.children[i] as HTMLElement | undefined;
    if (!pager || !first || !target) return;
    /* 폭에 i를 곱하지 않고 그 페이지가 놓인 자리로 간다. 옆 페이지가 걸쳐
       보이게 페이지를 화면보다 좁혀 두어서 폭 × i는 어긋난다. 마지막 페이지는
       더 갈 수 없는 끝에서 브라우저가 멈춘다. */
    pager.scrollTo({ left: target.offsetLeft - first.offsetLeft, behavior: 'smooth' });
  }, []);

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

        /* 지출은 이미 저장됐다. 사용 표시도, 결제수단 기억도 정렬·기본값용
           부가 정보라 여기서 실패해도 저장을 되돌리거나 실패로 알릴 일이
           아니다. */
        if (fromTemplateId) await touchTemplate(fromTemplateId).catch(() => {});
        await rememberCategoryPayment(common.categoryId, common.paymentMethodId).catch(() => {});
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
        /* 고른 카테고리가 풀렸으니 페이지도 처음으로. 다음 지출은 늘 같은
           자리에서 시작해야 손이 기억한다. */
        showPage(0);
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
    showPage,
  ]);

  /** 저장해둔 지출을 골랐을 때. 바로 기록하지 않고 화면만 채운 뒤 시트를
   *  닫는다 — 여기는 금액을 입력하려고 연 시트고, 열자마자 기록이 생기면
   *  되돌릴 방법이 없다. 스케줄을 뺄 때 세운 기준과 같다: 빠진 기록보다
   *  잘못된 기록이 비싸다. 채워두면 "추가!"가 한 번 남는다. */
  const useTemplate = useCallback(
    (rule: RecurringRuleRecord) => {
      setAmount(templateAmountText(rule));
      setStagedCategoryId(rule.categoryId);
      /* 고른 소분류가 없으면 템플릿 이름을 대신 남긴다.
         이게 없어서 "넷플릭스"를 눌러 저장해도 기록에는 `문화생활`로만 남았고,
         나중에 "넷플릭스"로 검색하면 아무것도 안 나왔다 — 이름을 붙여 저장해둔
         이유가 통째로 사라지는 셈이다. 소분류를 골라둔 템플릿은 그 값이 이긴다:
         그건 사용자가 이 기록을 뭐라고 부를지 직접 고른 것이다. */
      setStagedSub(rule.subLabel ?? rule.name);
      setStagedMemo(rule.memo ?? '');
      setStagedPaymentId(rule.paymentMethodId);
      setFromTemplateId(rule.id);
      /* 저장해둔 지출은 일시불 금액이다. 할부를 켜둔 채로 채우면 그 금액이
         회차로 쪼개져서, 사용자가 고른 것과 다른 값이 저장된다. */
      setMonths(1);
      setKeypadOpen(false);
      /* 채운 카테고리가 뒤 페이지에 있으면 거기로 넘긴다. 안 넘기면 버튼에는
         "교육 추가!"라고 떠 있는데 화면에는 그 아이콘이 없어서, 무엇이
         골라졌는지 확인할 길이 없다. 입력 화면에서 숨긴 카테고리면 둔다. */
      const at = homeCategories.findIndex((c) => c.id === rule.categoryId);
      if (at >= 0) showPage(Math.floor(at / HOME_CATEGORIES_PER_PAGE));
    },
    [homeCategories, showPage],
  );

  const popupCategory = popup ? byId.get(popup.categoryId) : undefined;
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

        {/* 페이지가 둘 이상이면 옆 페이지 첫 열이 오른쪽 끝에 걸쳐 보이고(넘길 게
            더 있다), 아래 점이 몇 장 중 어디인지 알려준다. */}
        <div className={styles.catPager}>
          <div
            className={`${styles.catPages} ${pages.length > 1 ? styles.catPagesPeek : ''}`}
            ref={pagerRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const first = el.children[0] as HTMLElement;
              const second = el.children[1] as HTMLElement | undefined;
              /* 페이지 한 칸의 간격으로 나눈다. 옆 페이지가 걸치게 페이지를 화면보다
                 좁혀 두어서 clientWidth로 나누면 뒤로 갈수록 어긋난다. */
              if (second) {
                setPage(Math.round(el.scrollLeft / (second.offsetLeft - first.offsetLeft)));
              }
            }}
            onFocus={(e) => {
              /* 키보드나 토크백으로 다음 장 아이콘에 포커스가 가도 화면은 따라오지
                 않는다 — 브라우저가 보여주려고 미는 스크롤을 scroll-snap이 도로
                 제자리에 붙인다. 그러면 화면 밖에 있는 것을 읽고 있게 되므로
                 포커스가 간 장으로 직접 넘긴다. 손으로 누른 경우에는 이미 그 장이라
                 아무 일도 일어나지 않는다. */
              const page = e.target.parentElement;
              const at = page ? Array.from(e.currentTarget.children).indexOf(page) : -1;
              if (at >= 0) showPage(at);
            }}
          >
            {pages.map((cats, i) => (
              /* 걸쳐 보이는 아이콘도 아래 점도 눈으로만 말한다. 장이 여럿일 때는
                 읽어주는 쪽에도 몇 장 중 어디인지 남긴다. */
              <div
                key={i}
                className={styles.grid}
                role={pages.length > 1 ? 'group' : undefined}
                aria-label={pages.length > 1 ? `카테고리 ${pages.length}장 중 ${i + 1}장` : undefined}
              >
                {cats.map((c) => (
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
            ))}
          </div>
          {pages.length > 1 && (
            <div className={styles.pageDots} aria-hidden="true">
              {pages.map((_, i) => (
                <span
                  key={i}
                  className={`${styles.pageDot} ${i === page ? styles.pageDotOn : ''}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* 신용카드를 고르면 그 칩이 같은 줄 안에서 늘어나 일시불/할부를 품는다 — 줄 높이가 그대로라
            아래 오늘 기록이 흔들리지 않는다. */}
        <div className={styles.paysWrap}>
          <PaymentChips
            payments={payments}
            selectedId={paymentId}
            onSelect={setStagedPaymentId}
            installment={
              canInstall
                ? { months, draft: installDraft, onCash: () => setMonths(1), onOpen: openInstall }
                : undefined
            }
          />
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
              const line = compactRow(r, cat?.name);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={styles.row}
                  onClick={() => setEditing(r)}
                >
                  <span className={styles.rowBadge} style={{ background: cat?.colorHex }}>
                    {cat && <Icon path={cat.iconPath} size={15} strokeWidth={2} />}
                  </span>
                  <span className={styles.rowName}>{line.title}</span>
                  {/* 회차 번호까지 쓰면 이 줄은 시각·결제수단·금액까지 안고
                      있어서 이름이 먼저 잘린다. 할부라는 것만 표시하고, 몇
                      회차인지는 달력에서 본다. */}
                  {isInstallment(r) && <span className={styles.rowTag}>할부</span>}
                  {/* 세부항목은 시각·결제수단과 한 줄에 붙는다. 이 목록은 한 줄이라 아랫줄이 없다. */}
                  <span className={styles.rowMeta}>
                    {[line.sub, r.time, pay?.name].filter(Boolean).join(' · ')}
                  </span>
                  <span className={`${styles.rowAmount} tabular`}>{won(r.amount)}</span>
                </button>
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
            {amount && <ClearAmount onClear={() => (fx.active ? fx.clear() : setAmount(''))} />}
          </div>

          <ForeignPanel
            expanded={fx.expanded}
            onExpand={fx.expand}
            entry={fx.entry}
            status={fx.status}
            krwPer={fx.krwPer}
            fetched={fx.fetched}
            amount={amount}
            onPick={fx.pickCurrency}
            onEditRate={fx.editRate}
            onDoneRate={fx.doneRate}
            onAllow={fx.allow}
            onDeny={fx.deny}
          />

          {/* 저장해둔 지출. 결제수단 칩과 같이 가로로 흐르게 두는 건 열 개가
              차도 키패드를 밀어내지 않게 하려는 것 — 이 시트에서 제일 중요한
              건 여전히 숫자판이다. */}
          {/* 외화를 치는 동안은 숨긴다 — 눌러도 원화 금액으로 덮어쓸 뿐이고, 그만큼 시트가 낮아진다. */}
          {templates.length > 0 && !fx.active && (
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

          <Keypad
            /* 소수점은 소수가 있는 외화를 치거나 환율을 고칠 때만 나온다. */
            dot={fx.entry.editing === 'rate' || (fx.entry.code !== null && currencyOf(fx.entry.code).decimals > 0)}
            onPress={(k) => (fx.active ? fx.press(k) : setAmount((a) => applyKey(a, k)))}
            /* 환율을 받을지 답하기 전에는 숫자를 칠 수 없다. */
            disabled={fx.status === 'ask'}
          />
          <button type="button" className={styles.done} onClick={() => setKeypadOpen(false)}>
            완료
          </button>
        </Sheet>
      )}

      {editing && (
        <EntrySheet
          record={editing}
          date={fmt(now)}
          onClose={() => setEditing(null)}
          onDone={flash}
        />
      )}

      {installOpen && (
        <InstallmentSheet
          months={months}
          amount={amount}
          onDone={setMonths}
          onDraft={setInstallDraft}
          onClose={closeInstall}
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
