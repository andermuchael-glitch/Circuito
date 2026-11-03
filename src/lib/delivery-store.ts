import { toast } from "sonner";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { densifyRoute, haversine, pathKm, type LatLng, type TrackPoint } from "@/lib/geo";
import { startOfToday } from "@/lib/format";

export type Pagamento = "pix" | "dinheiro" | "cartao";
export type Status = "aberta" | "rota" | "entregue" | "cancelada";
export type Modo = "parado" | "gps" | "simulacao";
export type Tab = "mapa" | "comandas" | "rota" | "km";

export type Comanda = {
  id: string;
  numero: string;
  cliente: string;
  telefone: string;
  endereco: string;
  lat: number | null;
  lng: number | null;
  itens: string;
  valor: number;
  pagamento: Pagamento;
  status: Status;
  createdAt: number;
  deliveredAt?: number;
};

export type Corrida = {
  id: string;
  startedAt: number;
  endedAt?: number;
  status: "ativa" | "encerrada";
  ordem: string[];
  feitas: string[];
  points: TrackPoint[];
  km: number;
  modo: Modo;
};

export type Draft = {
  cliente: string;
  telefone: string;
  endereco: string;
  itens: string;
  valor: string;
  pagamento: Pagamento;
  lat: number | null;
  lng: number | null;
  picking: boolean;
};

export type LiveStatus = "off" | "buscando" | "ativo" | "negado" | "erro";

export type GpsMeta = {
  accuracy: number | null;
  speed: number | null;
  weak: boolean;
};

type Persisted = {
  comandas: Comanda[];
  corridas: Corrida[];
  ativaId: string | null;
  tab: Tab;
  seq: number;
  base: BasePin | null;
};

const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

let persistReady = false;

function browserStorage() {
  return {
    getItem: (name: string) => localStorage.getItem(name),
    setItem: (name: string, value: string) => {
      if (!persistReady) return;
      localStorage.setItem(name, value);
    },
    removeItem: (name: string) => localStorage.removeItem(name),
  };
}

function emptyDraft(): Draft {
  return {
    cliente: "",
    telefone: "",
    endereco: "",
    itens: "",
    valor: "",
    pagamento: "pix",
    lat: null,
    lng: null,
    picking: false,
  };
}

function replaceCorrida(list: Corrida[], next: Corrida) {
  return list.map((item) => (item.id === next.id ? next : item));
}

export type BasePin = { lat: number; lng: number; endereco: string };

export const BASE_HOME: BasePin = {
  lat: -26.99555,
  lng: -48.64318,
  endereco: "Rua 904, 1015",
};

function seed(): Persisted {
  return { comandas: [], corridas: [], ativaId: null, tab: "mapa", seq: 1000, base: BASE_HOME };
}

export function partida(state: { base: BasePin | null; gaze: { lat: number; lng: number } | null }): BasePin {
  if (state.base) return state.base;
  if (state.gaze) return { lat: state.gaze.lat, lng: state.gaze.lng, endereco: "Sua posição" };
  return BASE_HOME;
}

export function comPin(item: Comanda): item is Comanda & { lat: number; lng: number } {
  return item.lat != null && item.lng != null;
}

export function corridaAtiva(state: { corridas: Corrida[]; ativaId: string | null }) {
  return state.corridas.find((item) => item.id === state.ativaId) ?? null;
}

export function nextStop(corrida: Corrida | null, comandas: Comanda[]) {
  if (!corrida) return null;
  const feitas = new Set(corrida.feitas);
  for (const id of corrida.ordem) {
    if (feitas.has(id)) continue;
    const comanda = comandas.find((item) => item.id === id);
    if (comanda && comPin(comanda)) return comanda;
  }
  return null;
}

export function resumo(state: { comandas: Comanda[]; corridas: Corrida[] }) {
  const t0 = startOfToday();
  const hoje = state.corridas.filter((item) => item.startedAt >= t0);
  const entregues = state.comandas.filter((item) => item.deliveredAt && item.deliveredAt >= t0);
  const abertas = state.comandas.filter((item) => item.status === "aberta" || item.status === "rota");
  const ticket = entregues.length
    ? entregues.reduce((sum, item) => sum + item.valor, 0) / entregues.length
    : 0;
  const taxasHoje = entregues.reduce((sum, item) => sum + item.valor, 0);
  return {
    kmHoje: hoje.reduce((sum, item) => sum + item.km, 0),
    kmTotal: state.corridas.reduce((sum, item) => sum + item.km, 0),
    entreguesHoje: entregues.length,
    abertas: abertas.length,
    ticket,
    taxasHoje,
    corridasHoje: hoje.length,
  };
}

