import { useEffect, useRef, useState } from "react";
import { useDelivery } from "@/lib/delivery-store";

const URL = "https://buvvxwzhqfkberreqbrk.supabase.co";
const KEY = "sb_publishable_tYL4tG01KbADZievXeOGpg_ExD1fP9c";
const SESSION = "circuito-supabase-session-v1";
type CloudPayload = { comandas?: any[]; corridas?: any[]; ativaId?: string | null; seq?: number; base?: any; arrancadas?: Record<string, number> };

function auth() {
  const value = JSON.parse(localStorage.getItem(SESSION) || "null");
  if (!value?.access_token || !value?.user?.id) throw new Error("Sessão não encontrada.");
  return value as { access_token: string; user: { id: string } };
}
async function request(path: string, init: RequestInit = {}) {
  const s = auth();
  const headers = new Headers(init.headers);
  headers.set("apikey", KEY); headers.set("Authorization", `Bearer ${s.access_token}`);
  headers.set("Content-Type", "application/json");
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers });
  const body = await r.text();
  if (!r.ok) throw new Error(body || "Falha na sincronização.");
  return body ? JSON.parse(body) : null;
}
function mergeById<T extends { id: string }>(local: T[], remote: T[], stamp: (v: T) => number) {
  const map = new Map<string, T>();
  for (const item of remote || []) map.set(item.id, item);
  for (const item of local || []) {
    const old = map.get(item.id);
    if (!old || stamp(item) >= stamp(old)) map.set(item.id, item);
  }
  return [...map.values()];
}
function mergePayload(local: CloudPayload, remote: CloudPayload): CloudPayload {
  const comandas = mergeById(local.comandas || [], remote.comandas || [], (x: any) => x.deliveredAt || x.createdAt || 0);
  const corridas = mergeById(local.corridas || [], remote.corridas || [], (x: any) => x.endedAt || x.startedAt || 0);
  const arrancadas = { ...(remote.arrancadas || {}), ...(local.arrancadas || {}) };
  for (const [k, v] of Object.entries(remote.arrancadas || {})) arrancadas[k] = Math.max(arrancadas[k] || 0, v);
  return {
    comandas, corridas,
    ativaId: local.ativaId || remote.ativaId || null,
    seq: Math.max(local.seq || 1000, remote.seq || 1000),
    base: local.base || remote.base,
    arrancadas,
  };
}

export function CloudDataSync() {
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    let ready = false;
    let timer: number | undefined;
    let busy = false;
    const saveCloud = async () => {
      if (!ready || busy || !alive) return;
      busy = true;
      try {
        const s = auth();
        const state = useDelivery.getState();
        const payload: CloudPayload = {
          comandas: state.comandas, corridas: state.corridas, ativaId: state.ativaId,
          seq: state.seq, base: state.base, arrancadas: state.arrancadas,
        };
        await request("circuito_user_data?on_conflict=user_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ user_id: s.user.id, payload, updated_at: new Date().toISOString() }),
        });
        if (alive) {
          setStatus("Dados sincronizados");
          setFailed(false);
          if (hideTimer.current) window.clearTimeout(hideTimer.current);
          hideTimer.current = window.setTimeout(() => { if (alive) setStatus(""); }, 2600);
        }
      } catch (e) {
        if (alive) {
          if (hideTimer.current) window.clearTimeout(hideTimer.current);
          setStatus(e instanceof Error ? e.message : "Falha ao sincronizar");
          setFailed(true);
        }
      } finally { busy = false; }
    };
    const initialize = async () => {
      try {
        await new Promise<void>((resolve) => {
          if (useDelivery.persist.hasHydrated()) resolve();
          else {
            const unsub = useDelivery.persist.onFinishHydration(() => { unsub(); resolve(); });
          }
        });
        const s = auth();
        const rows = await request("circuito_user_data?select=payload&user_id=eq." + encodeURIComponent(s.user.id)) as Array<{ payload: CloudPayload }>;
        const localState = useDelivery.getState();
        const local: CloudPayload = {
          comandas: localState.comandas, corridas: localState.corridas, ativaId: localState.ativaId,
          seq: localState.seq, base: localState.base, arrancadas: localState.arrancadas,
        };
        const merged = mergePayload(local, rows?.[0]?.payload || {});
        useDelivery.setState(merged as any);
        ready = true;
        await saveCloud();
      } catch (e) {
        if (alive) { setStatus(e instanceof Error ? e.message : "Não foi possível sincronizar"); setFailed(true); }
      }
    };
    void initialize();
    const unsubscribe = useDelivery.subscribe(() => {
      if (!ready || !alive) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void saveCloud(), 1800);
    });
    const onOnline = () => { if (ready) void saveCloud(); };
    window.addEventListener("online", onOnline);
    return () => {
      alive = false; unsubscribe(); window.removeEventListener("online", onOnline);
      if (timer) window.clearTimeout(timer);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);
  if (!status) return null;
  return <div role={failed ? "alert" : "status"} className="pointer-events-none absolute bottom-20 right-3 z-30">
    <span className={`rounded-full border px-2.5 py-1 text-[10px] shadow-lg ${failed ? "border-amber-400/40 bg-amber-950/90 text-amber-200" : "border-emerald-400/30 bg-emerald-950/90 text-emerald-200"}`}>{status}</span>
  </div>;
}
