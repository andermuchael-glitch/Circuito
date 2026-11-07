const SUPABASE_URL = "https://buvvxwzhqfkberreqbrk.supabase.co";
const SUPABASE_KEY = "sb_publishable_tYL4tG01KbADZievXeOGpg_ExD1fP9c";
const SESSION_KEY = "circuito-supabase-session-v1";

type AuthSession = { access_token: string; user: { id: string } };
export type LiveShare = {
  id: string;
  token: string;
  corrida_id: string;
  active: boolean;
};

function session(): AuthSession {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) throw new Error("Entre na sua conta para compartilhar a rota.");
  const value = JSON.parse(raw) as AuthSession;
  if (!value.access_token || !value.user?.id) throw new Error("Sua sessão expirou. Entre novamente.");
  return value;
}

async function api(path: string, init: RequestInit = {}, authenticated = true) {
  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_KEY);
  headers.set("Content-Type", "application/json");
  if (authenticated) headers.set("Authorization", `Bearer ${session().access_token}`);
  else headers.set("Authorization", `Bearer ${SUPABASE_KEY}`);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || "Falha ao acessar o compartilhamento.");
  return data;
}

export async function createLiveShare(corridaId: string): Promise<LiveShare> {
  const user = session();
  const rows = await api("live_shares?on_conflict=user_id,corrida_id&select=id,token,corrida_id,active", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: user.user.id, corrida_id: corridaId, active: true }),
  }) as LiveShare[];
  if (!rows?.[0]) throw new Error("Não foi possível criar o link de acompanhamento.");
  return rows[0];
}

export async function publishLivePoint(shareId: string, point: { lat: number; lng: number; accuracy?: number | null; speed?: number | null; time?: number }, routePoints: Array<{ lat: number; lng: number; t: number }>) {
  await api(`live_shares?id=eq.${encodeURIComponent(shareId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      latest_lat: point.lat,
      latest_lng: point.lng,
      accuracy: point.accuracy ?? null,
      speed: point.speed ?? null,
      updated_at: new Date(point.time || Date.now()).toISOString(),
      route_points: routePoints.slice(-500),
      active: true,
    }),
  });
}

export async function getPublicLiveShare(token: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_live_share`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Link inválido ou indisponível.");
  return Array.isArray(data) ? data[0] ?? null : null;
}

export async function stopLiveShare(token: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/stop_live_share`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session().access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token }),
  });
  if (!response.ok) throw new Error("Não foi possível encerrar o compartilhamento.");
  return response.json();
}


export type PermanentSharePayload = {
  active: boolean;
  status: "idle" | "delivery" | "returning" | "delivered";
  current_order?: string | null;
  customer?: string | null;
  destination_label?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  latest_lat?: number | null;
  latest_lng?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  distance_m?: number | null;
  eta_seconds?: number | null;
  updated_at?: string;
};

async function rpc<T>(name: string, body: Record<string, unknown>, authenticated = true): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: authenticated ? `Bearer ${session().access_token}` : `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.hint || `Falha em ${name}.`);
  return data as T;
}

export async function createPermanentLiveShare(): Promise<string> {
  const token = await rpc<string>("create_permanent_live_share", {});
  if (!token) throw new Error("Não foi possível criar o link permanente.");
  return token;
}

export async function publishPermanentLiveShare(payload: PermanentSharePayload): Promise<void> {
  await rpc<boolean>("publish_permanent_live_share", { p_payload: payload });
}

export async function getPermanentLiveShare(token: string): Promise<{ payload: PermanentSharePayload; updated_at: string } | null> {
  const rows = await rpc<Array<{ payload: PermanentSharePayload; updated_at: string }>>(
    "get_permanent_live_share", { p_token: token }, false,
  );
  return rows?.[0] ?? null;
}


export async function getPublicTracking(token: string) {
  const legacy = await getPublicLiveShare(token);
  if (legacy) return { kind: "race" as const, data: legacy as Record<string, unknown> };
  const permanent = await getPermanentLiveShare(token);
  return permanent ? { kind: "permanent" as const, data: permanent.payload, updated_at: permanent.updated_at } : null;
}
