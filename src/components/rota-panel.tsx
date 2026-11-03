import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Navigation, Play, Square } from "lucide-react";
import { GhostButton, PrimaryButton, payName } from "@/components/bits";
import { comPin, corridaAtiva, nextStop, partida, useDelivery, type Comanda } from "@/lib/delivery-store";
import { duration, googleRouteLink, googleStopLink, kmLabel, metersLabel, waLink, wazeLink } from "@/lib/format";
import { haversine, optimizeOrder, straightKm } from "@/lib/geo";
import { holdScreen } from "@/lib/screen";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/cn";

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
  const run = corridas.find((item) => item.id === ativaId) ?? null;
  const now = useNow(Boolean(run && run.status === "ativa"));
  const [order, setOrder] = useState<string[]>([]);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const abertas = comandas.filter(comPin).filter((item) => item.status === "aberta");
  const selected = order
    .map((id) => abertas.find((item) => item.id === id))
    .filter((item): item is (typeof abertas)[number] => Boolean(item));

  const estimate = useMemo(() => {
    if (!selected.length) return 0;
    return straightKm(origin, selected) + haversine(selected[selected.length - 1], origin);
  }, [origin, selected]);
  const roadKm = routeKind && selected.length ? routeKm : null;
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
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a
              href={wazeLink(selected[0].endereco)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-full border border-line text-sm font-semibold"
            >
              Waze
            </a>
            <a
              href={googleRouteLink(origin.endereco, selected.map((item) => item.endereco))}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-full border border-line text-sm font-semibold"
            >
              Google Maps
            </a>
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
            Sair para entregar
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const upcoming = nextStop(run, comandas);
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

      {upcoming ? (
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
              onClick={() => useDelivery.getState().encerrar()}
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
