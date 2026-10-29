import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { applyIntent, type AgentIntent } from '../domain/schema';
import { explainPlan, formatTime, upcomingPlans } from '../domain/scheduler';
import type { CommutePlan, DayPlan, HandoffRecord, TravelEstimate } from '../domain/types';
import { getProvider } from '../providers';
import { fetchTravelEstimate, parseCommand } from '../services/agentApi';
import { openRideApp } from '../services/handoff';
import { ensurePermission, syncReminders, type PermissionState } from '../services/notifications';
import { addHistory, loadHistory } from '../services/storage';
import { fetchRainProbability } from '../services/weather';
import { Badge, Button, Card, Field, Label, Notice } from '../ui/components';
import { colors, space, type } from '../ui/theme';

type Props = {
  plan: CommutePlan;
  onChange: (plan: CommutePlan) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
};

type Pending = { intent: AgentIntent; warnings: string[] } | null;

const dayLabel = (key: string) =>
  new Date(key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export default function DashboardScreen({ plan, onChange, onEdit, onDelete }: Props) {
  const [estimate, setEstimate] = useState<TravelEstimate | null>(null);
  const [rain, setRain] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [scheduled, setScheduled] = useState(0);
  const [history, setHistory] = useState<HandoffRecord[]>([]);
  const [now, setNow] = useState(new Date());

  const [command, setCommand] = useState('');
  const [thinking, setThinking] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  const provider = getProvider(plan.provider);

  const refresh = useCallback(async () => {
    setLoading(true);
    setNow(new Date());
    const est = await fetchTravelEstimate(plan.pickup, plan.dropoff);
    setEstimate(est);
    const first = upcomingPlans(plan, new Date(), { estimate: est }, 1)[0];
    setRain(first ? await fetchRainProbability(plan.dropoff.latitude, plan.dropoff.longitude, first.arriveBy) : null);
    setHistory(await loadHistory());
    setLoading(false);
  }, [plan]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upcoming: DayPlan[] = useMemo(
    () => upcomingPlans(plan, now, { estimate, rainProbability: rain }, 14),
    [plan, now, estimate, rain],
  );
  const next = upcoming[0];

  // Re-sync reminders whenever the computed plan changes.
  useEffect(() => {
    if (loading) return;
    (async () => {
      const perm = await ensurePermission();
      setPermission(perm);
      setScheduled(perm === 'granted' ? await syncReminders(plan, upcoming) : 0);
    })();
  }, [loading, plan, upcoming]);

  const openProvider = async () => {
    const record = await openRideApp(plan);
    setHistory(await addHistory(record));
    if (record.status === 'failed' || record.status === 'unsupported') Alert.alert(provider.displayName, record.detail ?? '');
  };

  const ask = async () => {
    setThinking(true);
    setPending(null);
    setAgentError(null);
    const res = await parseCommand(command, plan);
    setThinking(false);
    if (res.kind === 'unavailable') return setAgentError(res.message);
    if (res.kind === 'invalid') return setAgentError(res.errors.join('\n'));
    const { intent, warnings } = res.result;
    if (intent.intent === 'unknown') return setAgentError(intent.clarifyingQuestion ?? intent.summary);
    if (intent.changes.pickupAddress || intent.changes.dropoffAddress) {
      return setAgentError('Address changes need a map lookup — please use "Edit commute".');
    }
    setPending({ intent, warnings });
  };

  const confirm = async () => {
    if (!pending) return;
    await onChange(applyIntent(plan, pending.intent, new Date().toISOString()));
    setPending(null);
    setCommand('');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >
        <Text style={type.label}>{plan.pickup.label} → {plan.dropoff.label}</Text>

        {plan.paused ? (
          <Card style={{ marginTop: space.md }}>
            <Text style={type.h1}>Commute paused</Text>
            <Text style={[type.small, { marginVertical: space.sm }]}>No reminders will fire until you resume.</Text>
            <Button title="Resume" onPress={() => onChange({ ...plan, paused: false, updatedAt: new Date().toISOString() })} />
          </Card>
        ) : !next ? (
          <Card style={{ marginTop: space.md }}>
            <Text style={type.h2}>No upcoming commute</Text>
            <Text style={type.small}>Check your working days and skipped dates.</Text>
          </Card>
        ) : (
          <Card style={{ marginTop: space.md }}>
            <Text style={type.small}>{dayLabel(next.date)} · open {provider.displayName} at</Text>
            <Text style={type.hero} accessibilityLabel={`Open ride app at ${formatTime(next.bookAt)}`}>{formatTime(next.bookAt)}</Text>
            <View style={{ flexDirection: 'row', gap: space.xl, marginVertical: space.md }}>
              <View><Text style={type.small}>Leave by</Text><Text style={type.h2}>{formatTime(next.leaveBy)}</Text></View>
              <View><Text style={type.small}>Arrive by</Text><Text style={type.h2}>{formatTime(next.arriveBy)}</Text></View>
              <View><Text style={type.small}>Travel</Text><Text style={type.h2}>{next.travelMinutes} min</Text></View>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md, flexWrap: 'wrap' }}>
              <Badge text={next.estimateSource === 'openrouteservice' ? 'Route estimate' : 'Default estimate'} tone={next.estimateSource === 'openrouteservice' ? 'ok' : 'warn'} />
              {next.adjustments.map((a) => <Badge key={a.reason} text={`${a.reason} +${a.minutes}m`} tone="info" />)}
            </View>
            <Text style={[type.small, { marginBottom: space.md }]}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>Why this time? </Text>
              {explainPlan(plan, next)}
            </Text>
            <Button
              title={provider.integration === 'prefill_handoff' ? `Open ${provider.displayName} with trip filled` : `${provider.displayName}: reminders only`}
              onPress={openProvider}
              disabled={provider.integration !== 'prefill_handoff'}
              accessibilityHint="Opens the ride app. You confirm the ride there."
            />
            <Text style={[type.small, { marginTop: space.sm, textAlign: 'center' }]}>
              {plan.budgetInr ? `Budget ₹${plan.budgetInr} · ` : ''}Fare shown in {provider.displayName}. You confirm the ride there.
            </Text>
          </Card>
        )}

        {permission === 'denied' ? (
          <Notice tone="warn" title="Notifications are off">
            Reminders can't fire. Turn on notifications for Expo Go in iOS Settings, then pull to refresh.
          </Notice>
        ) : !plan.paused && scheduled > 0 ? (
          <Notice tone="ok">{scheduled} reminders scheduled on this phone.</Notice>
        ) : null}
        {provider.integration === 'unsupported' ? <Notice tone="warn" title="Rapido">{provider.statusMessage}</Notice> : null}

        <Card>
          <Label>Tell the agent</Label>
          <Field
            label="e.g. “kal WFH hai”, “Friday 10 baje pahunchna hai”, “pause till Monday”"
            value={command}
            onChangeText={setCommand}
            maxLength={500}
            placeholder="Type a change…"
          />
          <Button title="Ask agent" variant="secondary" onPress={ask} loading={thinking} disabled={!command.trim()} />
          {agentError ? <View style={{ marginTop: space.md }}><Notice tone="warn">{agentError}</Notice></View> : null}
          {pending ? (
            <View style={{ marginTop: space.md }}>
              <Notice tone="info" title={pending.intent.summary}>
                {describeIntent(pending.intent)}
                {pending.warnings.length ? '\n' + pending.warnings.join('\n') : ''}
              </Notice>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 1 }}><Button title="Apply" onPress={confirm} /></View>
                <View style={{ flex: 1 }}><Button title="Discard" variant="ghost" onPress={() => setPending(null)} /></View>
              </View>
            </View>
          ) : null}
        </Card>

        <Card>
          <Label>Upcoming</Label>
          {upcoming.length === 0 ? <Text style={type.small}>Nothing scheduled.</Text> : null}
          {upcoming.slice(0, 5).map((d) => (
            <View key={d.date} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderColor: colors.line }}>
              <Text style={type.body}>{dayLabel(d.date)}</Text>
              <Text style={type.body}>open {formatTime(d.bookAt)} · arrive {formatTime(d.arriveBy)}</Text>
            </View>
          ))}
          {plan.skipDates.length ? <Text style={[type.small, { marginTop: space.sm }]}>Skipping: {plan.skipDates.map(dayLabel).join(', ')}</Text> : null}
        </Card>

        <Card>
          <Label>Route</Label>
          <Text style={type.body}><Text style={{ fontWeight: '600' }}>{plan.pickup.label}:</Text> {plan.pickup.address}</Text>
          <Text style={[type.body, { marginTop: space.xs }]}><Text style={{ fontWeight: '600' }}>{plan.dropoff.label}:</Text> {plan.dropoff.address}</Text>
          {estimate?.distanceKm ? <Text style={[type.small, { marginTop: space.xs }]}>{estimate.distanceKm} km by road</Text> : null}
        </Card>

        <Card>
          <Label>Hand-off history</Label>
          <Text style={[type.small, { marginBottom: space.sm }]}>We record when the ride app was opened — not whether a ride was booked.</Text>
          {history.length === 0 ? <Text style={type.small}>No hand-offs yet.</Text> : null}
          {history.slice(0, 5).map((h) => (
            <Text key={h.at} style={type.body}>
              {new Date(h.at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · {statusText(h)}
            </Text>
          ))}
        </Card>

        <View style={{ gap: space.sm }}>
          <Button title="Edit commute" variant="secondary" onPress={onEdit} />
          {!plan.paused ? <Button title="Pause reminders" variant="ghost" onPress={() => onChange({ ...plan, paused: true, updatedAt: new Date().toISOString() })} /> : null}
          <Button
            title="Delete commute"
            variant="danger"
            onPress={() =>
              Alert.alert('Delete commute?', 'This removes the schedule and all reminders from this phone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: onDelete },
              ])
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function describeIntent(i: AgentIntent): string {
  const lines: string[] = [];
  const c = i.changes;
  if (c.arrivalTime) lines.push(`Arrival time → ${c.arrivalTime} (every working day)`);
  if (c.workingDays) lines.push(`Working days → ${c.workingDays.map((d) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d - 1]).join(', ')}`);
  if (c.bufferMinutes != null) lines.push(`Safety buffer → ${c.bufferMinutes} min`);
  if (c.budgetInr != null) lines.push(`Budget → ₹${c.budgetInr}`);
  if (c.provider) lines.push(`Provider → ${c.provider}`);
  if (i.skipDates.length) lines.push(`Skip → ${i.skipDates.map(dayLabel).join(', ')}`);
  if (i.arrivalOverride) lines.push(`${dayLabel(i.arrivalOverride.date)} only → arrive by ${i.arrivalOverride.time}`);
  if (i.intent === 'pause') lines.push('Pause all reminders');
  if (i.intent === 'resume') lines.push('Resume reminders');
  return lines.length ? lines.join('\n') : 'No changes detected.';
}

function statusText(h: HandoffRecord): string {
  switch (h.status) {
    case 'opened_in_app':
    case 'opened_in_browser':
      return `Opened ${h.provider === 'uber' ? 'Uber' : 'Rapido'}`;
    case 'unsupported':
      return 'Not supported';
    default:
      return 'Failed to open';
  }
}
