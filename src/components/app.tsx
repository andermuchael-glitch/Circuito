import { useEffect, useState } from "react";
import { ClipboardList, Gauge, Map as MapIcon, Navigation, Route } from "lucide-react";
import { Toaster } from "sonner";
import { ComandaForm } from "@/components/comanda-form";
import { ComandasPanel } from "@/components/comandas-panel";
import { KmPanel } from "@/components/km-panel";
import { LiveEngine } from "@/components/live-engine";
import { RouteEngine } from "@/components/route-engine";
import { MapView } from "@/components/map-view";
import { RotaPanel } from "@/components/rota-panel";
import { cn } from "@/lib/cn";
import {
  corridaAtiva,
  nextStop,
  partida,
  resumo,
  useDelivery,
  type Tab,
} from "@/lib/delivery-store";
import { brl, coordLabel, kmLabel, metersLabel, wazeLink } from "@/lib/format";
import { haversine } from "@/lib/geo";

const tabs: { id: Tab; label: string; icon: typeof MapIcon }[] = [
  { id: "mapa", label: "Mapa", icon: MapIcon },
  { id: "comandas", label: "Comandas", icon: ClipboardList },
  { id: "rota", label: "Rota", icon: Route },
  { id: "km", label: "Km", icon: Gauge },
];

export function App() {
  const tab = useDelivery((state) => state.tab);

  useEffect(() => {
    if (!useDelivery.persist.hasHydrated()) {
      void Promise.resolve(useDelivery.persist.rehydrate());
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!window.location.pathname.startsWith("/Circuito")) return;
    void navigator.serviceWorker.register("/Circuito/sw.js", { scope: "/Circuito/" });
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-bg text-paper">
      <LiveEngine />
      <RouteEngine />
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--color-surface)",
            color: "var(--color-paper)",
            border: "1px solid var(--color-line)",
          },
        }}
      />
      <Header />
      <GpsBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <section
          className={cn(
            "relative min-h-0 min-w-0 flex-1",
            tab === "mapa" ? "block" : "hidden md:block",
          )}
        >
          <MapStage />
        </section>
      </div>
      <MobileNav />
      <ComandaForm />
    </div>
  );
}

function Header() {
  const tab = useDelivery((state) => state.tab);
  const kmHoje = useDelivery((state) => resumo(state).kmHoje);
  const liveStatus = useDelivery((state) => state.liveStatus);
  const speed = useDelivery((state) => state.gpsMeta.speed);
  const gaze = useDelivery((state) => state.gaze);
  const [clockReady, setClockReady] = useState(false);

  useEffect(() => setClockReady(true), []);

  const liveLabel =
    liveStatus === "ativo"
      ? speed != null && speed >= 1
        ? `${Math.round(speed)} km/h`
        : "Ao vivo"
      : liveStatus === "buscando"
        ? "Buscando"
        : "Ativar GPS";

  return (
    <header
      className={cn(
        "h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-3",
        tab === "mapa" ? "hidden md:flex" : "flex",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-signal text-signal-ink">
          <Route className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-2xl leading-none tracking-wide">CIRCUITO</p>
          <p className="truncate font-mono text-xs text-muted">
            {gaze && liveStatus === "ativo" ? coordLabel(gaze.lat, gaze.lng) : "GPS das corridas"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const state = useDelivery.getState();
            if (state.live && state.liveStatus === "ativo") state.disableLive();
            else state.enableLive();
          }}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium",
            liveStatus === "ativo"
              ? "border-go text-go"
              : liveStatus === "negado" || liveStatus === "erro"
                ? "border-danger text-danger"
                : "border-line",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              liveStatus === "ativo" ? "rider-pulse bg-go" : "bg-muted",
            )}
          />
          {liveLabel}
        </button>
        <button
          type="button"
          onClick={() => useDelivery.getState().setTab("km")}
          className={cn(
            "h-10 rounded-full border border-line px-3 font-mono text-sm",
            tab === "km" && "border-signal text-signal",
          )}
        >
          {clockReady ? kmLabel(kmHoje) : "— km"}
        </button>
      </div>
    </header>
  );
}

