import { useEffect } from "react";
import { ClipboardList, Gauge, Route } from "lucide-react";
import { Toaster } from "sonner";
import { ComandaForm } from "@/components/comanda-form";
import { ComandasPanel } from "@/components/comandas-panel";
import { KmPanel } from "@/components/km-panel";
import { LiveEngine } from "@/components/live-engine";
import { CloudDataSync } from "@/components/cloud-data-sync";
import { RouteEngine } from "@/components/route-engine";
import { RotaPanel } from "@/components/rota-panel";
import { cn } from "@/lib/cn";
import { resumo, useDelivery, type Tab } from "@/lib/delivery-store";
import { coordLabel, kmLabel } from "@/lib/format";

const tabs: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: "comandas", label: "Comandas", icon: ClipboardList },
  { id: "rota", label: "Rota", icon: Route },
  { id: "km", label: "Km", icon: Gauge },
];

export function App() {
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
    <div className="app-shell relative flex h-dvh flex-col bg-bg text-paper">
      <CloudDataSync />
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
      <div className="hidden shrink-0 md:block"><NavigationTabs /></div>
      <main className="min-h-0 flex-1">
        <Panel />
      </main>
      <MobileNav />
      <ComandaForm />
    </div>
  );
}

function Header() {
  const kmHoje = useDelivery((state) => resumo(state).kmHoje);
  const liveStatus = useDelivery((state) => state.liveStatus);
  const speed = useDelivery((state) => state.gpsMeta.speed);
  const gaze = useDelivery((state) => state.gaze);
  const tab = useDelivery((state) => state.tab);
  const liveLabel =
    liveStatus === "ativo"
      ? speed != null && speed >= 1 ? `${Math.round(speed)} km/h` : "Ao vivo"
      : liveStatus === "buscando" ? "Buscando" : "Ativar GPS";

  return (
    <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-signal text-signal-ink">
          <Route className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-2xl leading-none tracking-wide">ROUTE377</p>
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
            liveStatus === "ativo" ? "border-go text-go" :
              liveStatus === "negado" || liveStatus === "erro" ? "border-danger text-danger" : "border-line",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", liveStatus === "ativo" ? "rider-pulse bg-go" : "bg-muted")} />
          {liveLabel}
        </button>
        <button
          type="button"
          onClick={() => useDelivery.getState().setTab("km")}
          className={cn("h-10 rounded-full border border-line px-3 font-mono text-sm", tab === "km" && "border-signal text-signal")}
        >
          {kmLabel(kmHoje)}
        </button>
      </div>
    </header>
  );
}

function Panel() {
  const tab = useDelivery((state) => state.tab);
  if (tab === "rota") return <RotaPanel />;
  if (tab === "km") return <KmPanel />;
  return <ComandasPanel />;
}

function NavigationTabs() {
  return (
    <nav className="flex gap-1 border-b border-line p-2">
      {tabs.map((item) => <TabButton key={item.id} item={item} />)}
    </nav>
  );
}

function MobileNav() {
  return (
    <nav className="dock shrink-0 border-t border-line bg-bg md:hidden">
      <div className="flex">
        {tabs.map((item) => <TabButton key={item.id} item={item} mobile />)}
      </div>
    </nav>
  );
}

function TabButton({ item, mobile = false }: { item: (typeof tabs)[number]; mobile?: boolean }) {
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
        mobile
          ? "flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium"
          : "relative flex h-11 flex-1 items-center justify-center gap-1 rounded-full text-sm font-medium",
        active ? (mobile ? "text-signal" : "bg-paper text-ink") : "text-muted",
      )}
    >
      <span className="relative">
        <Icon className={mobile ? "h-5 w-5" : "h-4 w-4"} />
        {badge > 0 ? <span className="absolute -top-1 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-signal px-1 font-mono text-xs leading-none text-signal-ink">{badge}</span> : null}
      </span>
      {item.label}
    </button>
  );
}
