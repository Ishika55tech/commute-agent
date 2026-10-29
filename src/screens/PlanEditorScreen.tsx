// Onboarding + edit. The AI box only PRE-FILLS the form; nothing is saved
// until the user reviews the fields and taps Save (human in the loop).

import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isValidTime } from '../domain/scheduler';
import type { CommutePlan, IsoWeekday, Place, ProviderId } from '../domain/types';
import { getProvider } from '../providers';
import { parseCommand } from '../services/agentApi';
import { geocodePlace } from '../services/geocode';
import { Badge, Button, Card, Chip, Field, Label, Notice } from '../ui/components';
import { colors, space, type } from '../ui/theme';

const DAYS: { iso: IsoWeekday; short: string }[] = [
  { iso: 1, short: 'Mon' }, { iso: 2, short: 'Tue' }, { iso: 3, short: 'Wed' }, { iso: 4, short: 'Thu' },
  { iso: 5, short: 'Fri' }, { iso: 6, short: 'Sat' }, { iso: 7, short: 'Sun' },
];

type Props = { initial: CommutePlan | null; onSaved: (plan: CommutePlan) => void; onCancel?: () => void };

type AgentNote = { tone: 'ok' | 'warn' | 'danger' | 'info'; title: string; text: string };

export default function PlanEditorScreen({ initial, onSaved, onCancel }: Props) {
  const [pickupLabel, setPickupLabel] = useState(initial?.pickup.label ?? 'Home');
  const [pickupAddress, setPickupAddress] = useState(initial?.pickup.address ?? '');
  const [dropoffLabel, setDropoffLabel] = useState(initial?.dropoff.label ?? 'Office');
  const [dropoffAddress, setDropoffAddress] = useState(initial?.dropoff.address ?? '');
  const [arrivalTime, setArrivalTime] = useState(initial?.arrivalTime ?? '09:30');
  const [days, setDays] = useState<IsoWeekday[]>(initial?.workingDays ?? [1, 2, 3, 4, 5]);
  const [buffer, setBuffer] = useState(String(initial?.bufferMinutes ?? 10));
  const [driverWait, setDriverWait] = useState(String(initial?.driverWaitMinutes ?? 8));
  const [budget, setBudget] = useState(initial?.budgetInr != null ? String(initial.budgetInr) : '');
  const [provider, setProvider] = useState<ProviderId>(initial?.provider ?? 'uber');

  const [command, setCommand] = useState('');
  const [thinking, setThinking] = useState(false);
  const [agentNote, setAgentNote] = useState<AgentNote | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const askAgent = async () => {
    setThinking(true);
    setAgentNote(null);
    const res = await parseCommand(command, initial);
    setThinking(false);
    if (res.kind === 'unavailable') return setAgentNote({ tone: 'warn', title: 'AI unavailable', text: res.message });
    if (res.kind === 'invalid') {
      return setAgentNote({ tone: 'danger', title: "Couldn't understand that safely", text: res.errors.join('\n') });
    }
    const { intent, warnings } = res.result;
    const c = intent.changes;
    if (c.pickupLabel) setPickupLabel(c.pickupLabel);
    if (c.pickupAddress) setPickupAddress(c.pickupAddress);
    if (c.dropoffLabel) setDropoffLabel(c.dropoffLabel);
    if (c.dropoffAddress) setDropoffAddress(c.dropoffAddress);
    if (c.arrivalTime) setArrivalTime(c.arrivalTime);
    if (c.workingDays) setDays([...new Set(c.workingDays)].sort((a, b) => a - b) as IsoWeekday[]);
    if (c.bufferMinutes != null) setBuffer(String(c.bufferMinutes));
    if (c.budgetInr != null) setBudget(String(c.budgetInr));
    if (c.provider) setProvider(c.provider);

    const extra = [
      ...warnings,
      intent.clarifyingQuestion ?? '',
      intent.skipDates.length || intent.arrivalOverride ? 'Skips and one-day changes can be made from the dashboard after saving.' : '',
    ].filter(Boolean);
    setAgentNote({
      tone: intent.intent === 'unknown' ? 'info' : 'ok',
      title: intent.summary,
      text: (extra.length ? extra.join('\n') + '\n' : '') + 'Review the fields below, then tap Save.',
    });
  };

  const toggleDay = (d: IsoWeekday) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));

  const validate = () => {
    const e: Record<string, string> = {};
    if (pickupAddress.trim().length < 3) e.pickupAddress = 'Enter the pickup address';
    if (dropoffAddress.trim().length < 3) e.dropoffAddress = 'Enter the destination address';
    if (!isValidTime(arrivalTime)) e.arrivalTime = 'Use 24h HH:MM, e.g. 09:30';
    if (!days.length) e.days = 'Pick at least one day';
    const b = Number(buffer);
    if (!Number.isInteger(b) || b < 0 || b > 60) e.buffer = '0-60 minutes';
    const w = Number(driverWait);
    if (!Number.isInteger(w) || w < 0 || w > 30) e.driverWait = '0-30 minutes';
    if (budget && (!Number.isInteger(Number(budget)) || Number(budget) < 0)) e.budget = 'Whole rupees only';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const resolvePlace = async (label: string, address: string, previous?: Place): Promise<Place | string> => {
    if (previous && previous.address === address.trim()) return { ...previous, label };
    const r = await geocodePlace(label, address);
    return r.ok ? r.place : r.message;
  };

  const save = async () => {
    setSaveError(null);
    if (!validate()) return;
    setSaving(true);
    const [p, d] = await Promise.all([
      resolvePlace(pickupLabel.trim() || 'Pickup', pickupAddress, initial?.pickup),
      resolvePlace(dropoffLabel.trim() || 'Destination', dropoffAddress, initial?.dropoff),
    ]);
    setSaving(false);
    if (typeof p === 'string' || typeof d === 'string') {
      setSaveError([p, d].filter((x) => typeof x === 'string').join('\n'));
      return;
    }
    const now = new Date().toISOString();
    onSaved({
      id: initial?.id ?? `plan-${Date.now()}`,
      pickup: p,
      dropoff: d,
      arrivalTime,
      workingDays: days,
      bufferMinutes: Number(buffer),
      driverWaitMinutes: Number(driverWait),
      budgetInr: budget ? Number(budget) : null,
      provider,
      paused: initial?.paused ?? false,
      skipDates: initial?.skipDates ?? [],
      arrivalOverrides: initial?.arrivalOverrides ?? {},
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Text style={type.h1}>{initial ? 'Edit commute' : 'Set up your commute'}</Text>
          <Text style={[type.small, { marginTop: space.xs, marginBottom: space.lg }]}>
            Tell the agent once. It works out when to leave and reminds you every working day.
          </Text>

          <Card>
            <Label>Describe it in your words</Label>
            <Field
              label="English, Hindi or Hinglish"
              placeholder="Roz Mon–Fri Vijay Nagar se Crystal IT Park, 9:30 tak pahunchna hai"
              value={command}
              onChangeText={setCommand}
              multiline
              maxLength={500}
              style={{ minHeight: 70, textAlignVertical: 'top' }}
            />
            <Button title="Fill with AI" variant="secondary" onPress={askAgent} loading={thinking} disabled={!command.trim()} />
            {agentNote ? (
              <View style={{ marginTop: space.md }}>
                <Notice tone={agentNote.tone} title={agentNote.title}>{agentNote.text}</Notice>
              </View>
            ) : null}
          </Card>

          <Card>
            <Label>Route</Label>
            <Field label="Pickup name" value={pickupLabel} onChangeText={setPickupLabel} maxLength={40} />
            <Field label="Pickup address" placeholder="Area, city" value={pickupAddress} onChangeText={setPickupAddress} error={errors.pickupAddress} />
            <Field label="Destination name" value={dropoffLabel} onChangeText={setDropoffLabel} maxLength={40} />
            <Field label="Destination address" placeholder="Office address, city" value={dropoffAddress} onChangeText={setDropoffAddress} error={errors.dropoffAddress} />
          </Card>

          <Card>
            <Label>Schedule</Label>
            <Field label="Arrive by (24h)" placeholder="09:30" value={arrivalTime} onChangeText={setArrivalTime} keyboardType="numbers-and-punctuation" maxLength={5} error={errors.arrivalTime} />
            <Text style={[type.small, { color: colors.ink, fontWeight: '500', marginBottom: space.sm }]}>Working days</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {DAYS.map((d) => <Chip key={d.iso} label={d.short} selected={days.includes(d.iso)} onPress={() => toggleDay(d.iso)} />)}
            </View>
            {errors.days ? <Text style={[type.small, { color: colors.danger }]}>{errors.days}</Text> : null}
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <View style={{ flex: 1 }}><Field label="Safety buffer (min)" value={buffer} onChangeText={setBuffer} keyboardType="number-pad" error={errors.buffer} /></View>
              <View style={{ flex: 1 }}><Field label="Driver arrival (min)" value={driverWait} onChangeText={setDriverWait} keyboardType="number-pad" error={errors.driverWait} /></View>
            </View>
          </Card>

          <Card>
            <Label>Ride</Label>
            <View style={{ flexDirection: 'row', marginBottom: space.sm }}>
              <Chip label="Uber" selected={provider === 'uber'} onPress={() => setProvider('uber')} />
              <Chip label="Rapido" selected={provider === 'rapido'} onPress={() => setProvider('rapido')} />
            </View>
            <View style={{ marginBottom: space.sm }}>
              <Badge text={getProvider(provider).integration === 'prefill_handoff' ? 'Pre-filled hand-off' : 'Reminders only'} tone={provider === 'uber' ? 'ok' : 'warn'} />
            </View>
            <Text style={[type.small, { marginBottom: space.md }]}>{getProvider(provider).statusMessage}</Text>
            <Field label="Max budget (₹, optional)" value={budget} onChangeText={setBudget} keyboardType="number-pad" error={errors.budget} />
          </Card>

          {saveError ? <Notice tone="danger" title="Couldn't save">{saveError}</Notice> : null}
          <Button title="Save commute" onPress={save} loading={saving} />
          {onCancel ? <View style={{ marginTop: space.sm }}><Button title="Cancel" variant="ghost" onPress={onCancel} /></View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
