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
import { payName } from "@/components/bits";
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
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-3">
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
  const abertas = useDelivery((state) => resumo(state).abertas);
  const upcoming = nextStop(run, comandas);
  const selected = comandas.find((item) => item.id === selectedId) ?? null;
  const last = run?.points[run.points.length - 1];
  const gaze = useDelivery((state) => state.gaze);
  const base = useDelivery((state) => state.base);
  const origin = partida({ base, gaze });

  let title = "Fila de hoje";
  let body =
    abertas === 0
      ? "Nenhuma comanda ainda. Registre um pedido para começar."
      : `${abertas} ${abertas === 1 ? "comanda aberta" : "comandas na fila"}.`;
  let action: { label: string; onClick: () => void } | null = {
    label: "Montar rota",
    onClick: () => useDelivery.getState().setTab("rota"),
  };
  let extra: string | null = null;
  let href: string | null = null;

  if (run && upcoming) {
    const dist = haversine(last ?? origin, upcoming);
    title = upcoming.cliente;
    body = upcoming.endereco;
    extra = `${upcoming.numero} · ${brl(upcoming.valor)} · ${payName(upcoming.pagamento)} · ${metersLabel(dist)}`;
    href = wazeLink(upcoming.endereco);
    action = {
      label: nearId === upcoming.id ? "Confirmar entrega" : "Marcar entregue",
      onClick: () => useDelivery.getState().markEntregue(upcoming.id),
    };
  } else if (run && !upcoming) {
    title = "Circuito completo";
    body = `${kmLabel(run.km)} no rastro. Encerre a corrida para guardar.`;
    action = { label: "Ver km", onClick: () => useDelivery.getState().setTab("km") };
  } else if (selected && selected.status !== "cancelada") {
    title = selected.cliente;
    body = selected.endereco;
    extra = `${selected.numero} · ${brl(selected.valor)} · ${payName(selected.pagamento)}`;
    href = wazeLink(selected.endereco);
    action =
      selected.status === "aberta"
        ? { label: "Incluir na rota", onClick: () => useDelivery.getState().setTab("rota") }
        : null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
      <div className="pointer-events-auto rounded-2xl border border-line bg-ink/95 p-3 backdrop-blur-sm">
        <p className="text-xs font-medium tracking-wide text-signal">
          {run ? "PRÓXIMA PARADA" : "CIRCUITO"}
        </p>
        <h2 className="mt-1 truncate text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted">{body}</p>
        {extra ? <p className="mt-1 font-mono text-xs text-muted">{extra}</p> : null}
        <div className="mt-3 flex gap-2">
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="h-11 flex-1 rounded-full bg-signal text-sm font-semibold text-signal-ink"
            >
              {action.label}
            </button>
          ) : null}
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center gap-1 rounded-full border border-line px-4 text-sm font-semibold"
            >
              <Navigation className="h-4 w-4" />
              Waze
            </a>
          ) : null}
        </div>
      </div>
    </div>
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
