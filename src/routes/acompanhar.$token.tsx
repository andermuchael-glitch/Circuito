import { useEffect, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { getPublicLiveShare } from "@/lib/live-sharing";

type PublicShare = {
  corrida_id: string;
  latest_lat: number | null;
  latest_lng: number | null;
  accuracy: number | null;
  speed: number | null;
  updated_at: string;
  route_points: Array<{ lat: number; lng: number; t: number }>;
  active: boolean;
};

export const Route = createFileRoute("/acompanhar/$token")({ component: PublicTracking });

function PublicTracking() {
  const { token } = useParams({ from: "/acompanhar/$token" });
  const [data, setData] = useState<PublicShare | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const next = await getPublicLiveShare(token) as PublicShare | null;
        if (!alive) return;
        setData(next);
        setError(next ? "" : "Este link não está ativo ou não existe mais.");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Não foi possível carregar a localização.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [token]);

  const lat = data?.latest_lat;
  const lng = data?.latest_lng;
  const bbox = lat != null && lng != null
    ? `${lng - 0.006}%2C${lat - 0.004}%2C${lng + 0.006}%2C${lat + 0.004}`
    : "";
  const mapUrl = lat != null && lng != null
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`
    : "";

  return (
    <main className="min-h-dvh bg-[#07110c] px-4 py-6 text-white">
      <div className="mx-auto max-w-2xl">
        <header className="mb-5 flex items-center justify-between">
          <div><p className="text-xs tracking-[0.25em] text-[#b8f36b]">CIRCUITO</p><h1 className="mt-1 text-2xl font-bold">Acompanhamento de rota</h1></div>
          <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">Ao vivo</span>
        </header>
        {loading ? <p className="rounded-2xl bg-white/5 p-4 text-sm text-white/70">Buscando localização…</p> : null}
        {error ? <p role="status" className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{error}</p> : null}
        {data && !data.active ? (
          <section className="rounded-3xl border border-[#b8f36b]/25 bg-[#101c16] px-6 py-12 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#b8f36b]/15 text-3xl">✓</div>
            <h2 className="mt-5 text-2xl font-bold">Corrida encerrada!</h2>
            <p className="mt-3 text-base text-white/75">Obrigado por acompanhar. Até a próxima!</p>
          </section>
        ) : null}
        {data?.active && lat != null && lng != null ? (
          <>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101c16]">
              <iframe title="Mapa da localização compartilhada" src={mapUrl} className="h-[55vh] min-h-[320px] w-full border-0" loading="lazy" />
            </div>
            <section className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#101c16] p-4"><p className="text-xs text-white/50">Velocidade</p><p className="mt-1 text-2xl font-semibold">{data.speed != null ? `${Math.round(data.speed)} km/h` : "—"}</p></div>
              <div className="rounded-2xl bg-[#101c16] p-4"><p className="text-xs text-white/50">Precisão do GPS</p><p className="mt-1 text-2xl font-semibold">{data.accuracy != null ? `±${Math.round(data.accuracy)} m` : "—"}</p></div>
            </section>
            <p className="mt-3 text-xs text-white/50">Última atualização: {new Date(data.updated_at).toLocaleTimeString("pt-BR")}. O mapa atualiza automaticamente a cada 5 segundos.</p>
            <a className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#b8f36b] font-semibold text-[#14200f]" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${lat},${lng}`}>Abrir posição no Google Maps</a>
          </>
        ) : null}
        {data?.active ? (
          <p className="mt-6 text-center text-xs text-white/35">A posição só é atualizada enquanto o responsável mantém o GPS e o compartilhamento ativos.</p>
        ) : null}
      </div>
    </main>
  );
}
