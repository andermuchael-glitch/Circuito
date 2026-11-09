import { useEffect, useRef, useState } from "react";
import { Home, LocateFixed, Maximize2, Minimize2, Crosshair, Search, X, Layers2, Navigation, Volume2, VolumeX, ArrowUpRight, CornerUpLeft, CornerUpRight } from "lucide-react";
import * as mapboxgl from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Map as MapboxMap, Marker, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre GL JS 6 precisa do worker explicitamente empacotado pelo Vite.
setWorkerUrl(maplibreWorkerUrl);
import { IconButton } from "@/components/bits";
import { comPin, corridaAtiva, nextStop, useDelivery } from "@/lib/delivery-store";
import { bearing, type LatLng } from "@/lib/geo";
import { startOfToday } from "@/lib/format";
import { searchNominatim } from "@/lib/places";
import { cn } from "@/lib/cn";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/mapbox-config";

type SearchHit = { label: string; lat: number; lng: number };
type MapViewProps = { navigating?: boolean; destinationLabel?: string; instruction?: string; instructionMeters?: number | null; audioEnabled?: boolean; onToggleAudio?: () => void; expanded?: boolean; onToggleExpanded?: () => void };

function markerElement(label: string, kind: "rider" | "base" | "stop" | "done") {
  const el = document.createElement("div");
  el.className = `circuito-map-marker circuito-map-marker-${kind}`;
  if (kind === "rider") {
    const symbol = document.createElement("span");
    symbol.setAttribute("aria-label", "Direção atual");
    symbol.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3 57 53 32 43 7 53 32 3Z" fill="#0b3f91" opacity=".9"/><path d="M32 3 52 48 32 39 12 48 32 3Z" fill="#39a5ff" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/><path d="M32 12 43 40 32 35 21 40 32 12Z" fill="#eaf6ff"/><path d="M32 4v48" stroke="#ffffff" stroke-width="2" opacity=".8"/></svg>';
    el.appendChild(symbol);
  } else {
    el.textContent = label;
  }
  return el;
}

function featureLine(points: LatLng[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: points.map((point) => [point.lng, point.lat]),
    },
  };
}

