import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import type { ID, Minor } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { won } from '../../lib/format';
import styles from './CategorySummarySheet.module.css';

type Props = {
  /** "2026년 9월" — 어느 달을 보고 있는지. 달력이 이미 쓰는 문구 그대로. */
  periodLabel: string;
  monthTotal: Minor;
  /** 많이 쓴 순서. sumByCategory가 정렬해서 준다. */
  byCategory: { categoryId: ID; spend: Minor }[];
  onClose: () => void;
};

/** 달력의 "이번 달 지출"을 누르면 열리는 카테고리별 요약.
 *
 *  자리를 여기로 잡은 이유: 가계부를 오래 쓰면서도 예산은 세우지 않고 기록과
 *  총액만 보는 사람이 많다. 그 사람의 동선은 달력 맨 위 총액에서 끝나는데,
 *  "이게 뭘로 이뤄졌지"는 바로 그 숫자를 볼 때 드는 질문이다. 예산 탭 안에
 *  두면 예산을 쓰지 않는 사람에게는 없는 기능이 된다.
 *
 *  시트로 연 이유: 달력은 세로가 빠듯하다. 월 그리드와 그날의 기록 목록이
 *  이미 화면을 다 쓰고 있어서, 목록을 상주시키면 둘 중 하나가 잘린다. 그리고
 *  궁금하지 않은 사람에게는 화면이 하나도 안 바뀌는 편이 낫다. */
export function CategorySummarySheet({ periodLabel, monthTotal, byCategory, onClose }: Props) {
  const { byId } = useCatalog();

  return (
    <Sheet label="카테고리별 지출" onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.label}>{periodLabel} 지출</span>
        <span className={`${styles.total} tabular`}>{won(monthTotal)}원</span>
      </div>

      {byCategory.length === 0 ? (
        <p className={styles.empty}>이 달엔 아직 기록이 없어.</p>
      ) : (
        <div className={styles.list}>
          {byCategory.map(({ categoryId, spend }) => {
            const category = byId.get(categoryId);
            /* 막대와 퍼센트가 같은 것을 뜻하게 둔다 — 둘 다 이 달 총액 대비
               비율이다. 막대만 최댓값 기준으로 잡으면 1등이 늘 꽉 차서
               보기엔 좋지만, 옆의 숫자와 다른 말을 하게 된다. */
            const pct = monthTotal > 0 ? (spend / monthTotal) * 100 : 0;
            return (
              <div key={categoryId} className={styles.row}>
                <span
                  className={styles.badge}
                  style={{ background: category?.colorHex ?? 'var(--sf2)' }}
                >
                  {category && <Icon path={category.iconPath} size={16} strokeWidth={1.8} />}
                </span>
                <div className={styles.main}>
                  <div className={styles.top}>
                    {/* 지워진 카테고리에 달린 기록도 금액은 총액에 들어가
                        있다. 줄을 빼면 목록의 합이 총액과 안 맞는다. */}
                    <span className={styles.name}>{category?.name ?? '지운 카테고리'}</span>
                    <span className={`${styles.amount} tabular`}>{won(spend)}원</span>
                  </div>
                  <div className={styles.bar}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${Math.max(2, pct)}%`,
                        background: category?.colorHex ?? 'var(--tx2)',
                      }}
                    />
                  </div>
                </div>
                {/* 1% 미만은 "0%"가 아니라 "1%"로 올린다. 기록이 있는데
                    0%라고 적으면 안 쓴 것처럼 읽힌다. */}
                <span className={`${styles.pct} tabular`}>
                  {pct > 0 && pct < 1 ? 1 : Math.round(pct)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
