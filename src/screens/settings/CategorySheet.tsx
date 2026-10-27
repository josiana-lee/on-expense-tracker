import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { CATEGORIES, EXTRA_SWATCHES, type Swatch } from '../../data/categories';
import { addCategory, archiveCategory, setCategoryVisible, updateCategory } from '../../db/categories';
import type { CategoryRecord } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { blurOnEnter } from '../../lib/keyboard';
import { SubsEditor } from './SubsEditor';
import styles from './CategorySheet.module.css';

type Props = {
  /** An existing category to edit, or null to add one. */
  category: CategoryRecord | null;
  onClose: () => void;
  onDone: (message: string) => void;
};

/** 고를 수 있는 아이콘: 프리셋 카테고리 모양 전부 + 프리셋은 아닌 몇 개(구독처럼 직접 만들 때 쓰는 것). */
const SWATCHES: Swatch[] = [...CATEGORIES, ...EXTRA_SWATCHES];

export function CategorySheet({ category, onClose, onDone }: Props) {
  const editing = category !== null;
  const [name, setName] = useState(category?.name ?? '');
  const [swatch, setSwatch] = useState<Swatch>(
    () =>
      SWATCHES.find((c) => c.icon === category?.iconPath && c.color === category?.colorHex) ??
      SWATCHES[0],
  );
  const [visible, setVisible] = useState(category?.visibleOnHome ?? false);
  /* 세부항목은 이 시트 안에서 고치다가 "수정 완료"에 이름·아이콘과 같이 저장한다. 지운 걸 되돌리고 싶으면
     저장하지 않고 닫으면 된다. */
  const [subs, setSubs] = useState<string[]>(category?.subs ?? []);
  const { busy, guard } = useGuardedAction();
  const { categories } = useCatalog();

  /* 입력 화면에 켤 수 있는 개수는 막지 않는다. 세 줄 격자일 땐 13번째가 줄을
     늘려 한 화면을 넘겼지만, 이제는 다음 페이지로 넘어갈 뿐이다. */
  const toggleVisible = () => setVisible((v) => !v);

  const save = () => {
    if (!name.trim()) {
      onDone('이름을 입력해줘');
      return;
    }
    /* 같은 이름이 둘이면 기록 화면과 예산에서 아이콘 말고는 구분할 수 없다. 지운(보관한) 카테고리는 목록에 안
       나오니 같은 이름을 다시 써도 된다. */
    if (categories.some((c) => c.id !== category?.id && c.name.trim() === name.trim())) {
      onDone('이미 있는 이름이야');
      return;
    }

    guard(async () => {
      try {
        if (category) {
          await updateCategory(category.id, { name, colorHex: swatch.color, iconPath: swatch.icon, subs });
          if (visible !== category.visibleOnHome) await setCategoryVisible(category.id, visible);
          onDone('수정했어!');
        } else {
          const id = await addCategory({ name, colorHex: swatch.color, iconPath: swatch.icon, subs });
          if (visible) await setCategoryVisible(id, true);
          onDone('카테고리를 추가했어!');
        }
        onClose();
      } catch {
        onDone(editing ? '수정하지 못했어' : '추가하지 못했어');
      }
    });
  };

  const remove = () => {
    if (!category) return;
    guard(async () => {
      try {
        await archiveCategory(category.id);
        onDone('삭제했어');
        onClose();
      } catch {
        onDone('삭제하지 못했어');
      }
    });
  };

  return (
    <Sheet label={editing ? '카테고리 수정' : '카테고리 추가'} onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.title}>{editing ? '카테고리 수정' : '카테고리 추가'}</span>
        {editing && (
          <button type="button" className={styles.delete} onClick={remove} disabled={busy}>
            삭제
          </button>
        )}
      </div>

      <div className={styles.preview}>
        <span className={styles.previewBadge} style={{ background: swatch.color }}>
          <Icon path={swatch.icon} size={22} strokeWidth={1.8} />
        </span>
        <input
          className={styles.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="카테고리 이름 (예: 데이트)"
          enterKeyHint="done"
          onKeyDown={blurOnEnter}
        />
      </div>

      <SubsEditor subs={subs} onChange={setSubs} existing={editing} />

      <div className={styles.swatches}>
        {SWATCHES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSwatch(c)}
            aria-label={c.name}
            aria-pressed={swatch.id === c.id}
            className={`${styles.swatch} ${swatch.id === c.id ? styles.swatchOn : ''}`}
          >
            <span className={styles.swatchCircle} style={{ background: c.color }}>
              <Icon path={c.icon} size={18} strokeWidth={1.8} />
            </span>
          </button>
        ))}
      </div>

      <div className={styles.row}>
        <span className={styles.rowLabel}>홈 화면에 표시</span>
        <button
          type="button"
          role="switch"
          aria-checked={visible}
          onClick={toggleVisible}
          className={`${styles.switch} ${visible ? styles.switchOn : ''}`}
        >
          <span className={styles.knob} />
        </button>
      </div>

      <button type="button" className={styles.save} onClick={save} disabled={busy}>
        {editing ? '수정 완료' : '추가!'}
      </button>
    </Sheet>
  );
}
