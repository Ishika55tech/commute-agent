import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RouteMap from '../components/RouteMap';
import TimelineBar from '../components/TimelineBar';
import { applyIntent, type AgentIntent } from '../domain/schema';
import { buildInsights, type Insight } from '../domain/insights';
import { explainPlan, formatTime, isCommuteDay, isoWeekday, legOf, toDateKey, upcomingLegs } from '../domain/scheduler';
import type { CommutePlan, DayPlan, HandoffRecord, TravelEstimate } from '../domain/types';
import { getProvider } from '../providers';
import { fetchTravelEstimate, parseCommand } from '../services/agentApi';
import { openRideApp } from '../services/handoff';
import { ensurePermission, sendTestReminder, syncReminders, type PermissionState } from '../services/notifications';
import { addHistory, loadHistory } from '../services/storage';
import { fetchRainProbability } from '../services/weather';
import { Glass } from '../ui/Glass';
import { Backdrop, Button, Card, Chip, Field, Icon, IconTile, Notice, Pill, SectionLabel, success, tap } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

type Props = {
  plan: CommutePlan;
  onChange: (plan: CommutePlan) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
};

type Pending = { intent: AgentIntent; warnings: string[] } | null;

const QUICK = [
  { label: "I'm off tomorrow", icon: 'beach.umbrella.fill', text: "I'm off tomorrow" },
  { label: 'Late start tomorrow', icon: 'moon.zzz.fill', text: 'Tomorrow only, I need to arrive by 10:30' },
  { label: 'WFH Friday', icon: 'laptopcomputer', text: 'Working from home this Friday' },
  { label: 'Ride home 6:30 pm', icon: 'house.fill', text: 'I leave the office at 6:30 pm, remind me for the ride home' },
  { label: 'Pause reminders', icon: 'pause.fill', text: 'Pause my commute reminders' },
];

const dayLabel = (key: string) =>
  new Date(key + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return [now, setNow] as const;
}

