import { useEffect, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { getPublicTracking } from "@/lib/live-sharing";

type LegacyShare = {
  corrida_id: string;
  latest_lat: number | null;
  latest_lng: number | null;
  accuracy: number | null;
  speed: number | null;
  updated_at: string;
  route_points: Array<{ lat: number; lng: number; t: number }>;
  active: boolean;
};

type PermanentPayload = {
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

type TrackingData =
  | { kind: "race"; data: LegacyShare }
  | { kind: "permanent"; data: PermanentPayload; updated_at: string };

export const Route = createFileRoute("/acompanhar/$token")({ component: PublicTracking });

function distanceLabel(meters?: number | null) {
  if (meters == null || !Number.isFinite(meters)) return "Calculando…";
  return meters >= 1000 ? `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : `${Math.round(meters)} m`;
}

function etaLabel(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "Calculando…";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function PublicTracking() {
  const { token } = useParams({ from: "/acompanhar/$token" });
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const next = await getPublicTracking(token) as TrackingData | null;
        if (!alive) return;
        setTracking(next);
        setError(next ? "" : "Este link não existe ou não está disponível.");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Não foi possível carregar o acompanhamento.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [token]);

  if (tracking?.kind === "race") {
    const data = tracking.data;
    const lat = data.latest_lat;
    const lng = data.latest_lng;
    const bbox = lat != null && lng != null ? `${lng - 0.006}%2C${lat - 0.004}%2C${lng + 0.006}%2C${lat + 0.004}` : "";
    const mapUrl = lat != null && lng != null ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}` : "";
    return (
      <main className="min-h-dvh bg-[#07110c] px-4 py-6 text-white">
        <div className="mx-auto max-w-2xl">
          <Header />
          {loading ? <p className="rounded-2xl bg-white/5 p-4 text-sm text-white/70">Buscando localização…</p> : null}
          {error ? <Message>{error}</Message> : null}
          {!data.active ? <Finished /> : null}
          {data.active && lat != null && lng != null ? <>
            <MapFrame mapUrl={mapUrl} />
            <section className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Velocidade" value={data.speed != null ? `${Math.round(data.speed)} km/h` : "—"} />
              <Metric label="Precisão do GPS" value={data.accuracy != null ? `±${Math.round(data.accuracy)} m` : "—"} />
            </section>
            <p className="mt-3 text-xs text-white/50">Última atualização: {new Date(data.updated_at).toLocaleTimeString("pt-BR")}. Atualização automática a cada 5 segundos.</p>
            <a className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#b8f36b] font-semibold text-[#14200f]" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${lat},${lng}`}>Abrir posição no Google Maps</a>
          </> : null}
        </div>
      </main>
    );
  }

  const data = tracking?.data as PermanentPayload | undefined;
  const lat = data?.latest_lat;
  const lng = data?.latest_lng;
  const targetLat = data?.destination_lat;
  const targetLng = data?.destination_lng;
  const bbox = lat != null && lng != null ? `${lng - 0.008}%2C${lat - 0.006}%2C${lng + 0.008}%2C${lat + 0.006}` : "";
  const mapUrl = lat != null && lng != null ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}` : "";
  const directionsUrl = lat != null && lng != null && targetLat != null && targetLng != null
    ? `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${targetLat},${targetLng}&travelmode=driving`
    : null;

  return (
    <main className="min-h-dvh bg-[#07110c] px-4 py-6 text-white">
      <div className="mx-auto max-w-2xl">
        <Header />
        {loading ? <p className="rounded-2xl bg-white/5 p-4 text-sm text-white/70">Carregando acompanhamento…</p> : null}
        {error ? <Message>{error}</Message> : null}
        {!data || data.status === "idle" || data.status === "delivered" ? (
          <section className="rounded-3xl border border-[#b8f36b]/25 bg-[#101c16] px-6 py-10 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#b8f36b]/15 text-3xl">✓</div>
            <h2 className="mt-5 text-2xl font-bold">{data?.status === "delivered" ? "Entrega concluída!" : "Aguardando próxima corrida"}</h2>
            <p className="mt-3 text-base text-white/75">Este é o link permanente do estabelecimento. Assim que uma nova corrida começar, o mapa e as informações aparecerão aqui automaticamente.</p>
          </section>
        ) : <>
          <section className="mb-4 rounded-2xl border border-[#b8f36b]/30 bg-[#101c16] p-4">
            <p className="text-xs font-semibold tracking-wider text-[#b8f36b]">{data.status === "returning" ? "RETORNO À BASE" : "ENTREGA A CAMINHO"}</p>
            <h2 className="mt-1 text-xl font-bold">{data.status === "returning" ? "Voltando para a base" : data.current_order ? `Comanda ${data.current_order}` : data.customer || "Indo para entrega"}</h2>
            {data.customer ? <p className="mt-1 text-sm text-white/75">{data.customer}</p> : null}
            {data.destination_label ? <p className="mt-1 text-sm text-white/60">{data.destination_label}</p> : null}
          </section>
          {lat != null && lng != null ? <MapFrame mapUrl={mapUrl} /> : <Message>Aguardando a primeira posição do GPS…</Message>}
          <section className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="Distância restante" value={distanceLabel(data.distance_m)} />
            <Metric label="Previsão de chegada" value={etaLabel(data.eta_seconds)} />
          </section>
          <section className="mt-3 grid grid-cols-2 gap-3">
            <Metric label="Velocidade" value={data.speed != null ? `${Math.round(data.speed)} km/h` : "—"} />
            <Metric label="Precisão do GPS" value={data.accuracy != null ? `±${Math.round(data.accuracy)} m` : "—"} />
          </section>
          <p className="mt-3 text-xs text-white/50">Atualizado às {new Date(data.updated_at || tracking?.updated_at || Date.now()).toLocaleTimeString("pt-BR")}. Atualização automática a cada 5 segundos.</p>
          {directionsUrl ? <a className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#b8f36b] font-semibold text-[#14200f]" target="_blank" rel="noreferrer" href={directionsUrl}>Ver trajeto até o destino</a> : null}
        </>}
        <p className="mt-6 text-center text-xs text-white/35">A localização só é atualizada enquanto o GPS e o compartilhamento estiverem ativos.</p>
      </div>
    </main>
  );
}

function Header() {
  return <header className="mb-5 flex items-center justify-between">
    <div><p className="text-xs tracking-[0.25em] text-[#b8f36b]">CIRCUITO</p><h1 className="mt-1 text-2xl font-bold">Acompanhamento de entrega</h1></div>
    <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">Ao vivo</span>
  </header>;
}

function MapFrame({ mapUrl }: { mapUrl: string }) {
  return <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101c16]">
    <iframe title="Mapa da localização compartilhada" src={mapUrl} className="h-[55vh] min-h-[320px] w-full border-0" loading="lazy" />
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-[#101c16] p-4">
    <p className="text-xs text-white/50">{label}</p>
    <p className="mt-1 text-2xl font-semibold">{value}</p>
  </div>;
}

function Message({ children }: { children: string }) {
  return <p role="status" className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{children}</p>;
}

function Finished() {
  return <section className="rounded-3xl border border-[#b8f36b]/25 bg-[#101c16] px-6 py-12 text-center">
    <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#b8f36b]/15 text-3xl">✓</div>
    <h2 className="mt-5 text-2xl font-bold">Corrida encerrada!</h2>
    <p className="mt-3 text-base text-white/75">Obrigado por acompanhar! Bom apetite até a próxima!</p>
  </section>;
}
