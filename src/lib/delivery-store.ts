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
  quantidade?: number;
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
  destino?: { label: string; lat: number; lng: number };
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
  arrancadas: Record<string, number>;
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

export function isDefaultBase(base: BasePin | null) {
  if (!base) return true;
  return Math.abs(base.lat - BASE_HOME.lat) < 0.0002 && Math.abs(base.lng - BASE_HOME.lng) < 0.0002;
}

function seed(): Persisted {
  return { comandas: [], corridas: [], ativaId: null, tab: "comandas", seq: 1000, base: BASE_HOME, arrancadas: {} };
}

export function partida(state: { base: BasePin | null; gaze: { lat: number; lng: number } | null }): BasePin {
  if (state.base) return state.base;
  if (state.gaze) return { lat: state.gaze.lat, lng: state.gaze.lng, endereco: "Sua posição" };
  return BASE_HOME;
}

export function comPin(item: Comanda): item is Comanda & { lat: number; lng: number } {
  return item.lat != null && item.lng != null;
}

export function qtd(item: Comanda) {
  return item.quantidade && item.quantidade > 0 ? item.quantidade : 1;
}

export function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function arrancadaNoPeriodo(
  arrancadas: Record<string, number> | undefined,
  match: (key: string) => boolean,
) {
  return Object.entries(arrancadas ?? {}).reduce((sum, [key, value]) => (match(key) ? sum + value : sum), 0);
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

export function resumo(state: {
  comandas: Comanda[];
  corridas: Corrida[];
  arrancadas?: Record<string, number>;
}) {
  const t0 = startOfToday();
  const hoje = state.corridas.filter((item) => item.startedAt >= t0);
  const entregues = state.comandas.filter((item) => item.deliveredAt && item.deliveredAt >= t0);
  const abertas = state.comandas.filter((item) => item.status === "aberta" || item.status === "rota");
  const taxas = entregues.reduce((sum, item) => sum + item.valor, 0);
  const entreguesHoje = entregues.reduce((sum, item) => sum + qtd(item), 0);
  const ticket = entreguesHoje ? taxas / entreguesHoje : 0;
  const arrancadaHoje = state.arrancadas?.[dayKey(new Date())] ?? 0;
  return {
    kmHoje: hoje.reduce((sum, item) => sum + item.km, 0),
    kmTotal: state.corridas.reduce((sum, item) => sum + item.km, 0),
    entreguesHoje,
    abertas: abertas.length,
    ticket,
    taxasHoje: taxas + arrancadaHoje,
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
  searchDestination: { label: string; lat: number; lng: number } | null;
  setSearchDestination: (destination: { label: string; lat: number; lng: number } | null) => void;
  startDestinationRun: (destination: { label: string; lat: number; lng: number }) => void;
  routeLine: LatLng[];
  routeKm: number | null;
  routeDurationSeconds: number | null;
  routeKind: "rua" | "reta" | null;
  routeCue: { meters: number; text: string; modifier: string } | null;
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
  saveDraft: (input: {
    valor: number;
    dia: string;
    comEndereco: boolean;
    quantidade?: number;
    arrancada?: number;
  }) => void;
  editarComanda: (id: string, input: { dia: string; valor: number; quantidade?: number; arrancada?: number; cliente?: string }) => void;
  apagarComanda: (id: string) => void;
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
  pinBaseHere: () => void;
  setPreview: (ids: string[]) => void;
  setRoute: (route: {
    line: LatLng[];
    km: number | null;
    durationSeconds?: number | null;
    kind: "rua" | "reta" | null;
    cue?: { meters: number; text: string; modifier: string } | null;
  }) => void;
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
      searchDestination: null,
      setSearchDestination: (searchDestination) => set({ searchDestination }),
      startDestinationRun: (destination) => {
        if (get().ativaId) return;
        const id = crypto.randomUUID();
        const corrida: Corrida = {
          id, startedAt: Date.now(), status: "ativa", ordem: [], feitas: [],
          points: [], km: 0, modo: "gps", destino: destination,
        };
        set({ ativaId: id, corridas: [...get().corridas, corrida], tab: "rota",
          fitToken: get().fitToken + 1, follow: true, previewIds: [],
          searchDestination: destination, gpsError: null, nearId: null });
        if (!get().live || get().liveStatus === "off" || get().liveStatus === "negado" || get().liveStatus === "erro") get().enableLive();
        toast.success("Navegação até o endereço iniciada");
      },
      routeLine: [],
      routeKm: null,
      routeDurationSeconds: null,
      routeKind: null,
      routeCue: null,
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
      saveDraft: ({ valor, dia, comEndereco, quantidade, arrancada }) => {
        const draft = get().draft;
        if (!draft) return;
        const qtdDia = quantidade && quantidade > 1 ? Math.round(quantidade) : 1;
        const [year, month, day] = dia.split("-").map(Number);
        const when = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0).getTime();
        const hoje = new Date(when).toDateString() === new Date().toDateString();
        const registrar = qtdDia > 1 || !hoje || !comEndereco;
        const lat = comEndereco && qtdDia === 1 ? draft.lat : null;
        const lng = comEndereco && qtdDia === 1 ? draft.lng : null;
        if (qtdDia === 1 && comEndereco && (lat == null || lng == null)) return;
        const seq = get().seq + 1;
        const comanda: Comanda = {
          id: crypto.randomUUID(),
          numero: `C-${seq}`,
          cliente: qtdDia > 1 ? `${qtdDia} comandas` : draft.cliente.trim(),
          telefone: draft.telefone.trim(),
          endereco: qtdDia > 1 ? "Lançamento do dia" : comEndereco ? draft.endereco.trim() : "Sem endereço",
          lat,
          lng,
          itens: draft.itens.trim(),
          valor,
          quantidade: qtdDia,
          pagamento: draft.pagamento,
          status: registrar ? "entregue" : "aberta",
          createdAt: registrar ? when : Date.now(),
          deliveredAt: registrar ? when : undefined,
        };
        const key = dia;
        const arrancadas = { ...(get().arrancadas ?? {}) };
        if (arrancada != null && Number.isFinite(arrancada)) arrancadas[key] = arrancada;
        set({
          seq,
          arrancadas,
          comandas: [comanda, ...get().comandas],
          draft: null,
          selectedId: comanda.id,
          tab: registrar ? "km" : "comandas",
          focusDay: registrar ? when : null,
        });
        toast.success(
          qtdDia > 1 ? `${qtdDia} comandas lançadas no dia` : registrar ? `${comanda.cliente} registrada no dia` : `${comanda.numero} entrou na fila`,
        );
      },
      editarComanda: (id, input) => {
        const current = get().comandas.find((item) => item.id === id);
        if (!current) return;
        const [year, month, day] = input.dia.split("-").map(Number);
        const when = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0).getTime();
        const qtdDia = input.quantidade && input.quantidade > 1 ? Math.round(input.quantidade) : 1;
        const oldKey = dayKey(new Date(current.deliveredAt ?? current.createdAt));
        const next: Comanda = {
          ...current,
          valor: input.valor,
          quantidade: qtdDia,
          cliente: qtdDia > 1 ? `${qtdDia} comandas` : input.cliente?.trim() || current.cliente,
          endereco: qtdDia > 1 ? "Lançamento do dia" : current.endereco,
          status: current.deliveredAt || qtdDia > 1 ? "entregue" : current.status,
          createdAt: current.deliveredAt || qtdDia > 1 ? when : current.createdAt,
          deliveredAt: current.deliveredAt || qtdDia > 1 ? when : current.deliveredAt,
        };
        const arrancadas = { ...(get().arrancadas ?? {}) };
        if (input.arrancada != null && Number.isFinite(input.arrancada)) arrancadas[input.dia] = input.arrancada;
        const ficouNoDia = get().comandas.some(
          (item) => item.id !== id && item.deliveredAt && dayKey(new Date(item.deliveredAt)) === oldKey,
        );
        if (oldKey !== input.dia && !ficouNoDia) delete arrancadas[oldKey];
        set({
          comandas: get().comandas.map((item) => (item.id === id ? next : item)),
          arrancadas,
          focusDay: next.deliveredAt ?? null,
          tab: next.deliveredAt ? "km" : get().tab,
        });
        toast.success("Comanda atualizada");
      },
      apagarComanda: (id) => {
        const current = get().comandas.find((item) => item.id === id);
        if (!current) return;
        const oldKey = current.deliveredAt ? dayKey(new Date(current.deliveredAt)) : null;
        const comandas = get().comandas.filter((item) => item.id !== id);
        const arrancadas = { ...(get().arrancadas ?? {}) };
        if (oldKey && !comandas.some((item) => item.deliveredAt && dayKey(new Date(item.deliveredAt)) === oldKey)) {
          delete arrancadas[oldKey];
        }
        set({
          comandas,
          arrancadas,
          corridas: get().corridas.map((item) => ({
            ...item,
            ordem: item.ordem.filter((stop) => stop !== id),
            feitas: item.feitas.filter((stop) => stop !== id),
          })),
          selectedId: get().selectedId === id ? null : get().selectedId,
        });
        toast.success("Comanda apagada");
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
          tab: "rota",
          fitToken: get().fitToken + 1,
          follow: true,
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
          tab: modo === "parado" ? get().tab : "rota",
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
      pinBaseHere: () => {
        const gaze = get().gaze;
        if (!gaze) {
          toast.error("Espere a seta do GPS aparecer.");
          return;
        }
        set({ base: { lat: gaze.lat, lng: gaze.lng, endereco: BASE_HOME.endereco } });
        toast.success("Base colocada na seta.");
      },
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
          routeDurationSeconds: route.durationSeconds ?? null,
          routeKind: route.kind,
          routeCue: route.cue ?? null,
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
        arrancadas: state.arrancadas,
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
          tab: state.tab === "mapa" ? "comandas" : state.tab,
          base: state.base?.endereco === BASE_HOME.endereco ? state.base : BASE_HOME,
          arrancadas: state.arrancadas ?? {},
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