function countdown(to: Date, now: Date): string {
  const mins = Math.max(0, Math.round((to.getTime() - now.getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export default function DashboardScreen({ plan, onChange, onEdit, onDelete }: Props) {
  const insets = useSafeAreaInsets();
  const [now, setNow] = useNow();
  const [estimate, setEstimate] = useState<TravelEstimate | null>(null);
  const [rain, setRain] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [scheduled, setScheduled] = useState(0);
  const [history, setHistory] = useState<HandoffRecord[]>([]);
  const [showWhy, setShowWhy] = useState(false);
  const [testSent, setTestSent] = useState(false);

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
    const first = upcomingLegs(plan, new Date(), { estimate: est }, 1)[0];
    const at = first && legOf(first) === 'back' ? plan.pickup : plan.dropoff;
    setRain(first ? await fetchRainProbability(at.latitude, at.longitude, first.arriveBy) : null);
    setHistory(await loadHistory());
    setLoading(false);
  }, [plan, setNow]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upcoming: DayPlan[] = useMemo(
    () => upcomingLegs(plan, now, { estimate, rainProbability: rain }, 30),
    [plan, now, estimate, rain],
  );
  const next = upcoming[0];

  // Re-sync reminders only when the actual schedule changes (not on every clock tick).
  const syncKey = useMemo(
    () => JSON.stringify([plan.paused, plan.provider, plan.budgetInr, plan.dropoff.label, upcoming.map((d) => [d.leg, d.bookAt.getTime(), d.leaveBy.getTime()])]),
    [plan, upcoming],
  );
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      const perm = await ensurePermission();
      if (cancelled) return;
      setPermission(perm);
      setScheduled(perm === 'granted' ? await syncReminders(plan, upcoming) : 0);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, syncKey]);

  const openProvider = async () => {
    const record = await openRideApp(plan, next ? legOf(next) : 'to');
    setHistory(await addHistory(record));
    if (record.status === 'failed' || record.status === 'unsupported') Alert.alert(provider.displayName, record.detail ?? '');
  };

  const testReminder = async () => {
    if (!next) return;
    if ((await ensurePermission()) !== 'granted') {
      Alert.alert('Notifications are off', 'Turn on notifications for Expo Go in iOS Settings to receive reminders.');
      return;
    }
    await sendTestReminder(plan, next, 8);
    success();
    setTestSent(true);
    setTimeout(() => setTestSent(false), 9000);
  };

  const ask = async (text = command) => {
    setThinking(true);
    setPending(null);
    setAgentError(null);
    const res = await parseCommand(text, plan);
    setThinking(false);
    if (res.kind === 'unavailable') return setAgentError(res.message);
    if (res.kind === 'invalid') return setAgentError(res.errors.join('\n'));
    const { intent, warnings } = res.result;
    if (intent.intent === 'unknown') return setAgentError(intent.clarifyingQuestion ?? intent.summary);
    if (intent.changes.provider && intent.changes.provider !== 'uber') {
      return setAgentError('Only Uber is supported right now.');
    }
    if (intent.changes.pickupAddress || intent.changes.dropoffAddress) {
      return setAgentError('Changing an address needs a pin on the map — tap "Edit route & schedule".');
    }
    tap();
    setPending({ intent, warnings });
  };

  const confirm = async () => {
    if (!pending) return;
    await onChange(applyIntent(plan, pending.intent, new Date().toISOString()));
    success();
    setPending(null);
    setCommand('');
  };

  const week = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const key = toDateKey(d);
      const working = plan.workingDays.includes(isoWeekday(d));
      return {
        key,
        dow: d.toLocaleDateString('en-IN', { weekday: 'narrow' }),
        date: d.getDate(),
        active: isCommuteDay(plan, d),
        skipped: working && plan.skipDates.includes(key),
        late: !!plan.arrivalOverrides[key],
        today: i === 0,
      };
    });
  }, [now, plan]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selectedKey = selectedDay ?? next?.date ?? toDateKey(now);
  const selectedLegs = upcoming.filter((d) => d.date === selectedKey);
  const selectedWeek = week.find((d) => d.key === selectedKey);
  const selectedInfo = !selectedWeek ? null : selectedLegs.length ? (
    <View style={{ gap: 12 }}>
      {selectedLegs.map((l) => (
        <View key={l.leg} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile name={legOf(l) === 'back' ? 'house.fill' : 'building.2.fill'} color={legOf(l) === 'back' ? colors.sky : colors.accent} bg={legOf(l) === 'back' ? colors.skySoft : colors.accentSoft} />
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '700' }]}>
              {legOf(l) === 'back' ? 'Ride home' : `To ${plan.dropoff.label}`} · {dayLabel(l.date)}
              {legOf(l) === 'to' && plan.arrivalOverrides[l.date] ? ' · custom time' : ''}
            </Text>
            <Text style={type.caption}>Book {formatTime(l.bookAt)} · leave {formatTime(l.leaveBy)} · arrive {formatTime(l.arriveBy)}</Text>
          </View>
        </View>
      ))}
    </View>
  ) : selectedWeek.skipped ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <IconTile name="beach.umbrella.fill" color={colors.amber} bg={colors.amberSoft} />
      <Text style={[type.small, { flex: 1 }]}>{dayLabel(selectedWeek.key)} is skipped — no reminders.</Text>
      <Button
        title="Undo"
        variant="ghost"
        onPress={() => onChange({ ...plan, skipDates: plan.skipDates.filter((k) => k !== selectedWeek.key), updatedAt: new Date().toISOString() })}
      />
    </View>
  ) : (
    <Text style={type.small}>
      {selectedWeek.today && selectedWeek.active ? "Today's ride time has passed." : `${dayLabel(selectedWeek.key)} — no commute.`}
    </Text>
  );

  const lastHandoff = history[0];

  const insights = useMemo(
    () => buildInsights({ plan, now, upcoming, providerName: provider.displayName, canOpenProvider: provider.integration === 'prefill_handoff' }),
    [plan, now, upcoming, provider],
  );
  const runInsight = (i: Insight) => {
    tap();
    if (i.action === 'open_ride') openProvider();
    else if (i.action === 'edit') onEdit();
    else if (i.action === 'undo_skip_tomorrow') {
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      onChange({ ...plan, skipDates: plan.skipDates.filter((k) => k !== toDateKey(t)), updatedAt: new Date().toISOString() });
    }
  };

  const shareEta = async () => {
    if (!next) return;
    tap();
    try {
      await Share.share({
        message: `On my way to ${plan.dropoff.label} — leaving at ${formatTime(next.leaveBy)}, reaching by ${formatTime(next.arriveBy)}.`,
      });
    } catch {
      // user cancelled
    }
  };

  const openMenu = () => {
    tap();
    const pauseLabel = plan.paused ? 'Resume reminders' : 'Pause reminders';
    const togglePause = () => onChange({ ...plan, paused: !plan.paused, updatedAt: new Date().toISOString() });
    const confirmDelete = () =>
      Alert.alert('Delete commute?', 'This removes the schedule and all reminders from this phone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Edit route & schedule', pauseLabel, 'Delete commute', 'Cancel'], destructiveButtonIndex: 2, cancelButtonIndex: 3, userInterfaceStyle: 'dark' },
        (i) => (i === 0 ? onEdit() : i === 1 ? togglePause() : i === 2 ? confirmDelete() : undefined),
      );
    } else {
      Alert.alert('Commute', undefined, [
        { text: 'Edit', onPress: onEdit },
        { text: pauseLabel, onPress: togglePause },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ]);
    }
  };

  const MAP_H = 320 + insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
      >
        {/* Map hero */}
        <View style={{ height: MAP_H }}>
          <RouteMap pickup={plan.pickup} dropoff={plan.dropoff} topInset={insets.top} />
          <View style={[styles.topBar, { top: insets.top + 8 }]}>
            <Glass radius={radius.pill} variant="clear" style={styles.routeChip}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                <Text style={styles.routeText} numberOfLines={1}>{plan.pickup.label}</Text>
                <Icon name="arrow.right" size={12} color={colors.inkSoft} />
                <View style={[styles.dot, { backgroundColor: colors.sky }]} />
                <Text style={styles.routeText} numberOfLines={1}>{plan.dropoff.label}</Text>
                {estimate?.distanceKm ? <Text style={[styles.routeText, { color: colors.inkSoft }]}>· {estimate.distanceKm} km</Text> : null}
              </View>
            </Glass>
            <Pressable accessibilityRole="button" accessibilityLabel="Commute settings" onPress={openMenu}>
              <Glass radius={22} variant="clear" interactive style={styles.circle}>
                <Icon name="ellipsis" size={18} color={colors.ink} />
              </Glass>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: space.lg, marginTop: -96 }}>
          {/* Proactive agent: rules that speak up first (no LLM, unit-tested) */}
          {insights.map((i) => (
            <Glass key={i.id} style={styles.insight} tint={i.tone === 'warn' ? colors.amberSoft : colors.violetSoft}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <IconTile name={i.icon} color={i.tone === 'warn' ? colors.amber : colors.violet} bg={i.tone === 'warn' ? colors.amberSoft : colors.violetSoft} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <Icon name="sparkles" size={11} color={colors.violet} />
                    <Text style={[type.label, { color: colors.violet, fontSize: 10.5 }]}>Agent</Text>
                  </View>
                  <Text style={[type.body, { fontWeight: '700' }]}>{i.title}</Text>
                  {i.body ? <Text style={[type.small, { marginTop: 2 }]}>{i.body}</Text> : null}
                  {i.action && i.actionLabel ? (
                    <Pressable accessibilityRole="button" onPress={() => runInsight(i)} style={styles.insightAction} hitSlop={6}>
                      <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 14 }}>{i.actionLabel}</Text>
                      <Icon name="arrow.right" size={12} color={colors.accent} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </Glass>
          ))}

          {/* Next ride hero */}
          {plan.paused ? (
            <Card>
              <Pill text="Paused" tone="warn" icon="pause.fill" />
              <Text style={[type.hero, { marginTop: space.md }]}>Reminders are paused</Text>
              <Text style={[type.small, { marginVertical: space.md }]}>No reminders will fire until you resume.</Text>
              <Button title="Resume my commute" icon="play.fill" onPress={() => onChange({ ...plan, paused: false, updatedAt: new Date().toISOString() })} />
            </Card>
          ) : !next ? (
            <Card>
              <Text style={type.h2}>No upcoming commute</Text>
              <Text style={[type.small, { marginTop: 4 }]}>Check your working days and skipped dates.</Text>
            </Card>
          ) : (
            <Glass style={styles.hero}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={type.label}>{legOf(next) === 'back' ? 'Ride home' : `To ${plan.dropoff.label}`} · {dayLabel(next.date)}</Text>
                <Pill
                  text={next.estimateSource === 'openrouteservice' ? 'Live route' : 'Estimated'}
                  tone={next.estimateSource === 'openrouteservice' ? 'ok' : 'warn'}
                  icon={next.estimateSource === 'openrouteservice' ? 'location.north.line.fill' : 'questionmark'}
                />
              </View>

              <Text style={[type.caption, { marginTop: space.md }]}>Open {provider.displayName} in</Text>
              <Text style={type.display} accessibilityLabel={`Open ${provider.displayName} in ${countdown(next.bookAt, now)}`}>
                {countdown(next.bookAt, now)}
              </Text>

              <View style={styles.stats}>
                <Stat icon="iphone.gen3" label="Book" value={formatTime(next.bookAt)} color={colors.violet} />
                <Stat icon="figure.walk" label="Leave" value={formatTime(next.leaveBy)} color={colors.accent} />
                <Stat icon="flag.checkered" label="Arrive" value={formatTime(next.arriveBy)} color={colors.sky} />
              </View>

              <TimelineBar plan={plan} day={next} />

              {next.adjustments.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md }}>
                  {next.adjustments.map((a) => (
                    <Pill key={a.reason} text={`${a.reason} +${a.minutes}m`} tone={a.reason.startsWith('Rain') ? 'warn' : 'info'} icon={a.reason.startsWith('Rain') ? 'cloud.rain.fill' : 'car.2.fill'} />
                  ))}
                </View>
              ) : null}

              <Pressable accessibilityRole="button" onPress={() => setShowWhy((v) => !v)} style={styles.why}>
                <Icon name="sparkles" size={13} color={colors.violet} />
                <Text style={{ color: colors.violet, fontWeight: '700', fontSize: 13.5 }}>Why this time?</Text>
                <Icon name={showWhy ? 'chevron.up' : 'chevron.down'} size={11} color={colors.violet} />
              </Pressable>
              {showWhy ? <Text style={[type.small, { marginTop: 6 }]}>{explainPlan(plan, next)}</Text> : null}

              <View style={{ marginTop: space.lg, gap: space.sm }}>
                <Button
                  title={provider.integration === 'prefill_handoff' ? `Open ${provider.displayName} · trip ready` : `${provider.displayName}: reminders only`}
                  icon="car.fill"
                  onPress={openProvider}
                  disabled={provider.integration !== 'prefill_handoff'}
                  accessibilityHint="Opens the ride app with pickup and drop-off filled in. You confirm the ride there."
                />
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button
                    title={testSent ? 'Arriving…' : 'Test reminder'}
                    icon={testSent ? 'bell.and.waves.left.and.right.fill' : 'bell.badge.fill'}
                    variant="glass"
                    onPress={testReminder}
                    disabled={testSent}
                    style={{ flex: 1 }}
                  />
                  <Button title="Share ETA" icon="square.and.arrow.up" variant="glass" onPress={shareEta} style={{ flex: 1 }} />
                </View>
              </View>
              <Text style={[type.caption, { textAlign: 'center', marginTop: space.sm }]}>
                {plan.budgetInr ? `Budget ₹${plan.budgetInr} · ` : ''}You see the fare and confirm the ride in {provider.displayName}.
              </Text>
              {lastHandoff ? (
                <Text style={[type.caption, { textAlign: 'center', marginTop: 4 }]}>
                  Last: {statusText(lastHandoff)} · {new Date(lastHandoff.at).toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
              ) : null}
            </Glass>
          )}

          {permission === 'denied' ? (
            <Notice tone="warn" title="Notifications are off">Reminders can't reach you. Turn on notifications for Expo Go in iOS Settings, then pull to refresh.</Notice>
          ) : null}
          {provider.integration === 'unsupported' ? <Notice tone="warn" title="Rapido">{provider.statusMessage}</Notice> : null}

          {/* Agent */}
          <Card tint={colors.violetSoft}>
            <SectionLabel icon="sparkles">Commute agent</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.md }}>
              {QUICK.map((q) => (
                <Chip key={q.label} label={q.label} icon={q.icon} tone="violet" onPress={() => { setCommand(q.text); ask(q.text); }} />
              ))}
            </View>
            <Field
              placeholder="Tell me about a change, in English"
              value={command}
              onChangeText={setCommand}
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => command.trim() && ask()}
              right={
                <Pressable accessibilityRole="button" accessibilityLabel="Ask agent" disabled={!command.trim() || thinking} onPress={() => ask()} hitSlop={10}>
                  <Icon name={thinking ? 'ellipsis' : 'arrow.up.circle.fill'} size={28} color={command.trim() ? colors.violet : colors.faint} />
                </Pressable>
              }
            />
            {thinking ? <Notice tone="ai" title="Thinking…">Understanding your message. This can take a few seconds.</Notice> : null}
            {agentError ? <Notice tone="warn">{agentError}</Notice> : null}
            {pending ? (
              <View>
                <Notice tone="ai" title={pending.intent.summary}>
                  {describeIntent(pending.intent)}
                  {pending.warnings.length ? '\n' + pending.warnings.join('\n') : ''}
                </Notice>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button title="Apply" icon="checkmark" onPress={confirm} style={{ flex: 1 }} />
                  <Button title="Discard" variant="glass" onPress={() => setPending(null)} style={{ flex: 1 }} />
                </View>
              </View>
            ) : null}
          </Card>

          {/* Week: one strip replaces the old Upcoming list — tap a day for its times */}
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <SectionLabel icon="calendar">This week</SectionLabel>
              {!plan.paused && scheduled > 0 ? <Pill text={`${scheduled} alerts set`} tone="ok" icon="bell.fill" /> : null}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {week.map((d) => {
                const selected = d.key === selectedKey;
                return (
                  <Pressable
                    key={d.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${dayLabel(d.key)}: ${d.skipped ? 'skipped' : d.active ? 'commute' : 'off'}`}
                    onPress={() => { tap(); setSelectedDay(d.key); }}
                    style={{ alignItems: 'center', gap: 6 }}
                  >
                    <Text style={[type.caption, d.today && { color: colors.accent, fontWeight: '700' }]}>{d.dow}</Text>
                    <View
                      style={[
                        styles.weekDot,
                        d.active && { backgroundColor: colors.accent },
                        d.skipped && { backgroundColor: colors.amberSoft, borderColor: colors.amber },
                        d.today && !d.active && { borderColor: colors.accent },
                        selected && styles.weekSelected,
                      ]}
                    >
                      <Text style={{ color: d.active ? colors.accentInk : d.skipped ? colors.amber : colors.inkSoft, fontWeight: '800' }}>{d.date}</Text>
                    </View>
                    <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: d.late ? colors.violet : 'transparent' }} />
                  </Pressable>
                );
              })}
            </View>
            {selectedInfo ? <View style={styles.dayDetail}>{selectedInfo}</View> : null}
          </Card>

        </View>
      </ScrollView>
    </View>
  );
}

function Stat({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon name={icon} size={12} color={color} />
        <Text style={type.caption}>{label}</Text>
      </View>
      <Text style={[type.stat, { marginTop: 2 }]}>{value}</Text>
    </View>
  );
}



function describeIntent(i: AgentIntent): string {
  const lines: string[] = [];
  const c = i.changes;
  if (c.arrivalTime) lines.push(`Arrival time → ${c.arrivalTime} (every working day)`);
  if (c.workingDays) lines.push(`Working days → ${c.workingDays.map((d) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d - 1]).join(', ')}`);
  if (c.bufferMinutes != null) lines.push(`Safety buffer → ${c.bufferMinutes} min`);
  if (c.budgetInr != null) lines.push(`Budget → ₹${c.budgetInr}`);
  if (c.provider) lines.push(`Ride app → ${c.provider === 'uber' ? 'Uber' : 'Rapido'}`);
  if (c.returnDepartTime) lines.push(`Ride home → leave at ${c.returnDepartTime} on working days`);
  if (c.returnEnabled === false) lines.push('Ride home reminders → off');
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

const styles = StyleSheet.create({
  topBar: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  routeChip: { flex: 1, paddingHorizontal: 14, paddingVertical: 11 },
  routeText: { color: colors.ink, fontWeight: '700', fontSize: 14, flexShrink: 1 },
  circle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hero: { padding: space.xl, marginBottom: space.md },
  stats: { flexDirection: 'row', marginTop: space.md, marginBottom: space.lg },
  why: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.lg, alignSelf: 'flex-start', minHeight: 32 },
  weekDot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  weekSelected: { transform: [{ scale: 1.12 }], borderColor: colors.ink, borderWidth: 2 },
  insight: { padding: space.lg, marginBottom: space.md },
  insightAction: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm, alignSelf: 'flex-start', minHeight: 32 },
  dayDetail: { marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
});