type Store = Persisted & {
  hydrated: boolean;
  draft: Draft | null;
  mapPick: boolean;
  selectedId: string | null;
  follow: boolean;
  fitToken: number;
  simToken: number;
  nearId: string | null;
  gpsError: string | null;
  gpsMeta: GpsMeta;
  gaze: LatLng | null;
  focusDay: number | null;
  live: boolean;
  liveAttempt: number;
  liveStatus: LiveStatus;
  previewIds: string[];
  routeLine: LatLng[];
  routeKm: number | null;
  routeKind: "rua" | "reta" | null;
  routeRev: number;
  setTab: (tab: Tab) => void;
  select: (id: string | null) => void;
  setFollow: (follow: boolean) => void;
  requestFit: () => void;
  openDraft: () => void;
  closeDraft: () => void;
  patchDraft: (patch: Partial<Draft>) => void;
  startPick: () => void;
  cancelPick: () => void;
  dropPin: (pin: LatLng) => void;
  saveDraft: (input: { valor: number; dia: string; comEndereco: boolean }) => void;
  cancelComanda: (id: string) => void;
  startCorrida: (ids: string[]) => void;
  markEntregue: (id: string) => void;
  encerrar: () => void;
  apagarCorrida: (id: string) => void;
  setModo: (modo: Modo) => void;
  pushPoint: (point: TrackPoint) => void;
  setGpsError: (message: string | null) => void;
  setGpsMeta: (meta: GpsMeta) => void;
  setGaze: (gaze: LatLng | null) => void;
  setLiveStatus: (status: LiveStatus) => void;
  enableLive: () => void;
  disableLive: () => void;
  setBase: (base: BasePin) => void;
  setPreview: (ids: string[]) => void;
  setRoute: (route: { line: LatLng[]; km: number | null; kind: "rua" | "reta" | null }) => void;
};

function simulationStops(state: Store): LatLng[] {
  const ativa = corridaAtiva(state);
  if (!ativa) return [];
  const pendentes = ativa.ordem
    .filter((id) => !ativa.feitas.includes(id))
    .map((id) => state.comandas.find((item) => item.id === id))
    .filter((item): item is Comanda & { lat: number; lng: number } => Boolean(item && comPin(item)));
  if (!pendentes.length) return [];
  const last = ativa.points[ativa.points.length - 1] ?? partida(state);
  const home = state.base ?? BASE_HOME;
  return [last, ...pendentes, home];
}

