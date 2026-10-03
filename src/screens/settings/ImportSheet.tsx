import { useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { runImport, type CategoryChoice } from '../../db/importers/commit';
import type { LastImport } from '../../db/importers/undo';
import type { ImportPlan } from '../../db/importers/plan';
import { useCatalog } from '../../hooks/useCatalog';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { useLastImport } from '../../hooks/useLastImport';
import { won } from '../../lib/format';
import styles from './ImportSheet.module.css';

/** 안 가져오기를 고른 상태. 빈 문자열을 쓰는 이유는 <select>의 값이 문자열뿐이라
 *  null을 담을 수 없어서다. */
const SKIP = '';

type Props = {
  plan: ImportPlan;
  onClose: () => void;
  onDone: (message: string) => void;
  /** 기록이 들어간 뒤. 호출한 쪽이 이 시트를 닫고 "두고 갈지 되돌릴지"를 물어본다. */
  onImported: (last: LastImport) => void;
};

/** 다른 가계부 파일을 가져오기 전에 보여주는 화면.
 *
 *  복원 시트와 같은 자리에 있지만 하는 일이 반대다 — 저쪽은 덮어쓰고 이쪽은
 *  더한다. 그 차이가 글로 적혀 있어야 하는 이유는 되돌릴 수 없기 때문이다.
 *
 *  짝지을 분류만 묻는다. 저절로 맞은 것(실제 파일에서 92%)은 보여주지도 않는다 —
 *  확인할 것이 스물세 줄이면 아무도 안 읽고, 그러면 정작 골라야 하는 열 줄이
 *  묻힌다. */
export function ImportSheet({ plan, onClose, onDone, onImported }: Props) {
  const { categories } = useCatalog();
  const { busy, guard } = useGuardedAction();
  /* 아직 고르지 않은 앞 가져오기. 되돌릴 수 있는 건 마지막 하나뿐이라, 새로 가져오면
     그것은 조용히 되돌릴 수 없게 된다. */
  const pending = useLastImport();

  /* 고를 수 있는 카테고리는 쓰고 있는 것만. 보관하거나 없앤 것에 새 기록을 붙이면
     달력에 이름 없는 줄이 생긴다. */
  const pickable = useMemo(
    () => categories.filter((c) => !c.deprecated && !c.archived),
    [categories],
  );

  /* 처음 값은 "기타"로 둔다. 비워두고 고르게 하면 열 개를 다 만지기 전에는
     가져오기가 막히는데, 대부분은 몇 건짜리라 그만한 가치가 없다. 바꿀 사람은
     바꾸고, 그냥 넘길 사람은 그냥 넘긴다. 기타가 없으면(보관했으면) 있는 것 중
     첫 번째 — 없는 id를 기본값으로 두면 고르지 않은 채 목록에 없는 값이 들어간다. */
  const fallback = (pickable.find((c) => c.id === 'etc') ?? pickable[0])?.id ?? SKIP;
  const [choice, setChoice] = useState<Record<string, string>>({});
  const chosen = (name: string) => choice[name] ?? fallback;

  /* 가져오는 동안은 닫을 수 없다. 시트를 닫아도 가져오기는 계속 돌아서, 사용자는
     취소한 줄 아는데 기록이 들어온다. */
  const close = () => {
    if (!busy) onClose();
  };

  const skipCount = plan.unmatched
    .filter((u) => chosen(u.name) === SKIP)
    .reduce((sum, u) => sum + u.count, 0);

  const start = () => {
    guard(async () => {
      try {
        const choices: CategoryChoice = new Map(
          plan.unmatched.map((u) => [u.name, chosen(u.name) === SKIP ? null : chosen(u.name)]),
        );
        const out = await runImport(plan, choices);
        /* 성공 문구를 토스트로 던지고 닫지 않는다. 5천 건이 들어온 뒤에 "이게
           아니었네"가 되면 손으로 지울 수가 없어서, 바로 두고 갈지 되돌릴지
           고르는 화면으로 넘긴다. 한 건도 안 들어갔으면 되돌릴 것이 없다.
           되돌리기 정보는 방금 한 가져오기가 돌려준 것을 쓴다 — 저장소에서 "마지막
           가져오기"를 다시 읽으면, 이번에 한 건도 안 들어갔을 때 **앞** 가져오기가
           읽혀서 "방금 가져왔어!"로 뜨고 거기서 되돌리면 엉뚱한 걸 지운다. */
        if (out.last) {
          onImported(out.last);
        } else {
          onDone('가져온 기록이 없어');
          onClose();
        }
      } catch {
        /* 한 트랜잭션이라 실패했으면 아무것도 안 들어갔다 — 다시 시도해도 중복이
           생기지 않는다. */
        onDone('가져오지 못했어. 아무것도 들어가지 않았으니 다시 시도해줘');
      }
    });
  };

  return (
    <Sheet label="가져오기" onClose={close}>
      <div className={styles.title}>{plan.source} 파일에서 가져오기</div>
      <div className={styles.hint}>
        {plan.from} ~ {plan.to}
      </div>

      <div className={styles.card}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>기록</span>
          <span className={styles.rowValue}>{plan.count.toLocaleString()}건</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>지출 합계</span>
          <span className={`${styles.rowValue} tabular`}>{won(plan.spend)}원</span>
        </div>
        {plan.installmentGroups > 0 && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>할부</span>
            <span className={styles.rowValue}>{plan.installmentGroups}건</span>
          </div>
        )}
        {plan.newPayments.length > 0 && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>새로 만들 결제수단</span>
            <span className={styles.rowValue}>
              {plan.newPayments.map((p) => p.name).join(', ')}
            </span>
          </div>
        )}
      </div>

      {plan.unmatched.length > 0 && (
        <>
          {/* 여기만 사용자가 할 일이다. 나머지는 이미 정해져 있다. */}
          <div className={styles.sectionTitle}>
            못 알아본 분류 {plan.unmatched.length}개를 어디에 넣을까?
          </div>
          <div className={styles.card}>
            {plan.unmatched.map((u) => (
              <div key={u.name} className={styles.row}>
                <span className={styles.mapName}>
                  {u.name}
                  <span className={styles.mapCount}>{u.count}건</span>
                </span>
                <select
                  className={styles.select}
                  value={chosen(u.name)}
                  onChange={(e) => setChoice((c) => ({ ...c, [u.name]: e.target.value }))}
                  aria-label={`${u.name}을 넣을 카테고리`}
                >
                  {pickable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {/* 카드대금처럼 지출이 아닌 분류가 있다. 넣으면 같은 돈이
                      두 번 세어지므로 빼는 길을 둔다. */}
                  <option value={SKIP}>가져오지 않기</option>
                </select>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 수입은 일부러 안 넣는다. 말 없이 빼면 건수가 안 맞는 이유를 사용자가 모른다. */}
      {plan.income > 0 && (
        <div className={styles.warnBox}>
          수입 {plan.income.toLocaleString()}건은 지출 가계부라 가져오지 않아.
        </div>
      )}

      {plan.skipped > 0 && (
        <div className={styles.warnBox}>
          {plan.skipped.toLocaleString()}건은 읽지 못했어. 날짜나 금액을 알 수 없거나, 이체처럼
          지출이 아닌 기록이야.
        </div>
      )}

      {skipCount > 0 && (
        <div className={styles.warnBox}>{skipCount}건은 가져오지 않을 거야.</div>
      )}

      <div className={styles.warnBox}>
        지금 기록은 그대로 두고 더해져. 전에 넣은 기록과 겹치는 파일이면 겹친 만큼 두 번
        들어가니까 조심해줘.
      </div>

      {pending && (
        <div className={styles.warnBox}>
          앞서 가져온 {pending.count.toLocaleString()}건은 아직 되돌릴 수 있어. 지금 가져오면
          그건 되돌릴 수 없게 되고, 이번에 가져온 것만 되돌릴 수 있어.
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={close} disabled={busy}>
          취소
        </button>
        <button type="button" className={styles.confirm} onClick={start} disabled={busy}>
          {busy ? '가져오는 중…' : '가져오기'}
        </button>
      </div>
    </Sheet>
  );
}