function GpsBanner() {
  const live = useDelivery((state) => state.live);
  const liveStatus = useDelivery((state) => state.liveStatus);
  const gpsError = useDelivery((state) => state.gpsError);
  if (!live || liveStatus === "ativo" || liveStatus === "buscando" || !gpsError) return null;
  return (
    <div className="flex items-center gap-2 border-b border-line bg-raised px-3 py-2">
      <p className="min-w-0 flex-1 text-sm text-danger">{gpsError}</p>
      <button
        type="button"
        onClick={() => useDelivery.getState().enableLive()}
        className="h-10 shrink-0 rounded-full bg-signal px-3 text-sm font-semibold text-signal-ink"
      >
        Permitir
      </button>
    </div>
  );
}

function Sidebar() {
  const tab = useDelivery((state) => state.tab);
  const panel = tab === "mapa" ? "rota" : tab;
  return (
    <aside
      className={cn(
        "min-h-0 w-full min-w-0 flex-col md:flex md:w-96 md:shrink-0 md:border-r md:border-line",
        tab === "mapa" ? "hidden md:flex" : "flex",
      )}
    >
      <div className="hidden md:block">
        <TabRow />
      </div>
      <div className="min-h-0 flex-1">
        <Panel tab={panel} />
      </div>
    </aside>
  );
}

function MapStage() {
  const mapPick = useDelivery((state) => state.mapPick);
  return (
    <div className="relative h-full w-full">
      <MapView />
      {mapPick ? (
        <div className="absolute top-3 left-16 right-16 z-20 flex items-center justify-between gap-3 rounded-2xl border border-signal bg-ink/95 px-3 py-2">
          <p className="text-sm font-medium">Toque no mapa para marcar a entrega</p>
          <button
            type="button"
            onClick={() => useDelivery.getState().cancelPick()}
            className="h-10 shrink-0 rounded-full border border-line px-3 text-sm"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <MapCard />
      )}
    </div>
  );
}

