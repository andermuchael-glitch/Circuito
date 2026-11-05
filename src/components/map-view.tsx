import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Home, LocateFixed, Maximize2, Crosshair, Layers2 } from "lucide-react";
import { IconButton } from "@/components/bits";
import { comPin, corridaAtiva, nextStop, partida, useDelivery } from "@/lib/delivery-store";
import { bearing, type LatLng } from "@/lib/geo";
import { startOfToday } from "@/lib/format";
import "maplibre-gl/dist/maplibre-gl.css";

// Configuração oficial do MapLibre 6 para Vite: inclui o worker e o shared chunk.
setWorkerUrl(workerUrl);


type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, never>;
    geometry: { type: "LineString"; coordinates: [number, number][] };
  }>;
};

function lineData(points: LatLng[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.length > 1 ? [{
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: points.map((point) => [point.lng, point.lat]) },
    }] : [],
  };
}

function markerElement(label: string, kind: "rider" | "base" | "stop" | "done") {
  const el = document.createElement("div");
  el.className = `circuito-map-marker circuito-map-marker-${kind}`;
  if (kind === "rider") {
    const symbol = document.createElement("span");
    symbol.textContent = label;
    el.appendChild(symbol);
  } else {
    el.textContent = label;
  }
  return el;
}

export function MapView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const riderRef = useRef<Marker | null>(null);
  const previousPosition = useRef<LatLng | null>(null);
  const headingRef = useRef(0);
  const fitted = useRef(-1);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapRetry, setMapRetry] = useState(0);
  const [threeD, setThreeD] = useState(false);
  const follow = useDelivery((state) => state.follow);
  const tab = useDelivery((state) => state.tab);
  const liveStatus = useDelivery((state) => state.liveStatus);

  const tick = useDelivery((state) => {
    const run = corridaAtiva(state);
    return [
      state.comandas.map((item) => `${item.id}:${item.status}:${item.lat ?? "s"}:${item.lng ?? "s"}`).join("|"),
      state.gaze ? `${state.gaze.lat.toFixed(5)},${state.gaze.lng.toFixed(5)}` : "",
      state.liveStatus,
      state.gpsMeta.accuracy == null ? "" : String(Math.round(state.gpsMeta.accuracy)),
      state.base ? `${state.base.lat.toFixed(5)},${state.base.lng.toFixed(5)}` : "",
      run?.id ?? "",
      run?.ordem.join(",") ?? "",
      run?.feitas.join(",") ?? "",
      String(run?.points.length ?? 0),
      String(state.fitToken),
      String(state.routeRev),
      state.follow ? "1" : "0",
      state.mapPick ? "pick" : "",
    ].join("~");
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let loaded = false;
    const loadTimeout = window.setTimeout(() => {
      if (!disposed && !loaded) setMapError("O mapa demorou para responder. Verifique a conexão e toque em Tentar novamente.");
    }, 12000);
    const initial = useDelivery.getState().gaze ?? useDelivery.getState().base ?? { lat: -26.99, lng: -48.64 };
    const map = new MapLibreMap({
      container: host,
      // Camada raster direta do OpenStreetMap: evita dependência de
      // style.json, sprites e fontes externas do provedor de mapas.
      style: {
        version: 8,
        sources: {
          "osm-raster": {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxzoom: 19,
          },
        },
        layers: [{ id: "osm-raster", type: "raster", source: "osm-raster" }],
      },
      center: [initial.lng, initial.lat],
      zoom: 15,
      pitch: 0,
      attributionControl: true,
      maxPitch: 60,
    });
    map.on("error", (event) => {
      if (disposed) return;
      const message = event.error?.message ?? "Falha ao carregar os blocos do mapa";
      console.error("[Circuito mapa]", event.error);
      setMapError(message);
    });
    map.on("load", () => {
      if (disposed) return;
      loaded = true;
      window.clearTimeout(loadTimeout);
      map.addSource("circuito-route", { type: "geojson", data: lineData([]) });
      map.addLayer({
        id: "circuito-route-casing",
        type: "line",
        source: "circuito-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.92 },
      });
      map.addLayer({
        id: "circuito-route-line",
        type: "line",
        source: "circuito-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1677ed", "line-width": 6 },
      });
      setReady(true);
    });
    map.on("click", (event) => {
      const state = useDelivery.getState();
      if (state.mapPick) state.dropPin({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });
    mapRef.current = map;
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(host);
    return () => {
      disposed = true;
      window.clearTimeout(loadTimeout);
      resize.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      riderRef.current?.remove();
      map.remove();
      mapRef.current = null;
      riderRef.current = null;
      markersRef.current = [];
      setReady(false);
    };
  }, [mapRetry]);

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
      markersRef.current.push(new Marker({ element: markerElement("BASE", "base"), anchor: "center" })
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
      const marker = new Marker({ element, anchor: "center" }).setLngLat([item.lng, item.lat]).addTo(map);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        useDelivery.getState().select(item.id);
      });
      markersRef.current.push(marker);
    }

    const runPoints = run?.points ?? [];
    const current = state.gaze ?? runPoints[runPoints.length - 1] ?? null;
    const route = state.routeLine.length > 1 ? state.routeLine : [
      ...(current ? [current] : []),
      ...visible.filter((item) => run?.ordem.includes(item.id) && !run.feitas.includes(item.id)),
    ];
    const source = map.getSource("circuito-route") as GeoJSONSource | undefined;
    source?.setData(lineData(route));

    if (current) {
      const previous = previousPosition.current;
      if (previous && Math.hypot(previous.lat - current.lat, previous.lng - current.lng) > 0.00002) {
        headingRef.current = bearing(previous, current);
      }
      previousPosition.current = current;
      if (!riderRef.current) {
        riderRef.current = new Marker({ element: markerElement("🏍️", "rider"), anchor: "center" })
          .setLngLat([current.lng, current.lat]).addTo(map);
      } else {
        riderRef.current.setLngLat([current.lng, current.lat]);
      }
      const riderEl = riderRef.current.getElement();
      riderEl.style.setProperty("--rider-heading", `${headingRef.current}deg`);
    } else {
      riderRef.current?.remove();
      riderRef.current = null;
    }

    if (state.fitToken !== fitted.current) {
      fitted.current = state.fitToken;
      if (current) map.easeTo({ center: [current.lng, current.lat], zoom: 16, duration: 500 });
    } else if (state.follow && current && state.liveStatus === "ativo" && run?.modo === "gps") {
      map.easeTo({
        center: [current.lng, current.lat],
        zoom: Math.max(map.getZoom(), 16.5),
        bearing: threeD ? headingRef.current : 0,
        pitch: threeD ? 52 : 0,
        duration: 650,
      });
    }
  }, [ready, tick, tab, threeD]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.easeTo({
      pitch: threeD ? 52 : 0,
      bearing: threeD ? headingRef.current : 0,
      duration: 700,
    });
  }, [threeD, ready]);

  function locate() {
    const state = useDelivery.getState();
    state.setFollow(true);
    if (state.liveStatus !== "ativo" && state.liveStatus !== "buscando") state.enableLive();
    const gaze = useDelivery.getState().gaze;
    if (gaze && mapRef.current) {
      mapRef.current.easeTo({ center: [gaze.lng, gaze.lat], zoom: 17, duration: 700 });
    }
  }

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />
      {mapError ? (
        <div role="alert" className="absolute bottom-3 left-3 right-16 z-30 rounded-2xl border border-danger bg-bg px-4 py-4 text-sm leading-relaxed text-paper shadow-xl">
          <strong className="mb-2 block text-base text-danger">Não foi possível carregar o mapa</strong>
          <p className="break-words">{mapError}</p>
          <button type="button" className="mt-3 rounded-xl border border-line px-4 py-2 font-semibold" onClick={() => { setMapError(""); setReady(false); setMapRetry((value) => value + 1); }}>Tentar novamente</button>
        </div>
      ) : null}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
        <IconButton label="Onde estou" pressed={liveStatus === "ativo"} onClick={locate}>
          <LocateFixed className="h-5 w-5" />
        </IconButton>
        <IconButton label={threeD ? "Visão 2D" : "Visão 3D"} pressed={threeD} onClick={() => setThreeD((value) => !value)}>
          <Layers2 className="h-5 w-5" />
        </IconButton>
        <IconButton label="Seguir posição" pressed={follow} onClick={() => useDelivery.getState().setFollow(!useDelivery.getState().follow)}>
          <Crosshair className="h-5 w-5" />
        </IconButton>
        <IconButton label="Enquadrar rota" onClick={() => useDelivery.getState().requestFit()}>
          <Maximize2 className="h-5 w-5" />
        </IconButton>
        <IconButton label="Base aqui" onClick={() => useDelivery.getState().pinBaseHere()}>
          <Home className="h-5 w-5" />
        </IconButton>
      </div>
    </div>
  );
}
