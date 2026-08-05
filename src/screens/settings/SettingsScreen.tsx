import { useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Toast } from '../../components/Toast';
import { APP_INFO } from '../../data/appInfo';
import { emailBackup, icloudBackup } from '../../db/backup';
import { exportExpensesCsv } from '../../db/exportCsv';
import type { ParsedRestore } from '../../db/restore';
import { parseBackupFile, RestoreFormatError } from '../../db/restore';
import { updateSettings } from '../../db/settings';
import { useBackupOverdue } from '../../hooks/useBackupOverdue';
import { useCatalog } from '../../hooks/useCatalog';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { useRecurringRules } from '../../hooks/useRecurringRules';
import { useSettings } from '../../hooks/useSettings';
import { useToast } from '../../hooks/useToast';
import { CategoryManageScreen } from './CategoryManageScreen';
import { LicenseScreen } from './LicenseScreen';
import { DefaultPaymentSheet } from './DefaultPaymentSheet';
import { MonthStartDaySheet } from './MonthStartDaySheet';
import { RecurringManageScreen } from './RecurringManageScreen';
import { RestoreSheet } from './RestoreSheet';
import { WeekStartDaySheet } from './WeekStartDaySheet';
import styles from './SettingsScreen.module.css';

const CHEVRON = 'M9 5l7 7-7 7';
const DOWS = ['일', '월', '화', '수', '목', '금', '토'];

type Sheet = 'monthStart' | 'weekStart' | 'defaultPayment' | null;
type Sub = 'categories' | 'recurring' | 'licenses' | null;

type Props = {
  /** 카드 추가·결제 주기 설정은 이미 자산 탭에 있어 — 설정에 따로 화면을 만드는 대신
   *  자산 탭으로 보내준다. */
  onManageCards: () => void;
};

