import { useEffect, useRef, useState } from "react";
import { Plus, Store } from "lucide-react";
import { useDelivery } from "@/lib/delivery-store";

const URL = "https://buvvxwzhqfkberreqbrk.supabase.co";
const KEY = "sb_publishable_tYL4tG01KbADZievXeOGpg_ExD1fP9c";
const SESSION = "circuito-supabase-session-v1";
type DataSet = { comandas: any[]; corridas: any[]; ativaId: string | null; seq: number; base: any; arrancadas: Record<string, number> };
type Profile = { id: string; name: string; data: DataSet };
type CloudPayload = { version?: number; activeProfileId?: string; profiles?: Profile[]; comandas?: any[]; corridas?: any[]; ativaId?: string | null; seq?: number; base?: any; arrancadas?: Record<string, number> };

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
function emptyData(): DataSet {
  return { comandas: [], corridas: [], ativaId: null, seq: 1000, base: null, arrancadas: {} };
}
function readCurrent(): DataSet {
  const s = useDelivery.getState();
  return { comandas: s.comandas, corridas: s.corridas, ativaId: s.ativaId, seq: s.seq, base: s.base, arrancadas: s.arrancadas ?? {} };
}
function normalizeData(data?: Partial<DataSet> | null): DataSet {
  return { ...emptyData(), ...(data || {}), comandas: data?.comandas || [], corridas: data?.corridas || [], arrancadas: data?.arrancadas || {} };
}
function applyData(data: DataSet) {
  useDelivery.setState({ ...normalizeData(data), tab: "comandas", draft: null, selectedId: null, previewIds: [], searchDestination: null, routeLine: [], routeKm: null, routeDurationSeconds: null, routeKind: null, routeCue: null, nearId: null } as any);
}

