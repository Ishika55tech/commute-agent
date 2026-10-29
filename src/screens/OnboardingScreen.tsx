// Onboarding / edit in 4 calm steps:
//   0 Tell the agent (optional, English)  →  1 Pickup pin  →  2 Destination pin  →  3 Schedule
// The agent only PRE-FILLS. Every value is visible and editable, and nothing is
// saved until the user taps "Start my commute" (human in the loop).

import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PlacePicker from '../components/PlacePicker';
import Segmented from '../components/Segmented';
import TimeStepper from '../components/TimeStepper';
import type { CommutePlan, IsoWeekday, Place, ProviderId } from '../domain/types';
import { getProvider } from '../providers';
import { parseCommand } from '../services/agentApi';
import { Glass } from '../ui/Glass';
import { Backdrop, Button, Card, Chip, Field, Icon, Notice, SectionLabel, success } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

const DAYS: { iso: IsoWeekday; short: string }[] = [
  { iso: 1, short: 'M' }, { iso: 2, short: 'T' }, { iso: 3, short: 'W' }, { iso: 4, short: 'T' },
  { iso: 5, short: 'F' }, { iso: 6, short: 'S' }, { iso: 7, short: 'S' },
];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const EXAMPLES = [
  'Every weekday from Vijay Nagar, Indore to Apollo Premier. I need to be there by 9:30 and I leave at 6:30 pm.',
  'Monday to Saturday from my PG in Koramangala, Bengaluru to Embassy Tech Village by 10.',
];

type Props = { initial: CommutePlan | null; onSaved: (plan: CommutePlan) => void; onCancel?: () => void };
type AgentNote = { tone: 'ai' | 'warn' | 'danger'; title: string; text?: string };

