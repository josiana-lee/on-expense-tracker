import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Keypad, applyKey } from './Keypad';
import { ClearAmount } from './ClearAmount';
import { DatePicker } from './DatePicker';
import { InstallmentChips } from './InstallmentChips';
import { Sheet } from './Sheet';
import { rememberCategoryPayment } from '../db/categories';
import { parseDateStr } from '../db/date';
import { addExpense, deleteExpense, updateExpense } from '../db/expenses';
import {
  InstallmentRangeError,
  addInstallment,
  applyMonthKey,
  deleteInstallmentGroup,
  installmentLabel,
  installmentPreview,
  isInstallment,
  listInstallmentGroup,
  splitInstallment,
  supportsInstallment,
  updateInstallmentGroup,
} from '../db/installments';
import type { DateStr, ExpenseRecord } from '../db/types';
import { toMinor } from '../db/types';
import { useCatalog } from '../hooks/useCatalog';
import { useGuardedAction } from '../hooks/useGuardedAction';
import { useSettings } from '../hooks/useSettings';
import { amountSize, won } from '../lib/format';
import { blurOnEnter } from '../lib/keyboard';
import styles from './EntrySheet.module.css';

/** TabBar의 달력 탭과 같은 path. 같은 뜻(날짜)을 가리키는 자리라 아이콘도
 *  같은 걸 쓴다. */
const CALENDAR_ICON = 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13H4zM4 10h16M8 3v4M16 3v4';

type Props = {
  /** An existing row to edit, or null to create one on `date`. */
  record: ExpenseRecord | null;
  /** Which day a newly created record lands on. */
  date: DateStr;
  onClose: () => void;
  onDone: (message: string) => void;
};

/** Records made here carry the current clock time. For today that is exactly
 *  right; for a past or future day the time is arbitrary but harmless, since
 *  nothing in the app groups by time of day. */
function stampFor(date: DateStr): Date {
  const now = new Date();
  const d = parseDateStr(date);
  d.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return d;
}

