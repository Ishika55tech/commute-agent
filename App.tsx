import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { CommutePlan } from './src/domain/types';
import DashboardScreen from './src/screens/DashboardScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { openRideApp } from './src/services/handoff';
import { cancelReminders, type ReminderData } from './src/services/notifications';
import { addHistory, deletePlan, loadPlan, savePlan } from './src/services/storage';
import { Backdrop } from './src/ui/components';
import { colors } from './src/ui/theme';

type Mode = 'loading' | 'editor' | 'dashboard';

export default function App() {
  const [mode, setMode] = useState<Mode>('loading');
  const [plan, setPlan] = useState<CommutePlan | null>(null);
  const [dashKey, setDashKey] = useState(0);
  const planRef = useRef<CommutePlan | null>(null);
  planRef.current = plan;

  useEffect(() => {
    loadPlan().then((p) => {
      setPlan(p);
      setMode(p ? 'dashboard' : 'editor');
    });
  }, []);

  // Tapping a "book" reminder opens the ride app with the trip pre-filled.
  // The user still confirms the ride inside the provider's app.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data as Partial<ReminderData> | undefined;
      if (data?.kind !== 'commute-reminder') return;
      const current = planRef.current ?? (await loadPlan());
      if (!current) return;
      if ((data.stage ?? 'book') === 'book') {
        await addHistory(await openRideApp(current, data.leg === 'back' ? 'back' : 'to'));
        setDashKey((k) => k + 1); // refresh hand-off history
      }
    });
    return () => sub.remove();
  }, []);

  const persist = async (next: CommutePlan) => {
    await savePlan(next);
    setPlan(next);
  };

  let screen: React.ReactNode;
  if (mode === 'loading') {
    screen = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <Backdrop />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (mode === 'editor' || !plan) {
    screen = (
      <OnboardingScreen
        initial={plan}
        onSaved={async (p) => {
          await persist(p);
          setMode('dashboard');
        }}
        onCancel={plan ? () => setMode('dashboard') : undefined}
      />
    );
  } else {
    screen = (
      <DashboardScreen
        key={dashKey}
        plan={plan}
        onChange={persist}
        onEdit={() => setMode('editor')}
        onDelete={async () => {
          await cancelReminders();
          await deletePlan();
          setPlan(null);
          setMode('editor');
        }}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {screen}
    </SafeAreaProvider>
  );
}
