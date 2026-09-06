import { useEffect, useState } from 'react';
import { TabBar, TABS, type TabId } from './components/TabBar';
import { isNative } from './lib/platform';
import { handleBack } from './shell/useBackHandler';
import { useReminderScheduler } from './hooks/useReminderScheduler';
import { useTheme } from './hooks/useTheme';
import { AssetsScreen } from './screens/assets/AssetsScreen';
import { BudgetScreen } from './screens/budget/BudgetScreen';
import { CalendarScreen } from './screens/calendar/CalendarScreen';
import { InputScreen } from './screens/input/InputScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { ShellContext } from './shell/ShellContext';
import styles from './App.module.css';

function Placeholder({ tab }: { tab: TabId }) {
  const name = TABS.find((t) => t.id === tab)?.name ?? '';
  return (
    <div className={styles.placeholder}>
      <div className={styles.placeholderTitle}>{name}</div>
      <div className={styles.placeholderNote}>아직 만드는 중이야</div>
    </div>
  );
}

/** Gives Android's back button somewhere to go.
 *
 *  Capacitor's default is to exit the app on every press, so back closed the
 *  whole thing from inside a sheet or a sub-screen — on Android that reads as
 *  a crash, and here it would throw away a half-typed record.
 *
 *  Order: whatever is on top dismisses itself first, then a non-input tab
 *  falls back to the input tab, and only a press on the bare input tab exits.
 *  Input is the root because it is the screen the app opens on. */
function useAndroidBackButton(tab: TabId, setTab: (t: TabId) => void): void {
  useEffect(() => {
    if (!isNative) return undefined;

    let remove: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { App: CapApp } = await import('@capacitor/app');
      const listener = await CapApp.addListener('backButton', () => {
        if (handleBack()) return;
        if (tab !== 'input') {
          setTab('input');
          return;
        }
        void CapApp.exitApp();
      });
      /* The import resolves a tick later, so the effect may already have been
         torn down by then — drop the listener rather than leaking it. */
      if (cancelled) void listener.remove();
      else remove = () => void listener.remove();
    })().catch((err: unknown) => {
      /* Worth saying out loud. The plugin's native side swallows the back
         press whether or not JS is listening, so a failure here does not
         restore the default — it leaves the button doing nothing at all,
         which is indistinguishable from a dead button. */
      console.error('back button listener failed to register', err);
    });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [tab, setTab]);
}

export function App() {
  const [shell, setShell] = useState<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<TabId>('input');
  useTheme();
  useReminderScheduler();
  useAndroidBackButton(tab, setTab);

  /* 넓은 화면에서 셸 폭을 화면마다 다르게 잡기 위한 표식.
   *
   *  #root는 React 트리 밖(index.html의 마운트 노드)이라, CSS가 지금 어느
   *  탭인지 알 방법이 여기 말고는 없다. base.css의 태블릿 규칙이 이 값을 본다.
   *  main.tsx가 data-native를 붙이는 것과 같은 자리다. */
  useEffect(() => {
    document.documentElement.dataset.tab = tab;
  }, [tab]);

  const known =
    tab === 'input' ||
    tab === 'calendar' ||
    tab === 'budget' ||
    tab === 'assets' ||
    tab === 'settings';

  return (
    <div className={styles.shell} ref={setShell}>
      <ShellContext.Provider value={shell}>
        {/* Keyed so switching tabs replays the screen-in animation. */}
        <main className={styles.screen} key={tab}>
          {tab === 'input' && <InputScreen />}
          {tab === 'calendar' && <CalendarScreen />}
          {tab === 'budget' && <BudgetScreen />}
          {tab === 'assets' && <AssetsScreen />}
          {tab === 'settings' && <SettingsScreen onManageCards={() => setTab('assets')} />}
          {!known && <Placeholder tab={tab} />}
        </main>
        <TabBar active={tab} onChange={setTab} />
      </ShellContext.Provider>
    </div>
  );
}
