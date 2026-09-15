import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Keypad, applyKey } from './Keypad';
import { ClearAmount } from './ClearAmount';
import { InstallmentChips } from './InstallmentChips';
import { InstallmentSheet } from './InstallmentSheet';
import { Sheet } from './Sheet';
import { parseDateStr } from '../db/date';
import { addExpense, deleteExpense, updateExpense } from '../db/expenses';
import {
  InstallmentRangeError,
  addInstallment,
  deleteInstallmentGroup,
  installmentLabel,
  isInstallment,
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
     달력에서 숫자가 안 맞는 것만 보게 된다. 그래서 금액은 잠그고, 나머지
     항목은 고치되 묶음 전체에 똑같이 적용한다. 회차마다 카테고리가 다른
     할부는 읽을 수 없다. */
  /* id를 먼저 꺼낸다. isInstallment가 타입 술어라 여기서 좁혀지고, 아래에서
     `record.installmentId!` 같은 단언을 쓸 일이 없어진다. */
  const installmentId = record !== null && isInstallment(record) ? record.installmentId : null;
  const installment = installmentId !== null;
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

  /* Defaults are derived, not seeded into state. The catalog and settings
     arrive a frame after mount, and a useState initialiser only ever runs on
     that first frame — freezing the fallbacks there left new records with no
     payment method, which the save guard then rejected. */
  const [pickedCategory, setPickedCategory] = useState<string | null>(record?.categoryId ?? null);
  const [pickedPayment, setPickedPayment] = useState<string | null>(
    record?.paymentMethodId ?? null,
  );

  const categoryId = pickedCategory ?? homeCategories[0]?.id ?? 'etc';
  const paymentId = pickedPayment ?? settings?.defaultPaymentMethodId ?? payments[0]?.id ?? '';

  const category = byId.get(categoryId);

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

  /* 지난 날짜에 카드값을 뒤늦게 적는 경우가 있다. 입력 탭에만 할부가 있으면
     그 사람은 여기서 총액을 통째로 넣게 되고, 달력과 카드 청구액이 다시
     어긋난다. 수정할 때는 개월 수를 바꿀 수 없다 — 회차 구조를 바꾸는 건
     기존 행을 다시 만드는 일이라, 지우고 새로 넣는 것과 같다. */
  const [months, setMonths] = useState(1);
  const [installOpen, setInstallOpen] = useState(false);
  const canInstall = !editing && supportsInstallment(paymentById.get(paymentId));

  /* 할부 회차는 날짜도 고칠 수 없다. 각 회차 날짜는 최초 구매일에서
     addMonthsClamped로 계산되므로, 한 회차만 옮기면 나머지 회차와 스케줄이
     어긋난다 — 금액을 잠근 것과 같은 이유다. 새 할부(아직 저장 전)는 여기
     해당하지 않는다: months>1이어도 record가 없으면 installment는 false다. */
  const dateLocked = installment;

  useEffect(() => {
    if (!canInstall && months > 1) setMonths(1);
  }, [canInstall, months]);

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
        if (installmentId) {
          const changed = await updateInstallmentGroup(installmentId, {
            categoryId,
            subLabel,
            memo: memo.trim() || undefined,
            paymentMethodId: paymentId,
          });
          onDone(`${changed}회차 모두 고쳤어`);
        } else if (record) {
          await updateExpense(record.id, {
            amount: toMinor(Number(amount)),
            categoryId,
            subLabel,
            // Undefined rather than '' so a cleared memo leaves no empty field
            // behind in the stored row.
            memo: memo.trim() || undefined,
            paymentMethodId: paymentId,
            date: pickedDate,
          });
          onDone('수정했어!');
        } else if (months > 1) {
          await addInstallment({
            total: Number(amount),
            months,
            categoryId,
            subLabel,
            memo,
            paymentMethodId: paymentId,
            at: stampFor(pickedDate),
          });
          onDone(`${months}개월 할부로 저장했어!`);
        } else {
          await addExpense({
            amount: Number(amount),
            categoryId,
            subLabel,
            memo,
            paymentMethodId: paymentId,
            at: stampFor(pickedDate),
          });
          onDone(`${won(amount)}원 저장했어!`);
        }
        onClose();
      } catch (e) {
        if (e instanceof InstallmentRangeError) onDone(e.message);
        else onDone(editing ? '수정하지 못했어' : '저장하지 못했어');
      }
    });
  };

  const remove = () => {
    if (!record) return;
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
          {/* 안은 네이티브 날짜 picker다 — 탭하면 안드로이드 기본 달력 UI가
              그대로 뜬다. 입력 탭의 "이 시각으로 기록돼" 도장과 같은
              필(브랜드 연보라 배경 + 브랜드색 글자) 모양으로 감싸서, 순수
              OS 위젯의 각진 인상을 지운다. 제목 옆에 붙여 눈에 덜 띄게 둔다:
              날짜를 고치는 건 잘못 적혔을 때만 쓰는 예외 경로라, 금액 위에
              항상 보이는 줄로 두면 3초 입력이라는 화면의 목적과 안 맞는다.
              value/onChange은 'YYYY-MM-DD' 문자열을 주고받고, fmt()가 만드는
              DateStr과 형식이 같아서 변환이 필요 없다. 빈 문자열이 올 수 있는
              경우(입력칸을 지웠을 때)는 무시해 pickedDate가 빈 값이 되지
              않게 한다. */}
          <div className={`${styles.dateChip} ${dateLocked ? styles.dateChipLocked : ''}`}>
            <Icon path={CALENDAR_ICON} size={12} stroke="currentColor" strokeWidth={2.4} />
            <input
              type="date"
              className={styles.dateInput}
              value={pickedDate}
              onChange={(e) => e.target.value && setPickedDate(e.target.value)}
              disabled={dateLocked}
              aria-label="날짜"
            />
          </div>
        </div>
        {editing && (
          <button type="button" className={styles.delete} onClick={remove} disabled={busy}>
            삭제
          </button>
        )}
      </div>

      <div className={styles.amountRow}>
        <span className={styles.name}>{subLabel || category?.name}</span>
        <span className={`${styles.amount} tabular`} data-size={amountSize(amount)}>
          {won(amount || '0')}원
        </span>
        {amount && !installment && <ClearAmount onClear={() => setAmount('')} />}
      </div>

      {installment && (
        <p className={styles.installNote}>
          {installmentNote}
          {record?.installmentTotal !== undefined && ` · 총 ${won(record.installmentTotal)}원`}
          <br />
          금액과 날짜는 회차별로 고칠 수 없어. 나머지를 고치면 모든 회차에 함께 적용돼.
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
          onCash={() => setMonths(1)}
          onOpen={() => setInstallOpen(true)}
        />
      )}

      {/* 할부는 금액을 잠그므로 숫자판도 뺀다. 눌러도 저장되지 않는 키패드는
          사용자 눈에 고장으로 보인다. */}
      {!installment && <Keypad compact onPress={(k) => setAmount((a) => applyKey(a, k))} />}

      <button type="button" className={styles.save} onClick={submit} disabled={busy}>
        {editing ? '수정 완료' : '추가!'}
      </button>

      {/* 시트 위의 시트. Sheet는 shell로 포털되고 나중에 마운트된 쪽이 DOM
          순서에서 뒤에 오므로, z-index가 같아도 새 시트가 앞에 선다. 뒤로
          가기도 스택의 맨 위가 가져간다. */}
      {installOpen && (
        <InstallmentSheet
          months={months}
          amount={amount}
          onDone={setMonths}
          onClose={() => setInstallOpen(false)}
        />
      )}
    </Sheet>
  );
}
