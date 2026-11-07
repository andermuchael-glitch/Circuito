import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, CornerUpLeft, CornerUpRight, Maximize2, Minimize2, Navigation, Play, Square, Volume2, VolumeX } from "lucide-react";
import { GhostButton, PrimaryButton, payName } from "@/components/bits";
import { comPin, corridaAtiva, nextStop, partida, useDelivery, type Comanda } from "@/lib/delivery-store";
import { duration, googleRouteLink, googleStopLink, kmLabel, metersLabel, waLink, wazeLink } from "@/lib/format";
import { haversine, optimizeOrder, straightKm } from "@/lib/geo";
import { holdScreen } from "@/lib/screen";
import { MapView } from "@/components/map-view";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/cn";
import { calculateTomTomRoute } from "@/lib/tomtom-routing";
import { drivingRoute } from "@/lib/routing";
import { createLiveShare, stopLiveShare } from "@/lib/live-sharing";

export function RotaPanel() {
  const comandas = useDelivery((state) => state.comandas);
  const ativaId = useDelivery((state) => state.ativaId);
  const corridas = useDelivery((state) => state.corridas);
  const gpsError = useDelivery((state) => state.gpsError);
  const gpsMeta = useDelivery((state) => state.gpsMeta);
  const liveStatus = useDelivery((state) => state.liveStatus);
  const nearId = useDelivery((state) => state.nearId);
  const base = useDelivery((state) => state.base);
  const gaze = useDelivery((state) => state.gaze);
  const origin = partida({ base, gaze });
  const routeKm = useDelivery((state) => state.routeKm);
  const routeKind = useDelivery((state) => state.routeKind);
  const routeCue = useDelivery((state) => state.routeCue);
  const searchDestination = useDelivery((state) => state.searchDestination);
  const run = corridas.find((item) => item.id === ativaId) ?? null;
  const now = useNow(Boolean(run && run.status === "ativa"));
  const [order, setOrder] = useState<string[]>([]);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try { return localStorage.getItem("circuito-voice-guidance") !== "off"; } catch { return true; }
  });
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeFailed, setRouteFailed] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const lastSpokenCue = useRef("");

  const abertas = comandas.filter(comPin).filter((item) => item.status === "aberta");
  const selected = order
    .map((id) => abertas.find((item) => item.id === id))
    .filter((item): item is (typeof abertas)[number] => Boolean(item));

  const estimate = useMemo(() => {
    if (!selected.length) return 0;
    return straightKm(origin, selected) + haversine(selected[selected.length - 1], origin);
  }, [origin, selected]);
  const roadKm = routeKind && selected.length ? routeKm : null;

  const routeStops = useMemo(() => {
    if (run?.destino) {
      return [gaze ?? origin, { lat: run.destino.lat, lng: run.destino.lng }];
    }
    if (run) {
      const pending = run.ordem
        .filter((id) => !run.feitas.includes(id))
        .map((id) => comandas.find((item) => item.id === id))
        .filter((item): item is Comanda & { lat: number; lng: number } => Boolean(item && comPin(item)));
      if (!pending.length) return [];
      const last = run.points[run.points.length - 1];
      const start = gaze ?? last ?? origin;
      return [start, ...pending, base ?? origin];
    }
    if (!selected.length) return [];
    return [origin, ...selected, base ?? origin];
  }, [
    run?.id,
    run?.destino?.lat,
    run?.destino?.lng,
    run?.ordem.join(","),
    run?.feitas.join(","),
    run?.points.length,
    comandas,
    gaze?.lat,
    gaze?.lng,
    origin.lat,
    origin.lng,
    base?.lat,
    base?.lng,
    selected.map((item) => item.id).join(","),
  ]);

  const routeRequestKey = routeStops.map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join(":");

  useEffect(() => {
    const store = useDelivery.getState();
    if (routeStops.length < 2) {
      store.setRoute({ line: [], km: null, kind: null, cue: null });
      setRouteLoading(false);
      setRouteFailed(false);
      return;
    }
    const controller = new AbortController();
    setRouteLoading(true);
    setRouteFailed(false);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          // OSRM fornece o trajeto e as instruções; TomTom fica como alternativa.
          const osrm = await drivingRoute(routeStops);
          if (controller.signal.aborted) return;
          if (osrm) {
            useDelivery.getState().setRoute({ line: osrm.points, km: osrm.km, kind: "rua", cue: osrm.cue });
            setRouteLoading(false);
            return;
          }
          const tomtom = await calculateTomTomRoute(routeStops, controller.signal);
          if (controller.signal.aborted) return;
          if (tomtom) {
            useDelivery.getState().setRoute({ line: tomtom.line, km: tomtom.km, kind: "rua", cue: null });
          } else {
            useDelivery.getState().setRoute({ line: [], km: null, kind: null, cue: null });
            setRouteFailed(true);
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          console.warn("[Circuito] Falha ao calcular rota viária", error);
          useDelivery.getState().setRoute({ line: [], km: null, kind: null, cue: null });
          setRouteFailed(true);
        } finally {
          if (!controller.signal.aborted) setRouteLoading(false);
        }
      })();
    }, 900);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [routeRequestKey]);
  useEffect(() => {
    if (!run || run.modo !== "gps" || liveStatus !== "ativo" || !routeCue || routeKind !== "rua") return;
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const cueKey = routeCue.text;
    if (!cueKey || lastSpokenCue.current === cueKey) return;
    lastSpokenCue.current = cueKey;
    const message = routeCue.meters > 0
      ? `${metersLabel(routeCue.meters / 1000)}. ${routeCue.text}`
      : routeCue.text;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "pt-BR";
    utterance.rate = 0.96;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, [run?.id, run?.modo, liveStatus, routeCue?.text, routeCue?.meters, routeKind, voiceEnabled, lastSpokenCue]);

  useEffect(() => {
    try { localStorage.setItem("circuito-voice-guidance", voiceEnabled ? "on" : "off"); } catch { /* preferência opcional */ }
    if (!voiceEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [voiceEnabled]);

  const queueKey = abertas.map((item) => item.id).join(",");

  useEffect(() => {
    if (run) return;
    const ids = queueKey ? queueKey.split(",") : [];
    setOrder((current) => {
      const kept = current.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !current.includes(id));
      if (!added.length && kept.length === current.length) return current;
      return optimizeOrder([...kept, ...added], abertas, origin);
    });
  }, [queueKey, run, abertas, origin]);

  useEffect(() => {
    if (run) return;
    useDelivery.getState().setPreview(order);
  }, [order, run]);

  useEffect(() => {
    return () => {
      if (!useDelivery.getState().ativaId) useDelivery.getState().setPreview([]);
    };
  }, []);

  function toggle(id: string) {
    setOrder((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function move(id: string, dir: -1 | 1) {
    setOrder((current) => {
      const index = current.indexOf(id);
      const next = index + dir;
      if (index < 0 || next < 0 || next >= current.length) return current;
      const copy = current.slice();
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }

  if (!run) {
    return (
      <div className="scroll h-full min-h-0 overflow-y-auto px-4 py-4">
        <h1 className="font-display text-3xl leading-none tracking-wide">ROTA</h1>
        <p className="mt-1 text-sm text-muted">
          A rota sai da {origin.endereco}, passa nas entregas e volta para a base. As ruas abrem no Waze ou no Google Maps.
        </p>

        <section className={cn(
          "overflow-hidden border border-line bg-surface",
          mapExpanded ? "fixed inset-0 z-[100] flex flex-col rounded-none" : "mt-4 rounded-2xl",
        )}>
          <div className={cn("flex items-center justify-between gap-3 px-3 py-3", mapExpanded && "pt-[calc(env(safe-area-inset-top)+12px)]")}>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Prévia do mapa</p>
              <p className="text-xs text-muted">Confira sua posição e as paradas antes de iniciar</p>
            </div>
            <button type="button" onClick={() => setMapExpanded((value) => !value)} aria-label={mapExpanded ? "Recolher mapa" : "Expandir mapa"} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-raised">
              {mapExpanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
          </div>
          <div className={cn("relative w-full", mapExpanded ? "min-h-0 flex-1" : "h-[55vh] min-h-[340px] max-h-[520px]")}>
            <MapView navigating={false} destinationLabel={searchDestination?.label ?? "Prévia da rota"} instruction={routeLoading ? "Calculando caminho pelas ruas…" : routeFailed ? "Falha ao calcular a rota. Confira a conexão." : searchDestination ? `Destino: ${searchDestination.label}` : "Confira sua posição e as paradas"} instructionMeters={null} audioEnabled={voiceEnabled} onToggleAudio={() => setVoiceEnabled((value) => !value)} expanded={mapExpanded} onToggleExpanded={() => setMapExpanded((value) => !value)} />
          </div>
        </section>

        {searchDestination ? (
          <div className="mt-4 rounded-2xl border border-signal bg-raised p-3">
            <p className="text-xs font-semibold tracking-wide text-muted">DESTINO PESQUISADO</p>
            <p className="mt-1 text-sm font-medium">{searchDestination.label}</p>
            <div className="mt-3"><PrimaryButton disabled={Boolean(ativaId)} onClick={() => {
              void holdScreen();
              useDelivery.getState().startDestinationRun(searchDestination);
            }}>
              <Navigation className="h-4 w-4" /> Iniciar corrida até este endereço
            </PrimaryButton></div>
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setOrder(abertas.map((item) => item.id))}
            className="h-10 rounded-full border border-line px-3 text-sm"
          >
            Marcar fila
          </button>
          <button
            type="button"
            onClick={() => setOrder(optimizeOrder(abertas.map((item) => item.id), abertas, origin))}
            className="h-10 rounded-full border border-line px-3 text-sm"
          >
            Ordenar perto
          </button>
        </div>

        <ul className="mt-3 space-y-2">
          {abertas.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">
              Nenhuma comanda aberta. Registre um pedido para abrir a corrida.
            </li>
          ) : (
            abertas.map((item) => {
              const on = order.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border p-3 text-left",
                      on ? "border-signal bg-raised" : "border-line bg-surface",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border",
                        on ? "border-signal bg-signal text-signal-ink" : "border-line",
                      )}
                    >
                      {on ? <Check className="h-4 w-4" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{item.cliente}</span>
                      <span className="block text-sm text-muted">{item.endereco}</span>
                      <span className="mt-1 block font-mono text-xs text-muted">
                        {metersLabel(haversine(origin, item))} da base
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {selected.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-line bg-raised p-3">
            <p className="text-xs font-medium tracking-wide text-muted">ORDEM DA CORRIDA</p>
            <ol className="mt-2 space-y-2">
              {selected.map((item, index) => {
                const prev = index === 0 ? origin : selected[index - 1];
                return (
                  <li key={item.id} className="flex items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-signal font-mono text-xs text-signal-ink">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.cliente}</span>
                      <span className="block font-mono text-xs text-muted">{metersLabel(haversine(prev, item))}</span>
                    </span>
                    <button type="button" aria-label="Subir" onClick={() => move(item.id, -1)} className="grid h-10 w-10 place-items-center rounded-full border border-line">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" aria-label="Descer" onClick={() => move(item.id, 1)} className="grid h-10 w-10 place-items-center rounded-full border border-line">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
              <li className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line font-mono text-xs">
                  B
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">Volta à base</span>
                  <span className="block font-mono text-xs text-muted">
                    {metersLabel(haversine(selected[selected.length - 1], origin))} · {origin.endereco}
                  </span>
                </span>
              </li>
            </ol>
            <p className="mt-3 font-mono text-sm">
              {roadKm != null
                ? `${routeKind === "rua" ? "Ida e volta" : "Em linha reta"} ${kmLabel(roadKm)}`
                : `Ida e volta ${kmLabel(estimate)}`}
              {" · "}
              {selected.length} {selected.length === 1 ? "parada" : "paradas"}
            </p>
          </div>
        ) : null}

        {selected.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted">OU NAVEGUE COM OUTRO APLICATIVO</p>
            <div className="grid grid-cols-2 gap-2">
            <a
              href={wazeLink(selected[0].endereco)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-full border border-line text-sm font-semibold"
            >
              Waze · 1ª parada
            </a>
            <a
              href={googleRouteLink(origin.endereco, selected.map((item) => item.endereco))}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-full border border-line text-sm font-semibold"
            >
              Google Maps · rota completa
            </a>
            </div>
          </div>
        ) : null}

        <div className="mt-2">
          <PrimaryButton
            disabled={!selected.length}
            onClick={() => {
              void holdScreen();
              useDelivery.getState().startCorrida(selected.map((item) => item.id));
              setOrder([]);
            }}
          >
            Iniciar navegação no Circuito
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const upcoming = nextStop(run, comandas);
  const destinationOnly = Boolean(run.destino);
  const restantes = run.ordem
    .filter((id) => !run.feitas.includes(id))
    .map((id) => comandas.find((item) => item.id === id)?.endereco)
    .filter((item): item is string => Boolean(item));
  const last = run.points[run.points.length - 1];
  const dist = upcoming && last ? haversine(last, upcoming) : upcoming ? haversine(origin, upcoming) : 0;
  const speed =
    run.modo === "simulacao"
      ? "SIM"
      : gpsMeta.speed != null
        ? `${Math.round(gpsMeta.speed)}`
        : "—";

  return (
    <div className="scroll h-full min-h-0 overflow-y-auto px-4 py-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted">CORRIDA ABERTA</p>
          <h1 className="font-display text-5xl leading-none tracking-wide">{kmLabel(run.km)}</h1>
        </div>
        <p className="font-mono text-sm text-muted">{duration(now - run.startedAt)}</p>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Feitas" value={String(run.feitas.length)} />
        <Stat label="Restam" value={String(run.ordem.length - run.feitas.length)} />
        <Stat label="km/h" value={speed} />
      </dl>

      <section className={cn(
        "overflow-hidden border border-line bg-surface",
        mapExpanded ? "fixed inset-0 z-[100] flex flex-col rounded-none" : "mt-4 rounded-2xl",
      )}>
        <div className={cn("flex items-center justify-between gap-3 px-3 py-3", mapExpanded && "pt-[calc(env(safe-area-inset-top)+12px)]")}>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{destinationOnly ? "Navegação até o destino" : "Mapa da rota"}</p>
            <p className="text-xs text-muted">OpenStreetMap · posição pelo GPS</p>
            <span className={cn("mt-1 inline-flex rounded-full px-2 py-1 text-xs", liveStatus === "ativo" ? "bg-go/15 text-go" : "bg-raised text-muted")}>{liveStatus === "ativo" ? "GPS ativo" : "Aguardando GPS"}</span>
          </div>
          <button type="button" onClick={() => setMapExpanded((value) => !value)} aria-label={mapExpanded ? "Recolher mapa" : "Expandir mapa"} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-raised">
            {mapExpanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
        <div className={cn("relative w-full", mapExpanded ? "min-h-0 flex-1" : "h-[55vh] min-h-[340px] max-h-[520px]")}>
          <MapView />
        </div>
      </section>

      {gpsError ? <p className="mt-3 rounded-2xl bg-raised px-3 py-2 text-sm text-danger">{gpsError}</p> : null}
      {run.modo === "gps" && gpsMeta.weak ? (
        <p className="mt-3 text-sm text-muted">Sinal fraco{gpsMeta.accuracy ? ` · ±${Math.round(gpsMeta.accuracy)} m` : ""}.</p>
      ) : null}
      {run.modo === "gps" && liveStatus === "ativo" ? (
        <p className="mt-3 text-sm text-go">Localização ao vivo. Cada movimento entra no km.</p>
      ) : null}
      {run.modo === "simulacao" ? (
        <p className="mt-3 text-sm text-muted">Simulação acelerada. Os km são o comprimento real da rota.</p>
      ) : null}

      {destinationOnly ? (
        <div className="mt-4 rounded-2xl border border-signal bg-raised p-3">
          <p className="text-xs font-semibold tracking-wide text-muted">DESTINO</p>
          <p className="mt-1 font-semibold">{run.destino?.label}</p>
          <section className="mt-4 rounded-2xl border border-line bg-raised p-3">
        <p className="text-sm font-semibold">Compartilhar localização da corrida</p>
        <p className="mt-1 text-xs text-muted">Gere um link para outra pessoa acompanhar sua posição enquanto o GPS estiver ativo.</p>
        {shareLink ? (
          <div className="mt-3 space-y-2">
            <p className="break-all rounded-xl bg-black/20 p-2 text-xs text-signal">{shareLink}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void navigator.clipboard.writeText(shareLink)} className="h-10 rounded-full bg-signal text-sm font-semibold text-signal-ink">Copiar link</button>
              <button type="button" onClick={async () => {
                const stored = JSON.parse(localStorage.getItem("circuito-live-share") || "null") as { token?: string } | null;
                if (stored?.token) await stopLiveShare(stored.token).catch(() => undefined);
                localStorage.removeItem("circuito-live-share");
                setShareLink("");
              }} className="h-10 rounded-full border border-line text-sm">Encerrar link</button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={shareBusy} onClick={async () => {
            setShareBusy(true);
            try {
              const share = await createLiveShare(run.id);
              const url = new URL(`acompanhar/${share.token}`, window.location.href);
              const value = { id: share.id, token: share.token, corridaId: run.id };
              localStorage.setItem("circuito-live-share", JSON.stringify(value));
              setShareLink(url.toString());
            } catch (error) {
              const message = error instanceof Error ? error.message : "Não foi possível criar o link.";
              window.alert(message);
            } finally { setShareBusy(false); }
          }} className="mt-3 h-11 w-full rounded-full bg-signal text-sm font-bold text-signal-ink disabled:opacity-50">
            {shareBusy ? "Gerando link…" : "Gerar link de acompanhamento"}
          </button>
        )}
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={wazeLink(run.destino?.label ?? "")} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center rounded-full bg-signal text-sm font-semibold text-signal-ink">Waze</a>
            <a href={googleStopLink(run.destino?.label ?? "")} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center rounded-full border border-line text-sm font-semibold">Google Maps</a>
          </div>
        </div>
      ) : null}

      <ol className="mt-4 space-y-2">
        {run.ordem.map((id, index) => {
          const item = comandas.find((comanda) => comanda.id === id);
          if (!item) return null;
          const done = run.feitas.includes(id);
          const current = upcoming?.id === id;
          return (
            <li
              key={id}
              className={cn(
                "rounded-2xl border p-3",
                current ? "border-signal bg-raised" : "border-line bg-surface",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs",
                    done ? "bg-go text-ink" : current ? "bg-signal text-signal-ink" : "bg-ink text-muted",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.cliente}</p>
                  <p className="text-sm text-muted">{item.endereco}</p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {item.numero} · {payName(item.pagamento)}
                    {current ? ` · ${metersLabel(dist)}` : ""}
                  </p>
                </div>
              </div>
              {current ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a
                    href={wazeLink(item.endereco)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-1 rounded-full bg-signal text-sm font-semibold text-signal-ink"
                  >
                    <Navigation className="h-4 w-4" />
                    Waze
                  </a>
                  <a
                    href={googleStopLink(item.endereco)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center rounded-full border border-line text-sm font-semibold"
                  >
                    Google Maps
                  </a>
                  {waLink(item.telefone) ? (
                    <a
                      href={waLink(item.telefone) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="col-span-2 inline-flex h-11 items-center justify-center rounded-full border border-line text-sm font-semibold"
                    >
                      WhatsApp
                    </a>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {restantes.length > 0 ? (
        <a
          href={googleRouteLink(origin.endereco, restantes)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full border border-line text-sm font-semibold"
        >
          Rota inteira no Google Maps
        </a>
      ) : null}

      {destinationOnly ? (
        <p className="mt-4 rounded-2xl bg-go px-3 py-3 text-sm font-semibold text-ink">Navegação ativa. Ao chegar, encerre a corrida para registrar os quilômetros.</p>
      ) : upcoming ? (
        <div className="mt-4">
          <PrimaryButton
            onClick={() => useDelivery.getState().markEntregue(upcoming.id)}
          >
            <Check className="h-4 w-4" />
            {nearId === upcoming.id ? "Cheguei · confirmar entrega" : `Entregue · ${upcoming.cliente}`}
          </PrimaryButton>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-go px-3 py-3 text-sm font-semibold text-ink">
          Todas as paradas feitas. Encerre para guardar o km.
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {run.modo === "gps" ? (
          <GhostButton onClick={() => useDelivery.getState().setModo("parado")}>
            <Square className="h-4 w-4" />
            Parar GPS
          </GhostButton>
        ) : (
          <GhostButton
            disabled={run.modo === "simulacao"}
            onClick={() => {
              const state = useDelivery.getState();
              if (!state.live || state.liveStatus === "off" || state.liveStatus === "negado" || state.liveStatus === "erro") {
                state.enableLive();
              }
              state.setModo("gps");
            }}
          >
            <LocateDot />
            Usar GPS
          </GhostButton>
        )}
        {run.modo === "simulacao" ? (
          <GhostButton onClick={() => useDelivery.getState().setModo("parado")}>
            <Square className="h-4 w-4" />
            Parar simulação
          </GhostButton>
        ) : (
          <GhostButton onClick={() => useDelivery.getState().setModo("simulacao")}>
            <Play className="h-4 w-4" />
            Simular rota
          </GhostButton>
        )}
      </div>

      <div className="mt-3">
        {confirmEnd ? (
          <div className="grid grid-cols-2 gap-2">
            <GhostButton onClick={() => setConfirmEnd(false)}>Voltar</GhostButton>
            <button
              type="button"
              onClick={async () => {
                const stored = JSON.parse(localStorage.getItem("circuito-live-share") || "null") as { token?: string; corridaId?: string } | null;
                if (stored?.corridaId === run.id && stored.token) {
                  try {
                    await stopLiveShare(stored.token);
                  } catch (error) {
                    console.warn("[Circuito] Não foi possível encerrar o link no servidor", error);
                  }
                  localStorage.removeItem("circuito-live-share");
                  setShareLink("");
                }
                useDelivery.getState().encerrar();
              }}
              className="inline-flex h-12 items-center justify-center rounded-full bg-danger px-4 text-sm font-semibold text-ink"
            >
              Confirmar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="h-12 w-full rounded-full text-sm font-semibold text-danger"
          >
            Encerrar corrida
          </button>
        )}
      </div>
    </div>
  );
}

function LocateDot() {
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-go" />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-raised px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-lg leading-tight">{value}</dd>
    </div>
  );
}