export const useDelivery = create<Store>()(
  persist(
    (set, get) => ({
      ...seed(),
      hydrated: false,
      draft: null,
      mapPick: false,
      selectedId: null,
      follow: true,
      fitToken: 0,
      simToken: 0,
      nearId: null,
      gpsError: null,
      gpsMeta: { accuracy: null, speed: null, weak: false },
      gaze: null,
      focusDay: null,
      live: true,
      liveAttempt: 1,
      liveStatus: "buscando",
      previewIds: [],
      routeLine: [],
      routeKm: null,
      routeKind: null,
      routeRev: 0,
      setTab: (tab) => set({ tab }),
      select: (selectedId) => set({ selectedId, follow: selectedId ? false : get().follow }),
      setFollow: (follow) => set({ follow }),
      requestFit: () => set({ fitToken: get().fitToken + 1, follow: false }),
      openDraft: () => set({ draft: emptyDraft(), tab: "comandas" }),
      closeDraft: () => set({ draft: null, mapPick: false }),
      patchDraft: (patch) => {
        const draft = get().draft;
        if (!draft) return;
        set({ draft: { ...draft, ...patch } });
      },
      startPick: () => {
        const draft = get().draft;
        if (!draft) return;
        set({ mapPick: true, tab: "mapa", draft: { ...draft, picking: true } });
      },
      cancelPick: () => {
        const draft = get().draft;
        set({
          mapPick: false,
          tab: "comandas",
          draft: draft ? { ...draft, picking: false } : null,
        });
      },
      dropPin: (pin) => {
        const draft = get().draft;
        set({
          mapPick: false,
          tab: "comandas",
          draft: draft
            ? {
                ...draft,
                picking: false,
                lat: pin.lat,
                lng: pin.lng,
                endereco: draft.endereco.trim() || "Ponto marcado no mapa",
              }
            : null,
        });
      },
      saveDraft: ({ valor, dia, comEndereco }) => {
        const draft = get().draft;
        if (!draft) return;
        const [year, month, day] = dia.split("-").map(Number);
        const when = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0).getTime();
        const hoje = new Date(when).toDateString() === new Date().toDateString();
        const registrar = !hoje || !comEndereco;
        const lat = comEndereco ? draft.lat : null;
        const lng = comEndereco ? draft.lng : null;
        if (comEndereco && (lat == null || lng == null)) return;
        const seq = get().seq + 1;
        const comanda: Comanda = {
          id: crypto.randomUUID(),
          numero: `C-${seq}`,
          cliente: draft.cliente.trim(),
          telefone: draft.telefone.trim(),
          endereco: comEndereco ? draft.endereco.trim() : "Sem endereço",
          lat,
          lng,
          itens: draft.itens.trim(),
          valor,
          pagamento: draft.pagamento,
          status: registrar ? "entregue" : "aberta",
          createdAt: registrar ? when : Date.now(),
          deliveredAt: registrar ? when : undefined,
        };
        set({
          seq,
          comandas: [comanda, ...get().comandas],
          draft: null,
          selectedId: comanda.id,
          tab: registrar ? "km" : "comandas",
          focusDay: registrar ? when : null,
        });
        toast.success(registrar ? `${comanda.cliente} registrada no dia` : `${comanda.numero} entrou na fila`);
      },
      cancelComanda: (id) => {
        set({
          comandas: get().comandas.map((item) =>
            item.id === id && item.status === "aberta" ? { ...item, status: "cancelada" } : item,
          ),
        });
      },
      startCorrida: (ids) => {
        if (!ids.length || get().ativaId) return;
        const id = crypto.randomUUID();
        const corrida: Corrida = {
          id,
          startedAt: Date.now(),
          status: "ativa",
          ordem: ids,
          feitas: [],
          points: [],
          km: 0,
          modo: get().live ? "gps" : "parado",
        };
        set({
          ativaId: id,
          corridas: [...get().corridas, corrida],
          comandas: get().comandas.map((item) =>
            ids.includes(item.id) ? { ...item, status: "rota" } : item,
          ),
          tab: "mapa",
          fitToken: get().fitToken + 1,
          follow: false,
          previewIds: [],
          gpsError: null,
          nearId: null,
        });
      },
      markEntregue: (id) => {
        const ativa = corridaAtiva(get());
        if (!ativa || !ativa.ordem.includes(id) || ativa.feitas.includes(id)) return;
        const comanda = get().comandas.find((item) => item.id === id);
        set({
          nearId: null,
          corridas: replaceCorrida(get().corridas, { ...ativa, feitas: [...ativa.feitas, id] }),
          comandas: get().comandas.map((item) =>
            item.id === id
              ? { ...item, status: "entregue", deliveredAt: Date.now() }
              : item,
          ),
        });
        if (comanda) toast.success(`${comanda.cliente} entregue`);
      },
      encerrar: () => {
        const ativa = corridaAtiva(get());
        if (!ativa) return;
        const feitas = new Set(ativa.feitas);
        set({
          ativaId: null,
          nearId: null,
          gpsError: null,
          corridas: replaceCorrida(get().corridas, {
            ...ativa,
            status: "encerrada",
            endedAt: Date.now(),
            modo: "parado",
          }),
          comandas: get().comandas.map((item) =>
            ativa.ordem.includes(item.id) && !feitas.has(item.id) && item.status === "rota"
              ? { ...item, status: "aberta" }
              : item,
          ),
          tab: "km",
        });
        toast.success(`Corrida encerrada · ${ativa.km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);
      },
      apagarCorrida: (id) => {
        const corrida = get().corridas.find((item) => item.id === id);
        if (!corrida) return;
        const feitas = new Set(corrida.feitas);
        set({
          ativaId: get().ativaId === id ? null : get().ativaId,
          nearId: get().ativaId === id ? null : get().nearId,
          corridas: get().corridas.filter((item) => item.id !== id),
          comandas: get().comandas.map((item) =>
            corrida.ordem.includes(item.id) && !feitas.has(item.id) && item.status === "rota"
              ? { ...item, status: "aberta" }
              : item,
          ),
        });
        toast.success("Rota apagada");
      },
      setModo: (modo) => {
        const ativa = corridaAtiva(get());
        if (!ativa) return;
        if (modo === "simulacao") {
          const stops = simulationStops({ ...get(), corridas: replaceCorrida(get().corridas, ativa) });
          if (stops.length < 2) {
            toast.message("Não há paradas pendentes para percorrer");
            return;
          }
        }
        let points = ativa.points;
        if (modo === "simulacao" && points.length === 0) {
          const origin = partida(get());
          points = [{ lat: origin.lat, lng: origin.lng, t: Date.now() }];
        }
        const next = { ...ativa, modo, points, km: pathKm(points) };
        set({
          gpsError: null,
          follow: modo === "parado" ? get().follow : true,
          tab: modo === "parado" ? get().tab : "mapa",
          simToken: modo === "simulacao" ? get().simToken + 1 : get().simToken,
          fitToken: modo === "parado" ? get().fitToken : get().fitToken + 1,
          corridas: replaceCorrida(get().corridas, next),
        });
      },
      pushPoint: (point) => {
        const ativa = corridaAtiva(get());
        if (!ativa || ativa.status !== "ativa") return;
        const last = ativa.points[ativa.points.length - 1];
        if (last) {
          const d = haversine(last, point);
          if (d < 0.008) return;
          const dt = Math.max(1, (point.t - last.t) / 1000);
          if (ativa.modo === "gps" && (d / dt) * 3600 > 150) return;
        }
        let points = [...ativa.points, point];
        if (points.length > 1800) {
          points = points.filter((_, index) => index % 2 === 0 || index === points.length - 1);
        }
        const next = { ...ativa, points, km: pathKm(points) };
        set({ corridas: replaceCorrida(get().corridas, next) });

        const fresh = corridaAtiva(get());
        if (!fresh) return;
        const stop = nextStop(fresh, get().comandas);
        if (!stop) {
          if (get().nearId) set({ nearId: null });
          return;
        }
        const dist = haversine(point, stop);
        if (fresh.modo === "simulacao" && dist < 0.075) {
          get().markEntregue(stop.id);
          return;
        }
        const nearId = dist < 0.11 ? stop.id : null;
        if (nearId !== get().nearId) set({ nearId });
      },
      setGpsError: (gpsError) => set({ gpsError }),
      setGpsMeta: (gpsMeta) => set({ gpsMeta }),
      setGaze: (gaze) => set({ gaze }),
      setLiveStatus: (liveStatus) => set({ liveStatus }),
      enableLive: () =>
        set({
          live: true,
          liveAttempt: get().liveAttempt + 1,
          liveStatus: "buscando",
          gpsError: null,
          follow: true,
        }),
      disableLive: () => set({ live: false, liveStatus: "off", gpsError: null }),
      setBase: (base) => set({ base }),
      setPreview: (previewIds) =>
        set({
          previewIds,
          ...(previewIds.length
            ? { follow: false, fitToken: get().fitToken + 1 }
            : {}),
        }),
      setRoute: (route) =>
        set({
          routeLine: route.line,
          routeKm: route.km,
          routeKind: route.kind,
          routeRev: get().routeRev + 1,
        }),
    }),
    {
      name: "circuito-v3",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage : browserStorage(),
      ),
      skipHydration: true,
      partialize: (state) => ({
        comandas: state.comandas,
        corridas: state.corridas,
        ativaId: state.ativaId,
        tab: state.tab,
        seq: state.seq,
        base: state.base,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          useDelivery.setState({ hydrated: true });
          persistReady = true;
          return;
        }
        persistReady = true;
        const state = useDelivery.getState();
        const corridas = state.corridas.map((item) =>
          item.status === "ativa" && item.modo === "simulacao" ? { ...item, modo: "parado" as const } : item,
        );
        useDelivery.setState({
          hydrated: true,
          corridas,
          base: state.base?.endereco === BASE_HOME.endereco ? state.base : BASE_HOME,
          mapPick: false,
          draft: null,
        });
      },
    },
  ),
);

export function buildSimPath() {
  const state = useDelivery.getState();
  const stops = simulationStops(state);
  if (stops.length < 2) return [];
  return densifyRoute(stops, 0.055);
}

if (typeof window !== "undefined") {
  void useDelivery.persist.rehydrate();
}
