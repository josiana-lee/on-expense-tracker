import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { APP_INFO } from '../../data/appInfo';
import { useBackHandler } from '../../shell/useBackHandler';
import { LicenseScreen } from './LicenseScreen';
import styles from './SettingsScreen.module.css';

const BACK_ICON = 'M15 5l-7 7 7 7';
const CHEVRON = 'M9 5l7 7-7 7';

type Props = {
  onBack: () => void;
};

/** 설정 › 정보 › 약관 및 정책. 자주 열 일 없는 법적 문서를 정보 칸 밖으로 한 겹 넣었다.
 *  개인정보처리방침은 구글 정책상 앱 안에서도 열 수 있어야 해서 숨기지 않고 여기 둔다.
 *  주소가 아직 비어 있는 문서(이용약관)는 줄째 빠진다 — 죽은 링크보다 없는 줄이 낫다. */
export function PolicyScreen({ onBack }: Props) {
  useBackHandler(true, onBack);
  /* 라이선스는 이 화면 위에 겹쳐 연다. 뒤로 가면 이 화면이 그대로 남아 있다. */
  const [licensesOpen, setLicensesOpen] = useState(false);

  return (
    <div className={styles.sub}>
      <div className={styles.subHead}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="뒤로">
          <Icon path={BACK_ICON} size={19} stroke="var(--tx)" strokeWidth={2.2} />
        </button>
        <span className={styles.subTitle}>약관 및 정책</span>
      </div>

      <div className={styles.subBody}>
        <div className={styles.subCard}>
          {APP_INFO.privacyPolicyUrl && (
            <a
              className={`${styles.row} ${styles.rowLink}`}
              href={APP_INFO.privacyPolicyUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className={styles.rowLabel}>개인정보처리방침</span>
              <span className={styles.chevron}>
                <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
              </span>
            </a>
          )}

          {APP_INFO.termsUrl && (
            <a
              className={`${styles.row} ${styles.rowLink}`}
              href={APP_INFO.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className={styles.rowLabel}>이용약관</span>
              <span className={styles.chevron}>
                <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
              </span>
            </a>
          )}

          <button type="button" className={styles.row} onClick={() => setLicensesOpen(true)}>
            <span className={styles.rowLabel}>오픈소스 라이선스</span>
            <span className={styles.chevron}>
              <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
            </span>
          </button>
        </div>
      </div>

      {licensesOpen && <LicenseScreen onBack={() => setLicensesOpen(false)} />}
    </div>
  );
}