export default function OnboardingScreen({ initial, onSaved, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(initial ? 1 : 0);

  const [pickup, setPickup] = useState<Place | null>(initial?.pickup ?? null);
  const [dropoff, setDropoff] = useState<Place | null>(initial?.dropoff ?? null);
  const [pickupHint, setPickupHint] = useState<string | undefined>();
  const [dropoffHint, setDropoffHint] = useState<string | undefined>();
  const [arrival, setArrival] = useState(initial?.arrivalTime ?? '09:30');
  const [days, setDays] = useState<IsoWeekday[]>(initial?.workingDays ?? [1, 2, 3, 4, 5]);
  const [buffer, setBuffer] = useState(initial?.bufferMinutes ?? 10);
  const [driverWait, setDriverWait] = useState(initial?.driverWaitMinutes ?? 8);
  const [budget, setBudget] = useState(initial?.budgetInr != null ? String(initial.budgetInr) : '');
  // Only Uber is offered in the UI (owner decision, D-020). The Rapido adapter stays in code for the pitch.
  const provider: ProviderId = 'uber';
  const [returnOn, setReturnOn] = useState(initial?.returnTrip?.enabled ?? false);
  const [returnTime, setReturnTime] = useState(initial?.returnTrip?.departTime ?? '18:30');

  const [command, setCommand] = useState('');
  const [thinking, setThinking] = useState(false);
  const [note, setNote] = useState<AgentNote | null>(null);

  const askAgent = async () => {
    setThinking(true);
    setNote(null);
    const res = await parseCommand(command, initial);
    setThinking(false);
    if (res.kind === 'unavailable') return setNote({ tone: 'warn', title: 'Agent unavailable', text: res.message });
    if (res.kind === 'invalid') return setNote({ tone: 'danger', title: "I couldn't use that safely", text: res.errors.join('\n') });
    const { intent, warnings } = res.result;
    const c = intent.changes;
    if (c.pickupAddress) setPickupHint(c.pickupAddress);
    if (c.dropoffAddress) setDropoffHint(c.dropoffAddress);
    if (c.arrivalTime) setArrival(c.arrivalTime);
    if (c.workingDays) setDays([...new Set(c.workingDays)].sort((a, b) => a - b) as IsoWeekday[]);
    if (c.bufferMinutes != null) setBuffer(c.bufferMinutes);
    if (c.budgetInr != null) setBudget(String(c.budgetInr));
    if (c.returnDepartTime) {
      setReturnOn(true);
      setReturnTime(c.returnDepartTime);
    }
    if (c.returnEnabled === false) setReturnOn(false);
    if (intent.intent === 'unknown') {
      return setNote({ tone: 'warn', title: intent.clarifyingQuestion ?? intent.summary });
    }
    success();
    setNote({
      tone: 'ai',
      title: intent.summary,
      text: [...warnings, intent.clarifyingQuestion ?? '', 'Next: confirm the exact pickup and drop-off pins.'].filter(Boolean).join('\n'),
    });
  };

  const toggleDay = (d: IsoWeekday) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));

  const canContinue = step === 0 || (step === 1 && !!pickup) || (step === 2 && !!dropoff) || (step === 3 && days.length > 0);

  const save = () => {
    if (!pickup || !dropoff || !days.length) return;
    const now = new Date().toISOString();
    success();
    onSaved({
      id: initial?.id ?? `plan-${Date.now()}`,
      pickup,
      dropoff,
      arrivalTime: arrival,
      workingDays: days,
      bufferMinutes: buffer,
      driverWaitMinutes: driverWait,
      budgetInr: budget && Number.isInteger(Number(budget)) ? Number(budget) : null,
      provider,
      paused: initial?.paused ?? false,
      skipDates: initial?.skipDates ?? [],
      arrivalOverrides: initial?.arrivalOverrides ?? {},
      returnTrip: { enabled: returnOn, departTime: returnTime },
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    });
  };

  const next = () => (step < 3 ? setStep(step + 1) : save());
  const back = () => (step > (initial ? 1 : 0) ? setStep(step - 1) : onCancel?.());

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Progress step={step} hasIntro={!initial} />

          {step === 0 ? (
            <View>
              <View style={styles.logo}>
                <Icon name="car.side.fill" size={30} color={colors.accentInk} />
              </View>
              <Text style={[type.hero, { marginTop: space.lg }]}>Your daily ride,{'\n'}planned for you.</Text>
              <Text style={[type.small, { marginTop: space.sm, marginBottom: space.xl, fontSize: 15.5 }]}>
                Tell the agent your routine once. It works out when to book, when to leave, and reminds you every working day.
              </Text>

              <Card>
                <SectionLabel icon="sparkles">Tell the agent</SectionLabel>
                <Field
                  placeholder="e.g. Every weekday from my home in Vijay Nagar, Indore to Crystal IT Park. Arrive by 9:30."
                  value={command}
                  onChangeText={setCommand}
                  multiline
                  maxLength={500}
                  style={{ minHeight: 96, textAlignVertical: 'top' }}
                />
                <View style={{ gap: 8, marginBottom: space.md }}>
                  {EXAMPLES.map((e) => (
                    <Pressable key={e} accessibilityRole="button" onPress={() => setCommand(e)} style={styles.example}>
                      <Icon name="text.quote" size={12} color={colors.violet} />
                      <Text style={[type.caption, { flex: 1, color: colors.inkSoft }]} numberOfLines={2}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
                <Button title="Let the agent fill it in" icon="sparkles" onPress={askAgent} loading={thinking} disabled={!command.trim()} />
                {note ? (
                  <View style={{ marginTop: space.md }}>
                    <Notice tone={note.tone} title={note.title}>{note.text}</Notice>
                  </View>
                ) : null}
              </Card>
              <Text style={[type.caption, { textAlign: 'center' }]}>
                English only. The agent never books or saves anything — you review every step.
              </Text>
            </View>
          ) : null}

          {step === 1 ? (
            <StepShell icon="figure.wave" title="Where do we pick you up?" sub="Get the pin onto your exact gate — that's the point Uber will use.">
              <PlacePicker role="pickup" value={pickup} suggestedAddress={pickupHint} nameOptions={['Home', 'PG', 'Hostel']} onChange={setPickup} />
            </StepShell>
          ) : null}

          {step === 2 ? (
            <StepShell icon="building.2.fill" title="Where are you headed?" sub="Search your building or company name, then drop the pin at the entrance you use.">
              <PlacePicker
                role="dropoff"
                value={dropoff}
                suggestedAddress={dropoffHint}
                nameOptions={['Office', 'College', 'Work']}
                near={pickup ? { latitude: pickup.latitude, longitude: pickup.longitude } : undefined}
                onChange={setDropoff}
              />
            </StepShell>
          ) : null}

          {step === 3 ? (
            <StepShell icon="clock.fill" title="When do you need to be there?" sub="The agent works backwards from this time every day.">
              <TimeStepper value={arrival} onChange={setArrival} />

              <Text style={[type.label, { marginTop: space.xl, marginBottom: space.md }]}>Working days</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {DAYS.map((d) => {
                  const on = days.includes(d.iso);
                  return (
                    <Pressable
                      key={d.iso}
                      accessibilityRole="checkbox"
                      accessibilityLabel={DAY_NAMES[d.iso - 1]}
                      accessibilityState={{ checked: on }}
                      onPress={() => toggleDay(d.iso)}
                      style={[styles.day, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                    >
                      <Text style={{ color: on ? colors.accentInk : colors.inkSoft, fontWeight: '800', fontSize: 15 }}>{d.short}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.returnRow}>
                <View style={{ flex: 1 }}>
                  <Text style={type.h2}>Ride home too</Text>
                  <Text style={type.caption}>Get a reminder to book your evening ride back.</Text>
                </View>
                <Switch
                  value={returnOn}
                  onValueChange={setReturnOn}
                  trackColor={{ true: colors.accent, false: colors.faint }}
                  accessibilityLabel="Ride home reminders"
                />
              </View>
              {returnOn ? (
                <View style={{ marginTop: space.md }}>
                  <TimeStepper value={returnTime} onChange={setReturnTime} label="Leave office at" />
                </View>
              ) : null}

              <Text style={[type.label, { marginTop: space.xl, marginBottom: space.md }]}>Safety buffer</Text>
              <Segmented
                value={buffer}
                onChange={setBuffer}
                options={[{ value: 5, label: '5 min' }, { value: 10, label: '10 min' }, { value: 15, label: '15 min' }, { value: 20, label: '20 min' }]}
              />

              <Text style={[type.label, { marginTop: space.xl, marginBottom: space.md }]}>Driver usually reaches you in</Text>
              <Segmented
                value={driverWait}
                onChange={setDriverWait}
                options={[{ value: 5, label: '5 min' }, { value: 8, label: '8 min' }, { value: 12, label: '12 min' }]}
              />

              <Text style={[type.label, { marginTop: space.xl, marginBottom: space.md }]}>Ride app</Text>
              <View style={styles.providerRow}>
                <Icon name="car.fill" size={18} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontWeight: '700' }]}>Uber</Text>
                  <Text style={type.caption}>{getProvider('uber').statusMessage}</Text>
                </View>
              </View>

              <View style={{ marginTop: space.xl }}>
                <Field label="Max fare (optional)" icon="indianrupeesign" placeholder="150" value={budget} onChangeText={setBudget} keyboardType="number-pad" />
              </View>
            </StepShell>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <Glass radius={0} style={[styles.bottomBar, { paddingBottom: insets.bottom + space.md }]}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          {step > (initial ? 1 : 0) || onCancel ? (
            <Button title={step > (initial ? 1 : 0) ? 'Back' : 'Cancel'} variant="glass" onPress={back} style={{ flex: 1 }} />
          ) : null}
          <Button
            title={step === 0 ? (command.trim() && note?.tone === 'ai' ? 'Confirm pins' : 'Set up step by step') : step === 3 ? (initial ? 'Save changes' : 'Start my commute') : 'Continue'}
            icon={step === 3 ? 'checkmark' : 'arrow.right'}
            onPress={next}
            disabled={!canContinue}
            style={{ flex: 2 }}
          />
        </View>
      </Glass>
    </View>
  );
}

function StepShell({ icon, title, sub, children }: { icon: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <View>
      <View style={styles.stepIcon}>
        <Icon name={icon} size={22} color={colors.accent} />
      </View>
      <Text style={[type.h1, { marginTop: space.md }]}>{title}</Text>
      <Text style={[type.small, { marginTop: 6, marginBottom: space.xl }]}>{sub}</Text>
      {children}
    </View>
  );
}

function Progress({ step, hasIntro }: { step: number; hasIntro: boolean }) {
  const steps = hasIntro ? [0, 1, 2, 3] : [1, 2, 3];
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: space.xl }} accessibilityLabel={`Step ${steps.indexOf(step) + 1} of ${steps.length}`}>
      {steps.map((s) => (
        <View key={s} style={[styles.bar, { backgroundColor: s <= step ? colors.accent : colors.faint }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  stepIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  example: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.violetSoft, borderRadius: radius.sm, padding: 10 },
  day: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.sm, backgroundColor: colors.accentSoft },
  returnRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md },
});
