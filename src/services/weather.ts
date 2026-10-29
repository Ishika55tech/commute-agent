// Open-Meteo: free, no API key. Used only to add a rain buffer.
// https://open-meteo.com/en/docs

export async function fetchRainProbability(latitude: number, longitude: number, at: Date): Promise<number | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
      `&hourly=precipitation_probability&timezone=auto&forecast_days=2`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const times: string[] = json?.hourly?.time ?? [];
    const probs: (number | null)[] = json?.hourly?.precipitation_probability ?? [];
    // Open-Meteo returns local times like "2026-10-29T09:00" when timezone=auto.
    const pad = (n: number) => String(n).padStart(2, '0');
    const key = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:00`;
    const idx = times.indexOf(key);
    const value = idx >= 0 ? probs[idx] : null;
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}
