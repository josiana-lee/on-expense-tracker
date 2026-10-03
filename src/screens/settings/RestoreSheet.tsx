import { Sheet } from '../../components/Sheet';
import type { ParsedRestore } from '../../db/restore';
import { RestoreAbortedError, restoreBackupFile } from '../../db/restore';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { useRestoreCopy } from '../../hooks/useRestoreCopy';
import styles from './RestoreSheet.module.css';

const TABLE_LABELS: Partial<Record<keyof ParsedRestore['validCounts'], string>> = {
  expenses: '지출 기록',
  categories: '카테고리',
  paymentMethods: '결제수단',
  accounts: '계좌',
  budgets: '예산',
  recurringRules: '저장해둔 지출',
};

type Props = {
  parsed: ParsedRestore;
  onClose: () => void;
  onDone: (message: string) => void;
  /** 복원이 끝난 뒤. 호출한 쪽이 이 시트를 닫고 "두고 갈지 되돌릴지"를 물어본다. */
  onRestored: () => void;
};

export function RestoreSheet({ parsed, onClose, onDone, onRestored }: Props) {
  const { busy, guard } = useGuardedAction();
  /* 앞 복원의 사본이 아직 남아 있으면 이번에는 새 사본을 만들지 않는다 — 틀린 파일로
     복원하고 곧바로 맞는 파일로 또 복원했을 때 원래 데이터를 지키려는 것이다. 그러면
     "지금 데이터를 사본으로 남겨둘게"는 사실이 아니다. 지금 데이터는 남지 않는다. */
  const existingCopy = useRestoreCopy();

  const totalSkipped = Object.values(parsed.skippedCounts).reduce((sum, n) => sum + n, 0);
  const exportedLabel = new Date(parsed.exportedAt).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const confirm = () => {
    guard(async () => {
      try {
        await restoreBackupFile(parsed);
        /* 토스트로 끝내지 않는다. 복원은 전부 덮어써서 "이 파일이 아니었네"가
           되면 지금 데이터가 이미 없는데, 복원하기 전 사본이 앱 안에 있으니
           바로 두고 갈지 되돌릴지 고르게 한다. */
        onRestored();
      } catch (err) {
        // Stopping before the safety copy exists isn't a failure to explain
        // away — it already says what happened and that the data is intact.
        onDone(
          err instanceof RestoreAbortedError ? err.message : '복원하지 못했어. 다시 시도해줘',
        );
      }
    });
  };

  return (
    <Sheet label="백업 복원" onClose={onClose}>
      <div className={styles.title}>백업 복원</div>
      <div className={styles.hint}>{exportedLabel}에 만든 백업이야.</div>

      <div className={styles.card}>
        {(Object.keys(TABLE_LABELS) as (keyof typeof TABLE_LABELS)[]).map((name) => (
          <div key={name} className={styles.row}>
            <span className={styles.rowLabel}>{TABLE_LABELS[name]}</span>
            <span className={styles.rowValue}>{parsed.validCounts[name]}개</span>
          </div>
        ))}
      </div>

      {totalSkipped > 0 && (
        <div className={styles.warnBox}>
          {totalSkipped}건은 형식이 맞지 않아 건너뛸 거야.
        </div>
      )}

      {parsed.dangling.total > 0 && (
        <div className={styles.warnBox}>
          {parsed.dangling.total}건은 카테고리나 결제수단 정보가 백업에 없어. 금액과 날짜는
          그대로 복원되지만 분류가 비어 보일 수 있어.
        </div>
      )}

      <div className={styles.warnBox}>
        복원하면 지금 기기에 있는 모든 데이터가 이 백업 내용으로 완전히 바뀌어.{' '}
        {existingCopy
          ? `${new Date(existingCopy.takenAt).toLocaleDateString('ko-KR', {
              month: 'long',
              day: 'numeric',
            })}에 남겨둔 사본이 이미 있어서, 지금 데이터는 사본으로 남지 않아. 되돌리면 그때 상태로 가.`
          : '지금 데이터는 앱 안에 사본으로 남겨둘게. 마음에 안 들면 복원하기 전으로 되돌릴 수 있어.'}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onClose} disabled={busy}>
          취소
        </button>
        <button type="button" className={styles.confirm} onClick={confirm} disabled={busy}>
          복원하기
        </button>
      </div>
    </Sheet>
  );
}
