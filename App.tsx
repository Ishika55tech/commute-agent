import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { CommutePlan } from './src/domain/types';
import DashboardScreen from './src/screens/DashboardScreen';
import PlanEditorScreen from './src/screens/PlanEditorScreen';
import { openRideApp } from './src/services/handoff';
import { cancelReminders } from './src/services/notifications';
import { addHistory, deletePlan, loadPlan, savePlan } from './src/services/storage';
import { colors } from './src/ui/theme';

type Mode = 'loading' | 'editor' | 'dashboard';

export default function App() {
  const [mode, setMode] = useState<Mode>('loading');
  const [plan, setPlan] = useState<CommutePlan | null>(null);
  const planRef = useRef<CommutePlan | null>(null);
  planRef.current = plan;

  useEffect(() => {
    loadPlan().then((p) => {
      setPlan(p);
      setMode(p ? 'dashboard' : 'editor');
    });
  }, []);

  // Tapping a reminder opens the ride app with the trip pre-filled.
  // The user still confirms the ride inside the provider's app.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data as { kind?: string } | undefined;
      const current = planRef.current ?? (await loadPlan());
      if (data?.kind === 'commute-reminder' && current) await addHistory(await openRideApp(current));
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
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (mode === 'editor' || !plan) {
    screen = (
      <PlanEditorScreen
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
      <StatusBar style="dark" />
      {screen}
    </SafeAreaProvider>
  );
}