export function MapView({ navigating = false, destinationLabel, instruction, instructionMeters, audioEnabled = true, onToggleAudio, expanded = false, onToggleExpanded }: MapViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const riderRef = useRef<Marker | null>(null);
  const searchMarkerRef = useRef<Marker | null>(null);
  const previousPosition = useRef<LatLng | null>(null);
  const headingRef = useRef(0);
  const lastCameraPosition = useRef<LatLng | null>(null);
  const fitted = useRef(-1);

  function distanceMeters(a: LatLng, b: LatLng) {
    const lat = ((a.lat + b.lat) / 2) * Math.PI / 180;
    const north = (b.lat - a.lat) * 111_320;
    const east = (b.lng - a.lng) * 111_320 * Math.cos(lat);
    return Math.hypot(north, east);
  }

  function smoothAngle(from: number, to: number, factor: number) {
    const delta = ((to - from + 540) % 360) - 180;
    return (from + delta * factor + 360) % 360;
  }
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapRetry, setMapRetry] = useState(0);
  const [darkStyle, setDarkStyle] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const follow = useDelivery((state) => state.follow);
  const tab = useDelivery((state) => state.tab);
  const liveStatus = useDelivery((state) => state.liveStatus);

  const tick = useDelivery((state) => {
    const run = corridaAtiva(state);
    return [
      state.comandas.map((item) => `${item.id}:${item.status}:${item.lat ?? "s"}:${item.lng ?? "s"}`).join("|"),
      state.gaze ? `${state.gaze.lat.toFixed(5)},${state.gaze.lng.toFixed(5)}` : "",
      state.liveStatus,
      state.base ? `${state.base.lat.toFixed(5)},${state.base.lng.toFixed(5)}` : "",
      run?.id ?? "",
      run?.ordem.join(",") ?? "",
      run?.feitas.join(",") ?? "",
      String(state.fitToken),
      String(state.routeRev),
      state.follow ? "1" : "0",
      state.draft?.lat != null && state.draft?.lng != null ? `draft:${state.draft.lat.toFixed(5)},${state.draft.lng!.toFixed(5)}` : "",
    ].join("~");
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!MAPBOX_ACCESS_TOKEN) {
      setMapError("O token público do Mapbox não foi configurado. Verifique VITE_MAPBOX_ACCESS_TOKEN.");
      return;
    }

    let disposed = false;
    let map: MapboxMap | null = null;
    let resize: ResizeObserver | null = null;
    setReady(false);
    setMapError("");

    const state = useDelivery.getState();
    const initial = state.gaze ?? state.base ?? { lat: -26.9955, lng: -48.6432 };
    const styleUrl = darkStyle
      ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=${MAPBOX_ACCESS_TOKEN}`
      : `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${MAPBOX_ACCESS_TOKEN}`;

    const startMap = async () => {
      try {
        // Baixa o estilo como JSON e remove metadados proprietários do Mapbox
        // que não fazem parte do Style Specification aceito pelo MapLibre.
        const response = await fetch(styleUrl);
        if (!response.ok) throw new Error(`Mapbox respondeu HTTP ${response.status}`);
        const style = await response.json() as Record<string, unknown>;
        if (disposed) return;

        map = new mapboxgl.Map({
          container: host,
          style: style as mapboxgl.StyleSpecification,
          center: [initial.lng, initial.lat],
          zoom: 17.2,
          pitch: 0,
          bearing: 0,
          maxZoom: 20,
          minZoom: 3,
          attributionControl: true,
          logoPosition: "bottom-left",
          cooperativeGestures: false,
          // Os estilos oficiais Mapbox podem conter metadados fora do schema MapLibre.
          // Não bloquear o carregamento por validação estrita desses campos.
          validateStyle: false,
        });
        mapRef.current = map;

        map.once("load", () => {
          if (disposed || !map) return;
          map.setBearing(0);
          map.setPitch(0);
          map.addSource("circuito-route", {
            type: "geojson",
            data: featureLine([]),
          });
          map.addLayer({
            id: "circuito-route-outline",
            type: "line",
            source: "circuito-route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#ffffff", "line-width": 11, "line-opacity": 0.9 },
          });
          map.addLayer({
            id: "circuito-route-line",
            type: "line",
            source: "circuito-route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#1685ff", "line-width": 7, "line-opacity": 1 },
          });
          setReady(true);
        });

        map.on("error", (event) => {
          console.warn("[Circuito Mapbox mapa]", event.error);
          if (!disposed && map && !map.isStyleLoaded()) {
            setMapError(`Falha ao carregar o mapa Mapbox: ${event.error?.message ?? "erro de estilo ou conexão"}. Verifique se o token está ativo e possui o escopo styles:read.`);
          }
        });

        resize = new ResizeObserver(() => map?.resize());
        resize.observe(host);
      } catch (error) {
        console.error("[Circuito] Falha ao iniciar Mapbox", error);
        if (!disposed) {
          setMapError(`Falha ao iniciar o mapa Mapbox: ${error instanceof Error ? error.message : String(error)}. Verifique o token público e a conexão.`);
        }
      }
    };

    void startMap();

    return () => {
      disposed = true;
      resize?.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      riderRef.current?.remove();
      searchMarkerRef.current?.remove();
      map?.remove();
      mapRef.current = null;
      markersRef.current = [];
      riderRef.current = null;
      searchMarkerRef.current = null;
      setReady(false);
    };
  }, [mapRetry, darkStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const state = useDelivery.getState();
    const run = corridaAtiva(state);
    const upcoming = nextStop(run, state.comandas);
    const today = startOfToday();
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (state.base) {
      markersRef.current.push(new mapboxgl.Marker({ element: markerElement("BASE", "base"), anchor: "center" })
        .setLngLat([state.base.lng, state.base.lat]).addTo(map));
    }

    const visible = state.comandas.filter(comPin).filter((item) => {
      if (item.status === "cancelada") return false;
      if (item.status !== "entregue") return true;
      return (item.deliveredAt ?? 0) >= today || Boolean(run?.ordem.includes(item.id));
    });
    for (const item of visible) {
      const index = run?.ordem.indexOf(item.id) ?? -1;
      const done = item.status === "entregue";
      const element = markerElement(index >= 0 ? String(index + 1) : "•", done ? "done" : "stop");
      if (upcoming?.id === item.id) element.classList.add("is-next");
      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([item.lng, item.lat]).addTo(map);
      marker.getElement().addEventListener("click", () => useDelivery.getState().select(item.id));
      markersRef.current.push(marker);
    }

    if (run?.destino) {
      markersRef.current.push(new maplibregl.Marker({ element: markerElement("DESTINO", "stop"), anchor: "center" })
        .setLngLat([run.destino.lng, run.destino.lat]).addTo(map));
    }

    const draft = state.draft;
    if (draft?.lat != null && draft.lng != null) {
      markersRef.current.push(new maplibregl.Marker({ element: markerElement("NOVO", "stop"), anchor: "center" })
        .setLngLat([draft.lng, draft.lat]).addTo(map));
    }

    const route = state.routeLine;
    const source = map.getSource("circuito-route") as GeoJSONSource | undefined;
    source?.setData(featureLine(route.length > 1 ? route : []));
    const current = state.gaze ?? run?.points[run.points.length - 1] ?? null;
    if (current) {
      const previous = previousPosition.current;
      if (previous) {
        const moved = distanceMeters(previous, current);
        // Pequenas oscilações do GPS (até ~4 m) não devem girar o mapa.
        if (moved >= 4) {
          const measuredHeading = bearing(previous, current);
          headingRef.current = smoothAngle(headingRef.current, measuredHeading, moved >= 12 ? 0.32 : 0.16);
        }
      }
      previousPosition.current = current;
      if (!riderRef.current) {
        riderRef.current = new maplibregl.Marker({ element: markerElement("🏍️", "rider"), anchor: "center", rotationAlignment: "viewport" })
          .setLngLat([current.lng, current.lat]).addTo(map);
      } else {
        riderRef.current.setLngLat([current.lng, current.lat]);
      }
      riderRef.current.setRotation(0);
    } else {
      riderRef.current?.remove();
      riderRef.current = null;
    }

    if (state.fitToken !== fitted.current) {
      fitted.current = state.fitToken;
      lastCameraPosition.current = current;
      if (current) map.easeTo({ center: [current.lng, current.lat], zoom: 17.2, pitch: 0, bearing: 0, offset: [0, 90], duration: 650 });
    } else if (state.follow && current && state.liveStatus === "ativo" && run?.modo === "gps") {
      // Só reposiciona a câmera após deslocamento real; evita animações reiniciadas
      // por cada pequena variação do GPS.
      const cameraPrevious = lastCameraPosition.current;
      const cameraMoved = cameraPrevious ? distanceMeters(cameraPrevious, current) : 999;
      if (!cameraPrevious || cameraMoved >= 4) {
        map.setPitch(0);
        lastCameraPosition.current = current;
        map.easeTo({
          center: [current.lng, current.lat],
          zoom: Math.min(Math.max(map.getZoom(), 17.0), 17.6),
          pitch: 0,
          offset: [0, 110],
          // Estilo navegador GPS: mantém a direção do deslocamento para cima.
          bearing: headingRef.current,
          duration: 1000,
          essential: true,
        });
      }
      riderRef.current?.setRotation(0);
    }
  }, [ready, tick, tab]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !query.trim()) {
      setHits([]);
      setSearching(false);
      setSearchMessage("");
      return;
    }
    if (query.trim().length < 3) {
      setHits([]);
      setSearchMessage("Digite pelo menos 3 caracteres.");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchMessage("");
      void searchNominatim(query.trim(), useDelivery.getState().gaze).then((results) => {
        if (controller.signal.aborted) return;
        setHits(results);
        setSearchMessage(results.length ? "" : "Nenhum endereço encontrado. Tente incluir rua, número e cidade.");
        setSearching(false);
      }).catch(() => {
        if (controller.signal.aborted) return;
        setHits([]);
        setSearching(false);
        setSearchMessage("Falha na busca. Confira a conexão e tente novamente.");
      });
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, ready]);

  function chooseAddress(hit: SearchHit) {
    const map = mapRef.current;
    if (!map) return;
    setSelectedLabel(hit.label);
    useDelivery.getState().setSearchDestination({ label: hit.label, lat: hit.lat, lng: hit.lng });
    setQuery(hit.label);
    setHits([]);
    setSearchOpen(false);
    searchMarkerRef.current?.remove();
    const pin = document.createElement("div");
    pin.className = "circuito-search-pin";
    pin.innerHTML = '<span></span>';
    searchMarkerRef.current = new maplibregl.Marker({ element: pin, anchor: "bottom" })
      .setLngLat([hit.lng, hit.lat]).addTo(map);
    map.easeTo({ center: [hit.lng, hit.lat], zoom: 17.2, pitch: 0, bearing: 0, duration: 900 });
  }

  function locate() {
    const state = useDelivery.getState();
    state.setFollow(true);
    if (state.liveStatus !== "ativo" && state.liveStatus !== "buscando") state.enableLive();
    const position = useDelivery.getState().gaze;
    if (position && mapRef.current) {
      mapRef.current.easeTo({ center: [position.lng, position.lat], zoom: 17.2, pitch: 0, bearing: 0, offset: [0, 80], duration: 800 });
    }
  }

  function toggleStyle() {
    setDarkStyle((value) => !value);
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />
      {navigating ? (
        <>
          <div className="absolute left-3 right-16 top-3 z-20 flex items-start gap-2"><div className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-[#071711]/90 px-3 py-2.5 text-white shadow-2xl backdrop-blur-xl"><p className="text-[10px] font-bold tracking-[.16em] text-[#4ade91]">NAVEGANDO PARA</p><p className="truncate text-sm font-semibold">{destinationLabel || "Próxima parada"}</p></div><button type="button" onClick={onToggleExpanded} aria-label={expanded ? "Recolher mapa" : "Expandir mapa"} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/15 bg-[#071711]/90 text-white shadow-xl backdrop-blur-xl">{expanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}</button></div>
          <div className="absolute bottom-3 left-3 right-3 z-20 rounded-2xl border border-[#fbbf24]/70 bg-[#071711]/95 p-3 text-white shadow-2xl backdrop-blur-xl"><div className="flex items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#ffb020] text-[#071711]">{instruction?.toLowerCase().includes("esquerda") || instruction?.toLowerCase().includes("left") ? <CornerUpLeft className="h-7 w-7" /> : instruction?.toLowerCase().includes("direita") || instruction?.toLowerCase().includes("right") ? <CornerUpRight className="h-7 w-7" /> : <ArrowUpRight className="h-7 w-7" />}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold tracking-[.16em] text-[#9bb5a4]">PRÓXIMA INSTRUÇÃO</p><p className="text-base font-extrabold leading-tight">{instruction || "Calculando caminho pelas ruas…"}</p>{instructionMeters != null ? <p className="mt-1 font-mono text-sm font-bold text-[#ffb020]">{instructionMeters >= 1000 ? `${(instructionMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : `${Math.max(0, Math.round(instructionMeters))} m`}</p> : null}</div><button type="button" onClick={onToggleAudio} aria-label={audioEnabled ? "Desativar narração" : "Ativar narração"} className="flex min-w-[58px] shrink-0 flex-col items-center gap-1 rounded-xl border border-white/15 px-2 py-2 text-[9px] font-bold text-[#a9c4b3]">{audioEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}{audioEnabled ? "SOM ON" : "SOM OFF"}</button></div></div>
        </>
      ) : null}
      {!navigating ? <div className="absolute left-3 right-16 top-3 z-20">
        {searchOpen ? (
          <div className="overflow-hidden rounded-2xl border border-white/20 bg-[#101d19]/95 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2 p-2">
              <Search className="ml-2 h-5 w-5 shrink-0 text-signal" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && hits[0]) chooseAddress(hits[0]); if (event.key === "Escape") setSearchOpen(false); }}
                placeholder="Pesquisar endereço ou local"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-paper outline-none placeholder:text-muted"
              />
              <button type="button" onClick={() => { setSearchOpen(false); setQuery(""); setHits([]); }} className="grid h-9 w-9 place-items-center rounded-full text-muted" aria-label="Fechar pesquisa"><X className="h-5 w-5" /></button>
            </div>
            {searching ? <p className="px-4 pb-3 text-xs text-muted">Buscando endereço…</p> : null}
            {searchMessage ? <p className="px-4 pb-3 text-xs text-muted">{searchMessage}</p> : null}
            {hits.length ? <div className="max-h-56 overflow-y-auto border-t border-white/10">
              {hits.map((hit, index) => (
                <button key={hit.lat + ":" + hit.lng + ":" + index} type="button" onClick={() => chooseAddress(hit)} className="flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left last:border-0 hover:bg-white/5">
                  <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                  <span className="text-sm leading-snug text-paper">{hit.label}</span>
                </button>
              ))}
            </div> : null}
          </div>
        ) : (
          <button type="button" onClick={() => setSearchOpen(true)} className="flex h-12 w-full items-center gap-3 rounded-2xl border border-white/20 bg-[#101d19]/90 px-4 text-left text-sm text-muted shadow-xl backdrop-blur-xl">
            <Search className="h-5 w-5 text-signal" />
            <span>Pesquisar endereço ou local</span>
          </button>
        )}
        {selectedLabel && !searchOpen ? <p className="mt-2 max-w-full truncate rounded-full bg-[#101d19]/85 px-3 py-1.5 text-xs text-paper shadow-lg">{selectedLabel}</p> : null}
      </div> : null}
      {mapError ? (
        <div role="alert" className="absolute bottom-3 left-3 right-3 z-30 rounded-2xl border border-danger bg-bg px-4 py-4 text-sm leading-relaxed text-paper shadow-xl">
          <strong className="mb-2 block text-base text-danger">Mapa Mapbox indisponível</strong>
          <p className="break-words">{mapError}</p>
          <button type="button" className="mt-3 rounded-xl border border-line px-4 py-2 font-semibold" onClick={() => { setMapError(""); setMapRetry((value) => value + 1); }}>Tentar novamente</button>
        </div>
      ) : null}
      <div className={`absolute right-3 ${navigating ? "top-[5.5rem]" : "top-[4.5rem]"} z-10 flex flex-col gap-2`}>
        <IconButton label="Onde estou" pressed={liveStatus === "ativo"} onClick={locate}><LocateFixed className="h-5 w-5" /></IconButton>
        <IconButton label={darkStyle ? "Mapa claro" : "Mapa escuro"} pressed={darkStyle} onClick={toggleStyle}><Layers2 className="h-5 w-5" /></IconButton>
        <IconButton label="Seguir posição" pressed={follow} onClick={() => useDelivery.getState().setFollow(!useDelivery.getState().follow)}><Crosshair className="h-5 w-5" /></IconButton>
        {!navigating ? <IconButton label="Enquadrar rota" onClick={() => {
          const points = useDelivery.getState().routeLine;
          if (points.length > 1 && mapRef.current) {
            const bounds = new mapboxgl.LngLatBounds();
            points.forEach((point) => bounds.extend([point.lng, point.lat]));
            mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 700 });
          } else useDelivery.getState().requestFit();
        }}><Maximize2 className="h-5 w-5" /></IconButton> : null}
        <IconButton label="Base aqui" onClick={() => useDelivery.getState().pinBaseHere()}><Home className="h-5 w-5" /></IconButton>
      </div>
    </div>
  );
}
