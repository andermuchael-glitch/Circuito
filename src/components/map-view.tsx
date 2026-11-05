import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, type GeoJSONSource } from "maplibre-gl";
import { Home, LocateFixed, Maximize2, Crosshair, Layers2 } from "lucide-react";
import { IconButton } from "@/components/bits";
import { comPin, corridaAtiva, nextStop, partida, useDelivery } from "@/lib/delivery-store";
import { bearing, type LatLng } from "@/lib/geo";
import { startOfToday } from "@/lib/format";
import "maplibre-gl/dist/maplibre-gl.css";

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
  el.textContent = label;
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
    const initial = useDelivery.getState().gaze ?? useDelivery.getState().base ?? { lat: -26.99, lng: -48.64 };
    const map = new MapLibreMap({
      container: host,
      style: "https://tiles.openfreemap.org/styles/bright",
      center: [initial.lng, initial.lat],
      zoom: 15,
      pitch: 0,
      attributionControl: true,
      maxPitch: 60,
    });
    map.on("load", () => {
      if (disposed) return;
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
      resize.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      riderRef.current?.remove();
      map.remove();
      mapRef.current = null;
      riderRef.current = null;
      markersRef.current = [];
      setReady(false);
    };
  }, []);

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
