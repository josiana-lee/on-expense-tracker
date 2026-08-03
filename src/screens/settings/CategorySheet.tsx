import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { CATEGORIES } from '../../data/categories';
import { MAX_HOME_CATEGORIES } from '../../data/categories';
import { addCategory, archiveCategory, setCategoryVisible, updateCategory } from '../../db/categories';
import type { CategoryRecord } from '../../db/types';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import styles from './CategorySheet.module.css';

type Props = {
  /** An existing category to edit, or null to add one. */
  category: CategoryRecord | null;
  /** How many OTHER categories are already on the home grid — used to
   *  enforce the 12-cap without counting this one against itself. */
  otherVisibleCount: number;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function CategorySheet({ category, otherVisibleCount, onClose, onDone }: Props) {
  const editing = category !== null;
  const [name, setName] = useState(category?.name ?? '');
  const [swatch, setSwatch] = useState(
    () =>
      CATEGORIES.find((c) => c.icon === category?.iconPath && c.color === category?.colorHex) ??
      CATEGORIES[0],
  );
  const [visible, setVisible] = useState(category?.visibleOnHome ?? false);
  const { busy, guard } = useGuardedAction();

  const toggleVisible = () => {
    if (!visible && otherVisibleCount >= MAX_HOME_CATEGORIES) {
      onDone(`입력 화면엔 최대 ${MAX_HOME_CATEGORIES}개까지만 표시할 수 있어. 다른 카테고리를 먼저 꺼줘.`);
      return;
    }
    setVisible((v) => !v);
  };

  const save = () => {
    if (!name.trim()) {
      onDone('이름을 입력해줘');
      return;
    }

    guard(async () => {
      try {
        if (category) {
          await updateCategory(category.id, { name, colorHex: swatch.color, iconPath: swatch.icon });
          if (visible !== category.visibleOnHome) await setCategoryVisible(category.id, visible);
          onDone('수정했어!');
        } else {
          const id = await addCategory({ name, colorHex: swatch.color, iconPath: swatch.icon });
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
          placeholder="카테고리 이름 (예: 구독료)"
          enterKeyHint="done"
        />
      </div>

      <div className={styles.swatches}>
        {CATEGORIES.map((c) => (
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
