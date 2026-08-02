import { useState } from 'react';
import { TabBar, TABS, type TabId } from './components/TabBar';
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

export function App() {
  const [shell, setShell] = useState<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<TabId>('input');
  useTheme();
  useReminderScheduler();

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