export function SettingsScreen({ onManageCards }: Props) {
  const settings = useSettings();
  const { categories, payments, paymentById } = useCatalog();
  const recurringRules = useRecurringRules();
  const [sub, setSub] = useState<Sub>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const { text: toast, flash } = useToast();
  const csvExport = useGuardedAction();
  const emailExport = useGuardedAction();
  const icloudExport = useGuardedAction();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreData, setRestoreData] = useState<ParsedRestore | null>(null);
  const backupOverdue = useBackupOverdue();

  const exportCsv = () => {
    csvExport.guard(async () => {
      try {
        const count = await exportExpensesCsv();
        flash(count === 0 ? '내보낼 기록이 없어' : `${count}건을 CSV로 내보냈어`);
      } catch {
        flash('내보내지 못했어. 다시 시도해줘');
      }
    });
  };

  const sendICloudBackup = () => {
    icloudExport.guard(async () => {
      try {
        const { rows, shared } = await icloudBackup();
        if (rows === 0) {
          flash('백업할 데이터가 없어');
        } else if (shared) {
          flash('공유 시트에서 iCloud Drive를 골라서 저장해줘');
        } else {
          flash('백업 파일을 다운로드했어. 파일 앱에서 iCloud Drive로 옮겨줘');
        }
      } catch {
        flash('백업 파일을 만들지 못했어. 다시 시도해줘');
      }
    });
  };

  const sendEmailBackup = () => {
    emailExport.guard(async () => {
      try {
        const rows = await emailBackup();
        flash(rows === 0 ? '백업할 데이터가 없어' : '백업 파일을 준비했어. 이메일 앱에서 보내줘');
      } catch {
        flash('백업 파일을 만들지 못했어. 다시 시도해줘');
      }
    });
  };

  const pickRestoreFile = () => {
    fileInputRef.current?.click();
  };

  const onRestoreFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const parsed = await parseBackupFile(file);
      setRestoreData(parsed);
    } catch (err) {
      flash(err instanceof RestoreFormatError ? err.message : '백업 파일을 읽지 못했어');
    }
  };

  const toggleReminder = async () => {
    const turningOn = !settings?.reminderEnabled;
    if (turningOn) {
      if (typeof Notification === 'undefined') {
        flash('이 브라우저는 알림을 지원하지 않아');
        return;
      }
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        flash('알림 권한을 허용해야 알람을 켤 수 있어');
        return;
      }
    }
    await updateSettings({
      reminderEnabled: turningOn,
      reminderTime: settings?.reminderTime ?? '21:00',
    });
  };

  const dark = settings?.themeMode === 'dark';
  const visibleCount = categories.filter((c) => c.visibleOnHome && !c.deprecated).length;
  const cardCount = payments.filter((p) => p.kind !== 'cash').length;
  const monthStartDay = settings?.monthStartDay ?? 1;
  const weekStartDay = settings?.weekStartDay ?? 0;
  const defaultPaymentId = settings?.defaultPaymentMethodId ?? payments[0]?.id ?? null;
  const defaultPaymentName = defaultPaymentId ? paymentById.get(defaultPaymentId)?.name : undefined;

  return (
    <div className={styles.screen}>
      <div className={styles.title}>설정</div>

      <div className={styles.card}>
        <div className={styles.row} style={{ cursor: 'default' }}>
          <span className={styles.rowLabel}>다크모드</span>
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            onClick={() => updateSettings({ themeMode: dark ? 'light' : 'dark' })}
            className={`${styles.switch} ${dark ? styles.switchOn : ''}`}
          >
            <span className={styles.knob} />
          </button>
        </div>

        <button type="button" className={styles.row} onClick={() => setSub('categories')}>
          <span className={styles.rowLabel}>카테고리 관리</span>
          <span className={styles.rowValue}>
            홈 표시 {visibleCount} · 전체 {categories.length}
          </span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <button type="button" className={styles.row} onClick={onManageCards}>
          <span className={styles.rowLabel}>카드 관리</span>
          <span className={styles.rowValue}>{cardCount}개 · 자산 탭</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <button type="button" className={styles.row} onClick={() => setSub('recurring')}>
          <span className={styles.rowLabel}>반복 지출</span>
          <span className={styles.rowValue}>
            {recurringRules.filter((r) => r.active).length}개
          </span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <button type="button" className={styles.row} onClick={() => setSheet('monthStart')}>
          <span className={styles.rowLabel}>월 시작일</span>
          <span className={styles.rowValue}>{monthStartDay}일</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <button type="button" className={styles.row} onClick={() => setSheet('weekStart')}>
          <span className={styles.rowLabel}>주 시작요일</span>
          <span className={styles.rowValue}>{DOWS[weekStartDay]}요일</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <button type="button" className={styles.row} onClick={() => setSheet('defaultPayment')}>
          <span className={styles.rowLabel}>기본 결제수단</span>
          <span className={styles.rowValue}>{defaultPaymentName ?? '없음'}</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <div className={styles.row} style={{ cursor: 'default' }}>
          <span className={styles.rowLabel}>알람</span>
          <button
            type="button"
            role="switch"
            aria-checked={settings?.reminderEnabled ?? false}
            onClick={toggleReminder}
            className={`${styles.switch} ${settings?.reminderEnabled ? styles.switchOn : ''}`}
          >
            <span className={styles.knob} />
          </button>
        </div>

        {settings?.reminderEnabled && (
          <div className={styles.row} style={{ cursor: 'default' }}>
            <span className={styles.rowLabel}>알림 시간</span>
            <input
              type="time"
              className={styles.timeInput}
              value={settings.reminderTime ?? '21:00'}
              onChange={(e) => updateSettings({ reminderTime: e.target.value })}
              aria-label="알림 시간"
            />
          </div>
        )}
      </div>

      {settings?.reminderEnabled && (
        <div className={styles.noteBox}>
          <span className={styles.noteIcon}>
            <Icon path="M12 8h.01M12 12v5" size={16} stroke="currentColor" strokeWidth={2.4} />
          </span>
          <p className={styles.noteText}>
            앱이 완전히 꺼져 있으면 알림이 안 울릴 수 있어. 브라우저나 설치된 앱이 실행 중일 때만
            믿을 수 있어.
          </p>
        </div>
      )}

      <div className={styles.sectionTitle}>백업 및 복구</div>

      {backupOverdue && (
        <div className={styles.warnBox}>
          <span className={styles.warnIcon}>
            <Icon path="M12 8h.01M12 12v5" size={16} stroke="currentColor" strokeWidth={2.4} />
          </span>
          <p className={styles.warnText}>
            백업한 지 14일이 넘었어. 기기를 바꾸거나 잃어버리면 그동안 기록이 사라질 수 있으니
            지금 백업해두자.
          </p>
        </div>
      )}

      <div className={styles.card}>
        <button
          type="button"
          className={styles.row}
          onClick={sendICloudBackup}
          disabled={icloudExport.busy}
        >
          <span className={styles.rowLabel}>아이클라우드에 백업하기</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <button
          type="button"
          className={styles.row}
          onClick={sendEmailBackup}
          disabled={emailExport.busy}
        >
          <span className={styles.rowLabel}>이메일로 백업하기</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <button
          type="button"
          className={styles.row}
          onClick={exportCsv}
          disabled={csvExport.busy}
        >
          <span className={styles.rowLabel}>CSV 파일로 내보내기</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <button type="button" className={styles.row} onClick={pickRestoreFile}>
          <span className={styles.rowLabel}>백업 파일 복원하기</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={onRestoreFileChosen}
      />

      {/* The licence and version rows are always here, so the section always
          shows. The three above them come from data/appInfo.ts and render
          only once their field has a value — an unfilled one is absent
          rather than a dead link. */}
      <div className={styles.sectionTitle}>정보</div>
      <div className={styles.card}>
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

        {APP_INFO.supportEmail && (
          <a
            className={`${styles.row} ${styles.rowLink}`}
            href={`mailto:${APP_INFO.supportEmail}`}
          >
            <span className={styles.rowLabel}>문의하기</span>
            <span className={styles.rowValue}>{APP_INFO.supportEmail}</span>
            <span className={styles.chevron}>
              <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
            </span>
          </a>
        )}

        <button
          type="button"
          className={styles.row}
          onClick={() => setSub('licenses')}
        >
          <span className={styles.rowLabel}>오픈소스 라이선스</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        <div className={styles.row} style={{ cursor: 'default' }}>
          <span className={styles.rowLabel}>버전</span>
          <span className={styles.rowValue}>{APP_INFO.version}</span>
        </div>
      </div>

      <div className={styles.footer}>
        <img src="/logo-light.svg" alt="" className={styles.footerMark} />
        <img
          src="/logo-dark.svg"
          alt=""
          className={`${styles.footerMark} ${styles.footerMarkDark}`}
        />
        <div>
          {APP_INFO.appName} v{APP_INFO.version}
        </div>
        {APP_INFO.companyName && (
          <div className={styles.footerBrand}>
            © {new Date().getFullYear()} {APP_INFO.companyName}
          </div>
        )}
      </div>

      {toast && <Toast key={toast} text={toast} />}

      {sub === 'categories' && <CategoryManageScreen onBack={() => setSub(null)} />}
      {sub === 'recurring' && <RecurringManageScreen onBack={() => setSub(null)} />}
      {sub === 'licenses' && <LicenseScreen onBack={() => setSub(null)} />}

      {sheet === 'monthStart' && (
        <MonthStartDaySheet value={monthStartDay} onClose={() => setSheet(null)} />
      )}
      {sheet === 'weekStart' && (
        <WeekStartDaySheet value={weekStartDay} onClose={() => setSheet(null)} />
      )}
      {sheet === 'defaultPayment' && (
        <DefaultPaymentSheet
          value={settings?.defaultPaymentMethodId ?? null}
          onClose={() => setSheet(null)}
        />
      )}

      {restoreData && (
        <RestoreSheet
          parsed={restoreData}
          onClose={() => setRestoreData(null)}
          onDone={flash}
        />
      )}
    </div>
  );
}
