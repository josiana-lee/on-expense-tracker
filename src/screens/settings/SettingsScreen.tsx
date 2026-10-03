import { useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Toast } from '../../components/Toast';
import { APP_INFO } from '../../data/appInfo';
import { emailBackup, icloudBackup } from '../../db/backup';
import { exportExpensesCsv } from '../../db/exportCsv';
import type { ParsedRestore } from '../../db/restore';
import { parseBackupFile, RestoreFormatError } from '../../db/restore';
import { db } from '../../db/db';
import { DetectError, detectFile } from '../../db/importers/detect';
import { findImportedFile } from '../../db/importers/imported';
import { planImport, type ImportPlan } from '../../db/importers/plan';
import { ImportSheet } from './ImportSheet';
import { ImportUndoSheet } from './ImportUndoSheet';
import { RestoreUndoSheet } from './RestoreUndoSheet';
import { useRestoreCopy } from '../../hooks/useRestoreCopy';
import type { ImportEntry, LastImport } from '../../db/importers/undo';
import { useImports } from '../../hooks/useImports';
import { ImportHistorySheet } from './ImportHistorySheet';
import { DEFAULT_REMINDER_TIME, setReminder, updateSettings } from '../../db/settings';
import { useBackupOverdue } from '../../hooks/useBackupOverdue';
import { useCatalog } from '../../hooks/useCatalog';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { useRecurringRules } from '../../hooks/useRecurringRules';
import { useSettings } from '../../hooks/useSettings';
import { useToast } from '../../hooks/useToast';
import { remindersAreReliable, requestReminderPermission } from '../../lib/notifications';
import { CategoryManageScreen } from './CategoryManageScreen';
import { LicenseScreen } from './LicenseScreen';
import { DefaultPaymentSheet } from './DefaultPaymentSheet';
import { MonthStartDaySheet } from './MonthStartDaySheet';
import { RecurringManageScreen } from './RecurringManageScreen';
import { RestoreSheet } from './RestoreSheet';
import { WeekStartDaySheet } from './WeekStartDaySheet';
import { ColorThemeSheet } from './ColorThemeSheet';
import { COLOR_THEMES, DEFAULT_COLOR_THEME } from '../../data/themes';
import styles from './SettingsScreen.module.css';

const CHEVRON = 'M9 5l7 7-7 7';
const DOWS = ['일', '월', '화', '수', '목', '금', '토'];
/** 불러오기가 읽는 형식. 앱 이름이 아니라 파일 형식으로 적는다. */
const IMPORT_FORMATS = ['백업 파일', 'CSV', 'SQLite', 'mmbak'];