export function EntrySheet({ record, date, onClose, onDone }: Props) {
  const { categories, homeCategories, byId, payments, paymentById } = useCatalog();
  const settings = useSettings();
  const editing = record !== null;

  /* 할부 회차는 혼자 고칠 수 없다. 금액을 하나만 바꾸면 회차 합이 결제
     총액과 어긋나는데, 그 상태를 화면에 설명할 방법이 없다 — 사용자는
     달력에서 숫자가 안 맞는 것만 보게 된다. 그래서 회차 금액은 잠그고, 나머지
     항목은 고치되 묶음 전체에 똑같이 적용한다. 회차마다 카테고리가 다른
     할부는 읽을 수 없다. */
  /* 좁힌 행을 통째로 들고 있는다. isInstallment가 타입 술어라 여기서 좁혀지고,
     아래에서 `record.installmentMonths!` 같은 단언을 쓸 일이 없어진다. */
  const installmentRow = record !== null && isInstallment(record) ? record : null;
  const installmentId = installmentRow?.installmentId ?? null;
  const installment = installmentRow !== null;
  const installmentNote = record ? installmentLabel(record) : null;

  const [amount, setAmount] = useState(record ? String(record.amount) : '');
  const [subLabel, setSubLabel] = useState(record?.subLabel);
  const [memo, setMemo] = useState(record?.memo ?? '');
  const { busy, guard } = useGuardedAction();

  /* 날짜를 이 자리에서 바로 고친다. 전에는 새로 넣을 때든 이미 있는 기록을
     고칠 때든 날짜를 볼 수도 바꿀 수도 없었다 — 하루치를 몰아 늦은 밤에
     적다가 자정을 넘기면 그 뒤로 넣은 기록이 전부 다음 날로 붙었는데,
     한 번 저장되면 고칠 방법이 없었다. updateExpense는 이미 date를 받으므로
     막고 있던 건 이 화면뿐이었다. */
  const [pickedDate, setPickedDate] = useState<DateStr>(record?.date ?? date);
  const [dateOpen, setDateOpen] = useState(false);

  /* Defaults are derived, not seeded into state. The catalog and settings
     arrive a frame after mount, and a useState initialiser only ever runs on
     that first frame — freezing the fallbacks there left new records with no
     payment method, which the save guard then rejected. */
  const [pickedCategory, setPickedCategory] = useState<string | null>(record?.categoryId ?? null);
  const [pickedPayment, setPickedPayment] = useState<string | null>(
    record?.paymentMethodId ?? null,
  );

  const categoryId = pickedCategory ?? homeCategories[0]?.id ?? 'etc';
  const category = byId.get(categoryId);

  /* 이 카테고리로 마지막에 낸 결제수단이 있고 아직 고를 수 있는 목록에 있으면
     그걸 기본값으로 쓴다. 기존 기록을 고칠 때는 적용되지 않는다 —
     pickedPayment가 record.paymentMethodId로 이미 채워져 있어서 이 자리까지
     오지 않는다. 카드를 지워도 lastPaymentMethodId는 남을 수 있어서
     (archivePaymentMethod가 정리하지 않는다) 목록에 있는지부터 확인한다. */
  const rememberedPaymentId = category?.lastPaymentMethodId;
  const rememberedPayment =
    rememberedPaymentId && payments.some((p) => p.id === rememberedPaymentId)
      ? rememberedPaymentId
      : undefined;

  const paymentId =
    pickedPayment ?? rememberedPayment ?? settings?.defaultPaymentMethodId ?? payments[0]?.id ?? '';

  /* 할부 회차를 고칠 때는 신용카드만 고르게 한다.
   *
   *  카드를 잘못 적었다가 다른 카드로 바로잡는 건 정상적인 수정이고 그대로
   *  된다. 막는 건 현금·체크카드로 옮기는 것뿐이다 — 나눠 내는 현금 결제는
   *  없는데, 달력에는 "3개월 할부 1/2 · 현금"이라고 남는다. 금액이 틀리는
   *  건 아니지만 사용자 눈에는 앱이 고장난 것으로 보인다.
   *
   *  지금 붙어 있는 결제수단은 신용카드가 아니어도 남긴다. 예전 백업을
   *  복원했거나 카드를 체크카드로 바꾼 경우, 목록에서 빠지면 지금 무엇으로
   *  기록돼 있는지가 화면에서 사라진다. */
  const payChoices = installment
    ? payments.filter((p) => supportsInstallment(p) || p.id === paymentId)
    : payments;

  /* 개월 수는 고칠 때도 바꿀 수 있다. 예전엔 새로 넣을 때만 열어뒀는데, 그러면
     3개월을 5개월로 잘못 넣은 사람이 할 수 있는 일이 "지우고 처음부터 다시"뿐이다.
     이미 넣은 일반 지출을 뒤늦게 할부로 바꾸는 길도 같은 이유로 막혀 있었다.
     회차 구조가 바뀌면 행을 다시 만들어야 하는 건 맞지만, 그건 앱이 대신 할 일이지
     사용자가 손으로 지웠다 넣을 일이 아니다 — submit()이 그 경우를 처리한다. */
  /* 개월 수도 금액처럼 문자열로 들고 있는다. 반쯤 친 값이 숫자로 접히면
     "1"에서 "12"로 가는 중간에 1개월=일시불로 읽혀서 칸이 사라진다. */
  const [monthText, setMonthText] = useState(
    installmentRow ? String(installmentRow.installmentMonths) : '',
  );
  const months = Number(monthText) || 1;

  /* 숫자판 하나가 금액과 개월 수를 나눠 친다. 이 값이 지금 어느 칸을 치고
     있는지고, 칸을 탭하면 옮겨간다.
     개월 수를 받으려고 시트를 또 띄우지 않기 위한 구조다 — 이 화면은 이미
     바텀시트라, 그 위에 시트를 올리면 스크림과 둥근 모서리가 두 겹이 되고
     어느 쪽이 지금 화면인지 읽히지 않는다. 입력 탭은 화면 위에 시트가
     하나뿐이라 거기선 시트를 그대로 쓴다. */
  const [target, setTarget] = useState<'amount' | 'months'>('amount');

  /* 개월 칸을 막 잡았을 때는 첫 숫자가 기존 값을 밀어낸다. 3개월을 6개월로
     바꾸려고 6을 누르면 36개월이 되는 걸 막는다 — 칸을 탭하는 건 숫자를
     덧붙이겠다는 게 아니라 바꾸겠다는 뜻이다. 이어서 누르는 숫자는 정상으로
     붙으므로 1→2로 12개월도 그대로 된다.
     지우기는 예외다. 기존 값을 한 자씩 지우려는 것이므로 밀어내지 않는다. */
  const [monthsPristine, setMonthsPristine] = useState(true);

  const aimAtMonths = () => {
    setTarget('months');
    setMonthsPristine(true);
  };

  const canInstall = supportsInstallment(paymentById.get(paymentId));

  /* 시트의 미리보기는 총액 기준이어야 한다. 회차 금액을 넘기면 "30만원을
     3개월로"가 아니라 "10만원을 3개월로" 나눈 값이 보인다. installmentTotal은
     예전 백업에서 복원한 행에 없을 수 있어서, 그때는 회차 금액 × 원래 회차 수로
     어림한다 — 나머지 몇 원 차이는 미리보기에서만 쓰인다. */
  const installmentTotal = installmentRow
    ? (installmentRow.installmentTotal ?? Number(amount) * installmentRow.installmentMonths)
    : null;
  const monthsChanged = installmentRow !== null && months !== installmentRow.installmentMonths;

  /* 개월 칸이 화면에 있나. 할부를 고르는 중이거나 이미 골라둔 상태일 때만
     나온다. 이게 참일 때만 "숫자판이 어디를 치고 있는지" 표시도 켠다 —
     칠 곳이 하나뿐이면 가리킬 것이 없다. */
  const monthsShown = canInstall && (months > 1 || target === 'months');

  /* 미리보기는 총액 기준이어야 한다. 이미 할부인 건은 화면에 적힌 금액이
     회차 금액이라 그대로 나누면 "10만원을 3개월로" 나눈 값이 보인다. */
  const preview = installmentPreview(installmentTotal ?? Number(amount), months);

  /* 아직 안 고친 할부에는 미리보기를 띄우지 않는다. 회차 설명은 .installNote가
     이미 하고 있어서, 같은 계산을 한 줄 밑에 한 번 더 읽히는 건 참견이다.
     개월 수를 건드린 순간부터는 바뀔 결과를 보여줘야 하므로 그때 나온다.
     개월 칸을 잡고 있는 동안에도 내놓는다. 숫자판 바로 위에 붙는 한 줄이라,
     작은 화면에서 금액 밑줄이 스크롤 밖으로 밀려나도 지금 무엇을 치고 있는지는
     여기서 읽힌다. */
  const showPreview =
    monthsShown && preview.text !== '' && (target === 'months' || !installment || monthsChanged);

  /* 나눌 수 없는 조합으로는 저장 버튼을 잠근다. 열어두면 화면에는 "3개월
     할부"라고 적혀 있는데 저장만 실패하는 상태가 된다. */
  const monthsBad = monthsShown && preview.bad;

  /* 할부 회차는 날짜도 고칠 수 없다. 각 회차 날짜는 최초 구매일에서
     addMonthsClamped로 계산되므로, 한 회차만 옮기면 나머지 회차와 스케줄이
     어긋난다 — 금액을 잠근 것과 같은 이유다. 새 할부(아직 저장 전)는 여기
     해당하지 않는다: months>1이어도 record가 없으면 installment는 false다. */
  const dateLocked = installment;

  /* 현금·체크카드로 옮기면 할부가 조용히 풀린다. 이미 할부로 저장된 건은
     빼둔다 — 그런 기록은 payChoices가 신용카드만 내놓아서 여기 걸릴 일이 거의
     없지만, 복원한 데이터처럼 결제수단이 신용카드가 아닌 할부가 들어오면 열자마자
     months가 1로 떨어져 "일시불로 바뀐다"는 예고가 뜬다. 연 적도 없는 사람에게
     보일 경고는 아니다.
     개월 칸이 사라지므로 숫자판도 금액으로 돌려놓는다. 안 돌려놓으면 칸은
     없는데 숫자판만 개월 수를 치고 있는 상태가 남는다. */
  useEffect(() => {
    if (canInstall) return;
    if (!installment) setMonthText('');
    setTarget('amount');
  }, [canInstall, installment]);

  const pickCategory = (id: string) => {
    setPickedCategory(id);
    // The sub-label belonged to the old category's list, so it stops applying.
    setSubLabel(undefined);
  };

  const submit = () => {
    if (!amount) {
      onDone('금액부터 입력해줘');
      return;
    }
    if (!paymentId) {
      onDone('결제수단을 먼저 만들어줘');
      return;
    }

    guard(async () => {
      try {
        const common = {
          categoryId,
          subLabel,
          // Undefined rather than '' so a cleared memo leaves no empty field
          // behind in the stored row.
          memo: memo.trim() || undefined,
          paymentMethodId: paymentId,
        };

        if (installmentId && installmentRow && monthsChanged) {
          /* 회차 수가 바뀌면 고칠 수 있는 게 아니다 — 회차마다 날짜와 금액이
             달라지므로 묶음을 지우고 새로 짠다. 순서가 중요하다: 먼저 나눠보고,
             그게 통과해야 지운다. 지운 뒤에 splitInstallment가 던지면 사용자
             기록만 사라진다.
             날짜 기준은 이 행이 아니라 1회차다. 2/3 회차를 열어놓고 개월 수를
             바꿨다고 해서 구매일이 한 달 뒤로 밀리면 안 된다. */
          const rows = await listInstallmentGroup(installmentId);
          const anchor = rows[0]?.date ?? installmentRow.date;
          const total =
            installmentRow.installmentTotal ?? rows.reduce((sum, r) => sum + r.amount, 0);

          if (months > 1) splitInstallment(total, months);
          await deleteInstallmentGroup(installmentId);

          if (months > 1) {
            await addInstallment({ ...common, total, months, at: stampFor(anchor) });
            onDone(`${months}개월 할부로 다시 나눴어`);
          } else {
            await addExpense({ ...common, amount: total, at: stampFor(anchor) });
            onDone('일시불로 바꿨어');
          }
        } else if (installmentId) {
          const changed = await updateInstallmentGroup(installmentId, common);
          onDone(`${changed}회차 모두 고쳤어`);
        } else if (record && months > 1) {
          /* 이미 넣은 일반 지출을 할부로 바꾼다. 여기 적힌 금액이 결제 총액이다 —
             회차 금액이 아니라. 위와 같은 이유로 나눠보고 나서 지운다. */
          const total = Number(amount);
          splitInstallment(total, months);
          await deleteExpense(record.id);
          await addInstallment({ ...common, total, months, at: stampFor(pickedDate) });
          onDone(`${months}개월 할부로 바꿨어`);
        } else if (record) {
          await updateExpense(record.id, {
            ...common,
            amount: toMinor(Number(amount)),
            date: pickedDate,
          });
          onDone('수정했어!');
        } else if (months > 1) {
          await addInstallment({
            ...common,
            total: Number(amount),
            months,
            at: stampFor(pickedDate),
          });
          onDone(`${months}개월 할부로 저장했어!`);
        } else {
          await addExpense({ ...common, amount: Number(amount), at: stampFor(pickedDate) });
          onDone(`${won(amount)}원 저장했어!`);
        }
        /* 저장은 이미 끝났다. 기억은 다음 기본값을 위한 부가 정보라 여기서
           실패해도 저장을 되돌리거나 실패로 알릴 일이 아니다 — InputScreen의
           같은 호출과 계약이 같다. */
        await rememberCategoryPayment(categoryId, paymentId).catch(() => {});
        onClose();
      } catch (e) {
        if (e instanceof InstallmentRangeError) onDone(e.message);
        else onDone(editing ? '수정하지 못했어' : '저장하지 못했어');
      }
    });
  };

  /* 삭제 버튼은 제목 바로 옆이라 손이 닿기 쉬운 자리인데, 눌리는 즉시
     지워지고 되돌릴 UI가 없다 — 할부면 회차 전체가 한 번에 사라진다.
     새 시트나 다이얼로그 대신 같은 버튼이 한 번 더 눌러야 확정되게 한다:
     삭제는 자주 하는 동작이 아니라서 탭 한 번 느는 게 부담스럽지 않고,
     실수로 손이 닿았을 때는 두 번째 탭까지 가지 않는다. 3초 뒤엔 저절로
     풀린다 — 무장된 채로 잊고 있다가 나중에 딴 데를 눌렀는데 지워지면
     그게 더 무섭다. */
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!confirmingDelete) return undefined;
    const t = window.setTimeout(() => setConfirmingDelete(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmingDelete]);

  const remove = () => {
    if (!record) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    guard(async () => {
      try {
        if (installmentId) {
          const removed = await deleteInstallmentGroup(installmentId);
          onDone(`${removed}회차 모두 지웠어`);
        } else {
          await deleteExpense(record.id);
          onDone('삭제했어');
        }
        onClose();
      } catch {
        onDone('삭제하지 못했어');
      }
    });
  };

  return (
    <Sheet label={editing ? '기록 수정' : '기록 추가'} onClose={onClose}>
      <div className={styles.head}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{editing ? '기록 수정' : '기록 추가'}</span>
          {/* 날짜 필. 제목 옆에 붙여 눈에 덜 띄게 둔다 — 날짜를 고치는 건
              잘못 적혔을 때만 쓰는 예외 경로라, 금액 위에 항상 보이는 줄로
              두면 3초 입력이라는 화면의 목적과 안 맞는다.

              전에는 안에 `<input type="date">`가 들어 있었다. 탭하면 OS가
              칠하는 다이얼로그가 떴는데, 동글동글한 앱 한가운데에 각진
              초록색 사각형이 나타났고 시트 위에 또 창이 뜨는 모양이었다.
              CSS가 닿지 않는 화면이라 고칠 방법이 그걸 안 쓰는 것뿐이었다.
              DatePicker가 필 바로 아래에 달력을 펼친다. */}
          <div className={styles.dateAnchor}>
            <button
              type="button"
              className={`${styles.dateChip} ${dateLocked ? styles.dateChipLocked : ''}`}
              onClick={() => setDateOpen((v) => !v)}
              disabled={dateLocked}
              aria-label={`날짜 ${pickedDate}`}
              aria-expanded={dateOpen}
            >
              <Icon path={CALENDAR_ICON} size={12} stroke="currentColor" strokeWidth={2.4} />
              <span className={styles.dateText}>{pickedDate.replace(/-/g, '. ')}.</span>
            </button>

            {dateOpen && !dateLocked && (
              <DatePicker
                value={pickedDate}
                onPick={setPickedDate}
                onClose={() => setDateOpen(false)}
              />
            )}
          </div>
        </div>
        {editing && (
          <button
            type="button"
            className={`${styles.delete} ${confirmingDelete ? styles.deleteConfirm : ''}`}
            onClick={remove}
            disabled={busy}
          >
            {confirmingDelete ? (installment ? '회차 모두 지울까?' : '지울까?') : '삭제'}
          </button>
        )}
      </div>

      <div className={styles.amountRow}>
        {/* 이름과 금액이 한 덩어리로 묶여 숫자판의 표적이 된다. 개월 칸이 같이
            떠 있을 때 탭하면 숫자판이 이쪽으로 돌아온다. 할부 회차는 금액이
            잠겨 있어서 표적이 되지 않는다.
            ClearAmount는 안에 못 넣는다 — 버튼 안의 버튼이라 바깥 형제로 둔다. */}
        <button
          type="button"
          /* 할부 회차는 금액이 잠겨 있다. 밑줄은 "여기를 치는 중"이라는
             뜻이라, 누를 수도 없고 숫자판도 없는 칸에 켜두면 고칠 수 있다는
             거짓말이 된다 — 시트를 열자마자 그 상태였다. */
          className={`${styles.amountMain} ${
            monthsShown && target === 'amount' && !installment ? styles.targetOn : ''
          }`}
          onClick={() => setTarget('amount')}
          disabled={installment}
          aria-label="금액"
        >
          <span className={styles.name}>{subLabel || category?.name}</span>
          <span className={`${styles.amount} tabular`} data-size={amountSize(amount)}>
            {won(amount || '0')}원
          </span>
        </button>
        {/* 금액을 지우는 건 "이제 금액을 치겠다"는 가장 분명한 의사표시다.
            숫자판을 같이 돌려놓지 않으면, 지우고 친 숫자가 개월 칸으로 들어가
            금액은 0원인 채 "98개월"이 되고, 저장하면 "금액부터 입력해줘"만
            반복되는 상태에 갇힌다. */}
        {amount && !installment && (
          <ClearAmount
            onClear={() => {
              setAmount('');
              setTarget('amount');
            }}
          />
        )}
      </div>

      {installment && (
        <p className={styles.installNote}>
          {installmentNote}
          {record?.installmentTotal !== undefined && ` · 총 ${won(record.installmentTotal)}원`}
          <br />
          {/* 개월 수를 건드린 순간부터는 "지금 상태" 설명이 아니라 "저장하면
              벌어질 일"을 말해야 한다. 회차가 통째로 새로 만들어지는 건
              사용자가 저장 전에 알아야 하는 일이다. */}
          {monthsChanged
            ? months > 1
              ? `저장하면 ${months}개월로 다시 나뉘어. 회차가 새로 만들어져.`
              : '저장하면 일시불 한 건으로 합쳐져.'
            : '회차 금액과 날짜는 따로 고칠 수 없어. 나머지를 고치면 모든 회차에 함께 적용돼.'}
        </p>
      )}

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

      {/* Appears once a category is picked — the list depends on which one,
          and showing an empty row before that just wastes a beat. */}
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
        onKeyDown={blurOnEnter}
      />

      <div className={styles.pays}>
        {payChoices.map((p) => (
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

      {canInstall && (
        <InstallmentChips
          months={months}
          /* 일시불로 되돌리면 개월 칸이 사라지므로 숫자판도 금액으로 돌려놓는다. */
          onCash={() => {
            setMonthText('');
            setTarget('amount');
          }}
          onOpen={aimAtMonths}
          field={{ text: monthText, active: target === 'months' }}
        />
      )}

      {showPreview && (
        <p className={`${styles.monthNote} ${preview.bad ? styles.monthNoteBad : ''}`}>
          {preview.text}
        </p>
      )}

      {/* 숫자판 하나가 두 칸을 나눠 친다.
          할부 회차는 금액이 잠겨 있어서 평소엔 숫자판을 빼둔다 — 눌러도
          저장되지 않는 키패드는 사용자 눈에 고장으로 보인다. 개월 칸을 고르면
          그 빈자리에 들어온다. 그 화면에서 고칠 수 있는 숫자가 개월 수뿐이라
          무엇을 치는 중인지 헷갈릴 일이 없다. */}
      {(!installment || target === 'months') && (
        <Keypad
          compact
          onPress={(k) => {
            if (target !== 'months') {
              setAmount((a) => applyKey(a, k));
              return;
            }
            setMonthText((t) => applyMonthKey(monthsPristine && k !== 'del' ? '' : t, k));
            setMonthsPristine(false);
          }}
        />
      )}

      <button
        type="button"
        className={styles.save}
        onClick={submit}
        disabled={busy || monthsBad}
      >
        {editing ? '수정 완료' : '추가!'}
      </button>
    </Sheet>
  );
}
