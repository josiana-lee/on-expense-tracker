import styles from './Stepper.module.css';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Appended after the number, e.g. '일'. */
  unit?: string;
  onChange: (value: number) => void;
};

export function Stepper({ label, value, min, max, unit = '', onChange }: Props) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label={`${label} 감소`}
        >
          −
        </button>
        <span className={`${styles.value} tabular`}>
          {value}
          {unit}
        </span>
        <button
          type="button"
          className={styles.btn}
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label={`${label} 증가`}
        >
          +
        </button>
      </div>
    </div>
  );
}