type Sheet = 'monthStart' | 'weekStart' | 'defaultPayment' | 'colorTheme' | null;
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
  const [importData, setImportData] = useState<ImportPlan | null>(null);
  const [undoData, setUndoData] = useState<{ last: LastImport | ImportEntry; fresh: boolean } | null>(null);
  const imports = useImports();
  const [historyOpen, setHistoryOpen] = useState(false);
  const restoreCopy = useRestoreCopy();
  const [restoreUndo, setRestoreUndo] = useState<{ fresh: boolean } | null>(null);
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
        const { rows, result } = await icloudBackup();
        if (rows === 0) flash('백업할 데이터가 없어');
        else if (result === 'shared') flash('백업 파일을 넘겼어. 저장됐는지 확인해줘');
        else if (result === 'downloaded') flash('백업 파일을 저장했어');
        else flash('저장을 취소했어. 백업은 만들어지지 않았어');
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

  const pickFile = () => {
    fileInputRef.current?.click();
  };

  /* 입구가 하나다. 우리 백업이든 다른 가계부 파일이든 여기로 들어오고, 무엇인지는
     앱이 내용을 보고 가른다 — 사용자가 "내 파일은 어느 쪽이지"를 먼저 알아야 하는
     구조는 갈아타러 온 사람에게 첫 벽이 된다. 덮어쓰기냐 더하기냐는 각자의
     미리보기가 말해준다. */
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const found = await detectFile(file);
      if (found.kind === 'backup') {
        setRestoreData(await parseBackupFile(file));
        return;
      }
      const [categories, payments] = await Promise.all([
        db.categories.toArray(),
        db.paymentMethods.toArray(),
      ]);
      const next = planImport(found.parse, categories, payments);
      /* 같은 파일을 또 고른 것이면 시트를 열지 않는다. 가져오기는 더하기라서 그대로 두면
         전부 두 번 들어가고, 파일을 다시 고르는 건 대개 "들어갔나?" 하고 확인하려는
         때라 시트의 경고를 읽기 전에 버튼을 누른다. 되돌렸거나 기록이 이미 없으면
         항목이 없어서 다시 가져올 수 있다. */
      const done = next.fingerprint ? await findImportedFile(next.fingerprint) : null;
      if (done) {
        const day = new Date(done.at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
        flash(`이미 가져온 파일이야 (${day}, ${done.count.toLocaleString()}건)`);
        return;
      }
      /* 읽을 지출이 하나도 없으면 시트를 열 이유가 없다. 열면 0건·0원에 가져오기
         버튼만 있는 화면이 뜬다. 수입만 든 파일이면 왜 비었는지도 말해준다. */
      if (next.count === 0) {
        flash(
          next.income > 0
            ? `가져올 지출이 없어. 수입 ${next.income.toLocaleString()}건은 가져오지 않아`
            : '가져올 지출 기록이 없어',
        );
        return;
      }
      setImportData(next);
    } catch (err) {
      if (err instanceof DetectError || err instanceof RestoreFormatError) flash(err.message);
      else flash('파일을 읽지 못했어');
    }
  };

  const toggleReminder = async () => {
    const turningOn = !settings?.reminderEnabled;
    if (turningOn && !(await requestReminderPermission())) {
      flash('알림 권한을 허용해야 켤 수 있어');
      return;
    }
    await setReminder(turningOn, settings?.reminderTime);
  };

  const dark = settings?.themeMode === 'dark';
  const colorTheme = settings?.colorTheme ?? DEFAULT_COLOR_THEME;
  const colorThemeName = COLOR_THEMES.find((t) => t.id === colorTheme)?.name;
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

        {/* 다크모드 바로 아래. 둘 다 화면 색을 정하는 설정이라 붙어 있어야
            어느 쪽을 만져야 하는지 헷갈리지 않는다. */}
        <button type="button" className={styles.row} onClick={() => setSheet('colorTheme')}>
          <span className={styles.rowLabel}>색 테마</span>
          <span className={styles.rowValue}>{colorThemeName}</span>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

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
          <span className={styles.rowLabel}>저장해둔 지출</span>
          {/* 전부 센다. `active`로 거르던 시절이 있었는데, 스케줄이 빠지면서
              그 필드를 아무도 쓰지 않게 돼 방금 만든 규칙도 0개로 보였다. */}
          <span className={styles.rowValue}>{recurringRules.length}개</span>
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

        {/* "알람"이 아니라 "알림". 하는 일은 정한 시각에 알림창에 메시지를
            띄우는 것이고, 소리로 깨우는 게 아니다. 알람이라고 부르면 시계
            알람을 기대하게 되는데, 켜 보고 기대와 다르면 그냥 끈다.
            바로 아래 시간 행이 이미 "알림 시간"이라 한 기능이 두 이름으로
            불리고 있기도 했다. */}
        <div className={styles.row} style={{ cursor: 'default' }}>
          <div className={styles.rowLabel}>
            알림
            <span className={styles.rowSub}>정한 시각에 하루 한 번, 오늘 기록했는지 물어볼게</span>
          </div>
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
              value={settings.reminderTime ?? DEFAULT_REMINDER_TIME}
              /* Clearing the field snaps back to the default rather than
                 storing nothing. setReminder writes updatedAt either way, so
                 the live query re-renders and the input follows — a
                 controlled input left holding a value the state rejected
                 would drift out of sync until something else re-rendered. */
              onChange={(e) => setReminder(true, e.target.value)}
              aria-label="알림 시간"
            />
          </div>
        )}
      </div>

      {/* Only the browser build owes this apology. In the packaged app the
          reminder is registered with the OS and fires whether or not the app
          is running, so the caveat would be a lie that makes a working
          feature look unreliable. */}
      {settings?.reminderEnabled && !remindersAreReliable && (
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
          {/* "저장하기"가 아니라 "내보내기". 눌렀을 때 뜨는 건 안드로이드
              공유 시트고, 거기에 늘어선 건 카카오톡·Gmail 같은 앱이다.
              "저장"을 기대한 사람은 저장할 곳을 찾다가 멈춘다 — 테스터가
              실제로 그 화면에서 막혔다.

              공유 시트를 쓰는 건 어쩔 수 없다. 앱이 임의의 위치에 파일을
              쓰려면 파일 선택기(SAF)를 붙여야 하고, 앱 전용 폴더에 쓰면
              앱을 지울 때 같이 사라져 백업 구실을 못 한다. 그러니 고칠 건
              동작이 아니라 이름과, 무엇을 고르면 되는지에 대한 안내다. */}
          <div className={styles.rowLabel}>
            백업 파일 내보내기
            <span className={styles.rowSub}>
              카톡 &apos;나와의 채팅&apos;이나 드라이브에 저장해두면 돼
            </span>
          </div>
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

        <button type="button" className={styles.row} onClick={pickFile}>
          {/* 부제 두 줄: 무엇을 가져오는지, 어떤 형식인지. 앱 이름을 쓰지 않는 대신
              사용자가 자기 파일의 확장자와 맞춰볼 수 있게 형식을 칩으로 적는다 — 글줄
              속에 섞인 확장자는 안 읽히지만 칩은 훑어서 자기 것을 찾는다. 우리 백업과
              다른 가계부 파일이 같은 입구라 둘 다 적는다. */}
          <div className={styles.rowLabel}>
            파일에서 불러오기
            <span className={styles.rowSub}>다른 가계부 파일도 가져올 수 있어</span>
            <span className={styles.formatLine}>
              <span className={styles.formatLabel}>형식</span>
              {IMPORT_FORMATS.map((f) => (
                <span key={f} className={styles.formatChip}>
                  {f}
                </span>
              ))}
            </span>
          </div>
          <span className={styles.chevron}>
            <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
          </span>
        </button>

        {/* 가져온 기록이 하나라도 남아 있으면 항상 있다. 되돌릴 수 있는 게 마지막 하나뿐이고
            "이대로 쓸게"를 누르면 사라지던 때는, 같은 파일을 실수로 두 번 넣으면 첫 번째를
            지울 길이 없었다. 기록에 붙은 표시에서 목록을 만들어서, 마음이 바뀌는 시점이
            언제든 이 줄에서 그 가져오기만 되돌린다. */}
        {imports && imports.length > 0 && (
          <button type="button" className={styles.row} onClick={() => setHistoryOpen(true)}>
            <div className={styles.rowLabel}>
              가져온 기록 되돌리기
              <span className={styles.rowSub}>
                {imports.length === 1
                  ? `${new Date(imports[0].at).toLocaleDateString('ko-KR', {
                      month: 'long',
                      day: 'numeric',
                    })}에 가져온 ${imports[0].count.toLocaleString()}건`
                  : `${imports.length}번 가져왔어. 골라서 되돌릴 수 있어`}
              </span>
            </div>
            <span className={styles.chevron}>
              <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
            </span>
          </button>
        )}

        {/* 복원한 뒤 "이대로 쓸게"도 "되돌리기"도 안 고르고 닫았을 때만 남는다.
            가져오기 되돌리기와 같은 이유다 — 마음이 바뀌는 건 결과를 살펴본 뒤라서
            시트가 열려 있는 동안에만 돌아갈 수 있으면 부족하다. */}
        {restoreCopy && (
          <button
            type="button"
            className={styles.row}
            onClick={() => setRestoreUndo({ fresh: false })}
          >
            <div className={styles.rowLabel}>
              복원 전으로 되돌리기
              <span className={styles.rowSub}>
                {new Date(restoreCopy.takenAt).toLocaleDateString('ko-KR', {
                  month: 'long',
                  day: 'numeric',
                })}
                에 복원하기 전 상태로
              </span>
            </div>
            <span className={styles.chevron}>
              <Icon path={CHEVRON} size={16} stroke="currentColor" strokeWidth={2.2} />
            </span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        /* accept를 두지 않는다. 파일을 이름이 아니라 내용으로 알아보는데, 힌트를
           걸어두면 .mmbak처럼 안드로이드가 종류를 모르는 확장자가 목록에서
           빠질 수 있다. 고를 수 없는 파일은 알아볼 기회도 없다. */
        style={{ display: 'none' }}
        onChange={onFileChosen}
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
      {sheet === 'colorTheme' && (
        <ColorThemeSheet value={colorTheme} onClose={() => setSheet(null)} />
      )}
      {sheet === 'defaultPayment' && (
        <DefaultPaymentSheet
          value={settings?.defaultPaymentMethodId ?? null}
          onClose={() => setSheet(null)}
        />
      )}

      {importData && (
        <ImportSheet
          plan={importData}
          onClose={() => setImportData(null)}
          onDone={flash}
          onImported={(last) => {
            setImportData(null);
            setUndoData({ last, fresh: true });
          }}
        />
      )}

      {historyOpen && (
        <ImportHistorySheet
          entries={imports ?? []}
          onClose={() => setHistoryOpen(false)}
          onPick={(entry) => {
            setHistoryOpen(false);
            setUndoData({ last: entry, fresh: false });
          }}
        />
      )}

      {undoData && (
        <ImportUndoSheet
          last={undoData.last}
          fresh={undoData.fresh}
          onClose={() => setUndoData(null)}
          onDone={flash}
        />
      )}

      {restoreData && (
        <RestoreSheet
          parsed={restoreData}
          onClose={() => setRestoreData(null)}
          onDone={flash}
          onRestored={() => {
            setRestoreData(null);
            setRestoreUndo({ fresh: true });
          }}
        />
      )}

      {restoreUndo && restoreCopy && (
        <RestoreUndoSheet
          copy={restoreCopy}
          fresh={restoreUndo.fresh}
          onClose={() => setRestoreUndo(null)}
          onDone={flash}
        />
      )}
    </div>
  );
}
