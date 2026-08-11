import { Sheet } from '../../components/Sheet';
import { COLOR_THEMES, type ColorTheme } from '../../data/themes';
import { updateSettings } from '../../db/settings';
import styles from './ColorThemeSheet.module.css';

type Props = {
  value: ColorTheme;
  onClose: () => void;
};

export function ColorThemeSheet({ value, onClose }: Props) {
  return (
    <Sheet label="색 테마 설정" onClose={onClose}>
      <div className={styles.title}>색 테마</div>
      <div className={styles.hint}>
        고르는 즉시 화면에 반영돼. 어두운 모드에서는 배경은 그대로고 포인트 색만 바뀌어.
      </div>

      <div className={styles.list}>
        {COLOR_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => updateSettings({ colorTheme: t.id })}
            aria-pressed={value === t.id}
            className={`${styles.item} ${value === t.id ? styles.itemOn : ''}`}
          >
            {/* 색 값이 테마마다 달라 CSS 변수로 못 쓴다 — :root에 걸린
                변수는 지금 고른 테마 하나뿐이기 때문이다. */}
            <span className={styles.swatch} style={{ background: t.swatch }} />
            <span className={styles.name}>{t.name}</span>
          </button>
        ))}
      </div>

      <button type="button" className={styles.done} onClick={onClose}>
        완료
      </button>
    </Sheet>
  );
}
