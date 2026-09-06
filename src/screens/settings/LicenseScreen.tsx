import { useState } from 'react';
import { Icon } from '../../components/Icon';
import {
  DEXIE_NOTICE,
  licenseText,
  OPEN_SOURCE_PACKAGES,
  type OpenSourcePackage,
} from '../../data/licenses';
import styles from './LicenseScreen.module.css';
import { useBackHandler } from '../../shell/useBackHandler';
import settingsStyles from './SettingsScreen.module.css';

const BACK_ICON = 'M15 5l-7 7 7 7';
const CHEVRON_DOWN = 'M6 9l6 6 6-6';

type Props = {
  onBack: () => void;
};

export function LicenseScreen({ onBack }: Props) {
  useBackHandler(true, onBack);
  // Full licence texts are long, so they start folded — the attribution that
  // has to be visible is the name, version, licence and copyright, which the
  // row shows without expanding.
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (pkg: OpenSourcePackage) =>
    setExpanded((cur) => (cur === pkg.name ? null : pkg.name));

  return (
    <div className={settingsStyles.sub}>
      <div className={settingsStyles.subHead}>
        <button type="button" className={settingsStyles.back} onClick={onBack} aria-label="뒤로">
          <Icon path={BACK_ICON} size={19} stroke="var(--tx)" strokeWidth={2.2} />
        </button>
        <span className={settingsStyles.subTitle}>오픈소스 라이선스</span>
        <span className={settingsStyles.subMeta}>{OPEN_SOURCE_PACKAGES.length}개</span>
      </div>

      <div className={settingsStyles.subBody}>
        <p className={styles.intro}>
          이 앱은 아래 오픈소스 소프트웨어를 사용합니다.
          <br />
          각 저작권자와 라이선스에 감사드립니다.
        </p>

        <div className={settingsStyles.subCard}>
          {OPEN_SOURCE_PACKAGES.map((pkg) => {
            const open = expanded === pkg.name;
            return (
              <div key={pkg.name} className={styles.pkg}>
                <button
                  type="button"
                  className={styles.pkgHead}
                  onClick={() => toggle(pkg)}
                  aria-expanded={open}
                >
                  <div className={styles.pkgMain}>
                    <div className={styles.pkgName}>
                      {pkg.name} <span className={styles.pkgVersion}>{pkg.version}</span>
                    </div>
                    <div className={styles.pkgMeta}>
                      {pkg.license} · {pkg.copyright}
                    </div>
                  </div>
                  <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`}>
                    <Icon path={CHEVRON_DOWN} size={16} stroke="currentColor" strokeWidth={2.2} />
                  </span>
                </button>

                {open && (
                  <>
                    <pre className={styles.licenseText}>{licenseText(pkg)}</pre>
                    <a
                      className={styles.homepage}
                      href={pkg.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {pkg.homepage}
                    </a>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Apache-2.0 §4(d): a NOTICE file has to be carried along with the
            work, so Dexie's is reproduced rather than summarised. */}
        <div className={styles.noticeTitle}>NOTICE</div>
        <div className={settingsStyles.subCard}>
          <pre className={styles.licenseText}>{DEXIE_NOTICE}</pre>
        </div>
      </div>
    </div>
  );
}
