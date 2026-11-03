export type LatLng = { lat: number; lng: number };

export type TrackPoint = LatLng & { t: number };

const EARTH_KM = 6371;

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversine(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Sum of the ridden trace. Drops GPS teleports above 1.2 km. */
export function pathKm(points: LatLng[]) {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]);
    if (d > 0 && d < 1.2) km += d;
  }
  return km;
}

export function bearing(a: LatLng, b: LatLng) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function densifyRoute(stops: LatLng[], stepKm: number): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const n = Math.max(1, Math.ceil(haversine(a, b) / stepKm));
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      out.push({
        lat: a.lat + (b.lat - a.lat) * u,
        lng: a.lng + (b.lng - a.lng) * u,
      });
    }
  }
  return out;
}

export function trace(stops: LatLng[], stepKm: number, t0: number): TrackPoint[] {
  const out: TrackPoint[] = [];
  let t = t0;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const n = Math.max(1, Math.ceil(haversine(a, b) / stepKm));
    const from = i === 0 ? 0 : 1;
    for (let k = from; k <= n; k++) {
      const u = k / n;
      t += 12_000;
      out.push({
        lat: a.lat + (b.lat - a.lat) * u,
        lng: a.lng + (b.lng - a.lng) * u,
        t,
      });
    }
  }
  return out;
}

export function optimizeOrder<T extends LatLng & { id: string }>(ids: string[], items: T[], start: LatLng) {
  const pool = new Set(ids);
  const result: string[] = [];
  let cursor = start;
  while (pool.size) {
    let best: T | null = null;
    let bestD = Infinity;
    for (const id of pool) {
      const item = items.find((entry) => entry.id === id);
      if (!item) continue;
      const d = haversine(cursor, item);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    if (!best) break;
    pool.delete(best.id);
    result.push(best.id);
    cursor = best;
  }
  return result;
}

export function straightKm(start: LatLng, stops: LatLng[]) {
  let km = 0;
  let cursor = start;
  for (const stop of stops) {
    km += haversine(cursor, stop);
    cursor = stop;
  }
  return km;
}