export function CloudDataSync() {
  const [status, setStatus] = useState("Carregando dados da conta…");
  const [failed, setFailed] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState("");
  const [ready, setReady] = useState(false);
  const profilesRef = useRef<Profile[]>([]);
  const activeRef = useRef("");
  const hideTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const readyRef = useRef(false);
  const switching = useRef(false);
  const alive = useRef(true);

  const updateProfiles = (next: Profile[]) => { profilesRef.current = next; setProfiles(next); };
  const updateActive = (id: string) => { activeRef.current = id; setActiveId(id); };

  const saveCloud = async () => {
    if (!readyRef.current || busy.current || !alive.current || switching.current) return;
    busy.current = true;
    try {
      const current = profilesRef.current.map(p => p.id === activeRef.current ? { ...p, data: readCurrent() } : p);
      updateProfiles(current);
      const s = auth();
      const payload: CloudPayload = { version: 2, activeProfileId: activeRef.current, profiles: current };
      await request("circuito_user_data?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: s.user.id, payload, updated_at: new Date().toISOString() }),
      });
      if (alive.current) {
        setStatus("Dados sincronizados"); setFailed(false);
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => { if (alive.current) setStatus(""); }, 2600);
      }
    } catch (e) {
      if (alive.current) { setStatus(e instanceof Error ? e.message : "Falha ao sincronizar"); setFailed(true); }
    } finally { busy.current = false; }
  };

  useEffect(() => {
    alive.current = true;
    let unsubscribe: (() => void) | undefined;
    const initialize = async () => {
      try {
        await new Promise<void>((resolve) => {
          if (useDelivery.persist.hasHydrated()) resolve();
          else { const unsub = useDelivery.persist.onFinishHydration(() => { unsub(); resolve(); }); }
        });
        const s = auth();
        applyData(emptyData());
        const rows = await request("circuito_user_data?select=payload&user_id=eq." + encodeURIComponent(s.user.id)) as Array<{ payload: CloudPayload }>;
        const remote = rows?.[0]?.payload || {};
        let loaded: Profile[];
        let selected: string;
        if (remote.version === 2 && Array.isArray(remote.profiles) && remote.profiles.length) {
          loaded = remote.profiles.map(p => ({ id: p.id, name: p.name, data: normalizeData(p.data) }));
          selected = loaded.some(p => p.id === remote.activeProfileId) ? remote.activeProfileId! : loaded[0].id;
        } else {
          // Migra automaticamente os dados antigos da conta para o primeiro perfil.
          const legacy = normalizeData(remote);
          const id = crypto.randomUUID();
          loaded = [{ id, name: "Estabelecimento 1", data: legacy }];
          selected = id;
        }
        profilesRef.current = loaded; activeRef.current = selected;
        setProfiles(loaded); setActiveId(selected);
        applyData(loaded.find(p => p.id === selected)!.data);
        readyRef.current = true;
        setReady(true);
        await saveCloud();
      } catch (e) {
        if (alive.current) { setStatus(e instanceof Error ? e.message : "Não foi possível sincronizar"); setFailed(true); }
      }
    };
    void initialize();
    unsubscribe = useDelivery.subscribe(() => {
      if (!readyRef.current || !alive.current || switching.current) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveCloud(), 1600);
    });
    const onOnline = () => { if (readyRef.current) void saveCloud(); };
    window.addEventListener("online", onOnline);
    return () => {
      alive.current = false; unsubscribe?.(); window.removeEventListener("online", onOnline);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  // The account session is initialized once per authenticated app mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchProfile = async (id: string) => {
    if (!ready || id === activeRef.current) return;
    switching.current = true;
    try {
      const nextProfiles = profilesRef.current.map(p => p.id === activeRef.current ? { ...p, data: readCurrent() } : p);
      const target = nextProfiles.find(p => p.id === id);
      if (!target) return;
      updateProfiles(nextProfiles); updateActive(id);
      applyData(target.data);
      switching.current = false;
      await saveCloud();
    } finally { switching.current = false; }
  };

  const createProfile = async () => {
    if (!ready) return;
    const name = window.prompt("Nome do novo estabelecimento:");
    if (!name?.trim()) return;
    switching.current = true;
    const current = profilesRef.current.map(p => p.id === activeRef.current ? { ...p, data: readCurrent() } : p);
    const profile: Profile = { id: crypto.randomUUID(), name: name.trim().slice(0, 48), data: emptyData() };
    const next = [...current, profile];
    updateProfiles(next); updateActive(profile.id); applyData(profile.data);
    switching.current = false;
    await saveCloud();
  };

  if (!ready && !failed) return <div role="status" className="absolute inset-0 z-[100] grid place-items-center bg-[#07110c] px-6 text-center text-white"><div><p className="text-lg font-semibold">ROUTE377</p><p className="mt-2 text-sm text-white/65">{status}</p></div></div>;
  return <>
    {ready && <div className="absolute left-3 top-[4.4rem] z-40 flex max-w-[75vw] items-center gap-1.5 rounded-full border border-line bg-surface/95 p-1 shadow-lg">
      <Store className="ml-2 h-4 w-4 shrink-0 text-signal" />
      <select aria-label="Estabelecimento ativo" value={activeId} onChange={e => void switchProfile(e.target.value)} className="min-w-0 max-w-[42vw] bg-transparent px-1 py-1.5 text-xs font-semibold text-paper outline-none">
        {profiles.map(p => <option key={p.id} value={p.id} className="bg-[#102018]">{p.name}</option>)}
      </select>
      <button type="button" onClick={() => void createProfile()} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-signal text-signal-ink" aria-label="Adicionar estabelecimento" title="Adicionar estabelecimento"><Plus className="h-4 w-4" /></button>
    </div>}
    {status && <div role={failed ? "alert" : "status"} className="pointer-events-none absolute bottom-20 right-3 z-30"><span className={`rounded-full border px-2.5 py-1 text-[10px] shadow-lg ${failed ? "border-amber-400/40 bg-amber-950/90 text-amber-200" : "border-emerald-400/30 bg-emerald-950/90 text-emerald-200"}`}>{status}</span></div>}
  </>;
}
