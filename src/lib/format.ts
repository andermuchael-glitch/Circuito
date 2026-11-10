const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function brl(value: number) {
  return money.format(value);
}

export function kmLabel(km: number) {
  return `${km.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

export function metersLabel(km: number) {
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
  return kmLabel(km);
}

export function clock(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Hoje";
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function parseMoney(value: string) {
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

export function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
}

export function coordLabel(lat: number, lng: number) {
  const fmt = (n: number) => Math.abs(n).toFixed(5).replace(".", ",");
  return `${lat < 0 ? "−" : ""}${fmt(lat)}, ${lng < 0 ? "−" : ""}${fmt(lng)}`;
}

export function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function withCity(endereco: string) {
  const q = endereco.trim();
  if (!q) return "Balneário Camboriú, SC";
  if (/cambori[uú]|itaja[ií]|camboriu|santa catarina/i.test(q)) return q;
  return `${q}, Balneário Camboriú, SC`;
}

export function wazeLink(endereco: string) {
  return `https://waze.com/ul?q=${encodeURIComponent(withCity(endereco))}&navigate=yes&vehicle_type=motorcycle&utm_source=circuito`;
}

export function googleStopLink(endereco: string) {
  const params = new URLSearchParams({
    api: "1",
    destination: withCity(endereco),
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function googleRouteLink(origin: string, stops: string[]) {
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    origin: withCity(origin),
    destination: withCity(origin),
  });
  if (stops.length) params.set("waypoints", stops.map(withCity).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