function MapCard() {
  const selectedId = useDelivery((state) => state.selectedId);
  const comandas = useDelivery((state) => state.comandas);
  const run = useDelivery((state) => corridaAtiva(state));
  const nearId = useDelivery((state) => state.nearId);
  const upcoming = nextStop(run, comandas);
  const selected = comandas.find((item) => item.id === selectedId) ?? null;
  const last = run?.points[run.points.length - 1];
  const gaze = useDelivery((state) => state.gaze);
  const base = useDelivery((state) => state.base);
  const origin = partida({ base, gaze });
  const cue = useDelivery((state) => state.routeCue);
  const routeKm = useDelivery((state) => state.routeKm);
  const speed = useDelivery((state) => state.gpsMeta.speed);
  const stop = upcoming ?? (selected && selected.status !== "cancelada" ? selected : null);
  const here = last ?? gaze ?? origin;
  const distKm = stop && comandaHasPin(stop) ? haversine(here, stop) : null;
  const meters = cue?.meters ?? (distKm != null ? distKm * 1000 : null);
  const street = stop ? stop.endereco.split(",")[0] : "";
  const title = cue?.text ?? (stop ? street || stop.cliente : run ? "Circuito completo" : "Pronto para sair");
  const href = stop ? wazeLink(stop.endereco) : null;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20">
        <div className="pointer-events-auto flex items-center gap-3 rounded-3xl bg-ink/92 px-3 py-3 shadow-lg backdrop-blur-md">
          <TurnArrow modifier={cue?.modifier ?? "straight"} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-4xl leading-none tracking-wide">
              {meters == null ? "—" : metersLabel(meters / 1000)}
            </p>
            <p className="mt-1 truncate text-lg font-semibold">{title}</p>
            {stop && cue ? <p className="truncate text-sm text-muted">{street}</p> : null}
            {!stop ? (
              <p className="text-sm text-muted">Monte a rota e siga a faixa azul.</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20">
        <div className="pointer-events-auto rounded-3xl bg-ink/92 p-3 shadow-lg backdrop-blur-md">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-display text-3xl leading-none">{speed != null ? Math.round(speed) : "—"}</p>
              <p className="text-xs text-muted">km/h</p>
            </div>
            <div className="text-right">
              <p className="font-display text-3xl leading-none">{routeKm != null ? kmLabel(routeKm) : "—"}</p>
              <p className="text-xs text-muted">até a base</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {run && upcoming ? (
              <button
                type="button"
                onClick={() => useDelivery.getState().markEntregue(upcoming.id)}
                className="h-12 flex-1 rounded-full bg-paper text-sm font-semibold text-ink"
              >
                {nearId === upcoming.id ? "Confirmar entrega" : "Entregue"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => useDelivery.getState().setTab("rota")}
                className="h-12 flex-1 rounded-full bg-paper text-sm font-semibold text-ink"
              >
                Montar rota
              </button>
            )}
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center gap-1 rounded-full bg-go px-4 text-sm font-semibold text-ink"
              >
                <Navigation className="h-4 w-4" />
                Waze
              </a>
            ) : null}
          </div>
          {stop ? (
            <p className="mt-2 truncate text-center text-xs text-muted">
              {stop.cliente} · {brl(stop.valor)}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function comandaHasPin(item: { lat: number | null; lng: number | null }): item is { lat: number; lng: number } {
  return item.lat != null && item.lng != null;
}

function TurnArrow({ modifier }: { modifier: string }) {
  const turn = modifier.includes("left") ? -90 : modifier.includes("right") ? 90 : modifier === "uturn" ? 180 : 0;
  return (
    <span
      className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-paper text-ink"
      style={{ transform: `rotate(${turn}deg)` }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M12 19V6" strokeLinecap="round" />
        <path d="M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Panel({ tab }: { tab: Tab }) {
  if (tab === "comandas") return <ComandasPanel />;
  if (tab === "rota") return <RotaPanel />;
  if (tab === "km") return <KmPanel />;
  return <RotaPanel />;
}

function TabRow() {
  return (
    <div className="flex gap-1 border-b border-line p-2">
      {tabs.map((item) => (
        <TabButton key={item.id} item={item} />
      ))}
    </div>
  );
}

function TabButton({ item }: { item: (typeof tabs)[number] }) {
  const tab = useDelivery((state) => state.tab);
  const badge = useDelivery((state) => {
    if (item.id === "comandas") return state.comandas.filter((comanda) => comanda.status === "aberta").length;
    if (item.id === "rota") return state.ativaId ? 1 : 0;
    return 0;
  });
  const Icon = item.icon;
  const active = tab === item.id;
  return (
    <button
      type="button"
      onClick={() => useDelivery.getState().setTab(item.id)}
      className={cn(
        "relative flex h-11 flex-1 items-center justify-center gap-1 rounded-full text-sm font-medium",
        active ? "bg-paper text-ink" : "text-muted",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
      {badge > 0 ? (
        <span className={cn("font-mono text-xs", active ? "text-ink" : "text-signal")}>{badge}</span>
      ) : null}
    </button>
  );
}

function MobileNav() {
  return (
    <nav className="dock shrink-0 border-t border-line bg-bg md:hidden">
      <div className="flex">
        {tabs.map((item) => (
          <MobileTab key={item.id} item={item} />
        ))}
      </div>
    </nav>
  );
}

function MobileTab({ item }: { item: (typeof tabs)[number] }) {
  const tab = useDelivery((state) => state.tab);
  const badge = useDelivery((state) => {
    if (item.id === "comandas") return state.comandas.filter((comanda) => comanda.status === "aberta").length;
    if (item.id === "rota") return state.ativaId ? 1 : 0;
    return 0;
  });
  const Icon = item.icon;
  const active = tab === item.id;
  return (
    <button
      type="button"
      onClick={() => useDelivery.getState().setTab(item.id)}
      className={cn(
        "flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
        active ? "text-signal" : "text-muted",
      )}
    >
      <span className="relative">
        <Icon className="h-5 w-5" />
        {badge > 0 ? (
          <span className="absolute -top-1 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-signal px-1 font-mono text-xs leading-none text-signal-ink">
            {badge}
          </span>
        ) : null}
      </span>
      {item.label}
    </button>
  );
}
