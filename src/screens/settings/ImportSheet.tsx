import { useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { runImport, type CategoryChoice } from '../../db/importers/commit';
import type { ImportPlan } from '../../db/importers/plan';
import { useCatalog } from '../../hooks/useCatalog';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { won } from '../../lib/format';
import styles from './ImportSheet.module.css';

/** 안 가져오기를 고른 상태. 빈 문자열을 쓰는 이유는 <select>의 값이 문자열뿐이라
 *  null을 담을 수 없어서다. */
const SKIP = '';

type Props = {
  plan: ImportPlan;
  onClose: () => void;
  onDone: (message: string) => void;
};

/** 다른 가계부 파일을 가져오기 전에 보여주는 화면.
 *
 *  복원 시트와 같은 자리에 있지만 하는 일이 반대다 — 저쪽은 덮어쓰고 이쪽은
 *  더한다. 그 차이가 글로 적혀 있어야 하는 이유는 되돌릴 수 없기 때문이다.
 *
 *  짝지을 분류만 묻는다. 저절로 맞은 것(실제 파일에서 92%)은 보여주지도 않는다 —
 *  확인할 것이 스물세 줄이면 아무도 안 읽고, 그러면 정작 골라야 하는 열 줄이
 *  묻힌다. */
export function ImportSheet({ plan, onClose, onDone }: Props) {
  const { categories } = useCatalog();
  const { busy, guard } = useGuardedAction();
  const [progress, setProgress] = useState<number | null>(null);

  /* 고를 수 있는 카테고리는 쓰고 있는 것만. 보관된 것에 새 기록을 붙이면
     달력에 이름 없는 줄이 생긴다. */
  const pickable = useMemo(() => categories.filter((c) => !c.deprecated), [categories]);

  /* 처음 값은 "기타"로 둔다. 비워두고 고르게 하면 열 개를 다 만지기 전에는
     가져오기가 막히는데, 대부분은 몇 건짜리라 그만한 가치가 없다. 바꿀 사람은
     바꾸고, 그냥 넘길 사람은 그냥 넘긴다. */
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(plan.unmatched.map((u) => [u.name, 'etc'])),
  );

  const skipCount = plan.unmatched
    .filter((u) => choice[u.name] === SKIP)
    .reduce((sum, u) => sum + u.count, 0);

  const start = () => {
    guard(async () => {
      try {
        setProgress(0);
        const choices: CategoryChoice = new Map(
          plan.unmatched.map((u) => [u.name, choice[u.name] === SKIP ? null : choice[u.name]]),
        );
        const out = await runImport(plan, choices, (done) => setProgress(done));
        onDone(
          out.skipped > 0
            ? `${out.added}건 가져왔어! ${out.skipped}건은 건너뛰었어`
            : `${out.added}건 가져왔어!`,
        );
        onClose();
      } catch {
        onDone('가져오지 못했어. 다시 시도해줘');
      } finally {
        setProgress(null);
      }
    });
  };

  return (
    <Sheet label="가져오기" onClose={onClose}>
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
                  value={choice[u.name] ?? 'etc'}
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

      {plan.skipped > 0 && (
        <div className={styles.warnBox}>
          {plan.skipped}건은 날짜나 금액이 비어 있어서 못 읽었어.
        </div>
      )}

      {skipCount > 0 && (
        <div className={styles.warnBox}>{skipCount}건은 가져오지 않을 거야.</div>
      )}

      <div className={styles.warnBox}>
        지금 기록은 그대로 두고 더해져. 같은 파일을 두 번 넣으면 두 번 들어가니까 조심해줘.
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onClose} disabled={busy}>
          취소
        </button>
        <button type="button" className={styles.confirm} onClick={start} disabled={busy}>
          {progress === null
            ? '가져오기'
            : `${Math.round((progress / Math.max(1, plan.count)) * 100)}%`}
        </button>
      </div>
    </Sheet>
  );
}
