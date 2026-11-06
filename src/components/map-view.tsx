import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Home, LocateFixed, Maximize2, Crosshair, Layers2 } from "lucide-react";
import { IconButton } from "@/components/bits";
import { comPin, corridaAtiva, nextStop, useDelivery } from "@/lib/delivery-store";
import { bearing, type LatLng } from "@/lib/geo";
import { startOfToday } from "@/lib/format";

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
  return L.divIcon({
    className: "circuito-leaflet-marker",
    html: el,
    iconSize: kind === "rider" ? [48, 48] : kind === "base" ? [54, 32] : [42, 42],
    iconAnchor: kind === "base" ? [27, 16] : kind === "rider" ? [24, 24] : [21, 21],
  });
}

export function MapView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const riderRef = useRef<L.Marker | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const previousPosition = useRef<LatLng | null>(null);
  const headingRef = useRef(0);
  const fitted = useRef(-1);
  const draftLocationRef = useRef("");
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapRetry, setMapRetry] = useState(0);
  const [classicMap, setClassicMap] = useState(false);
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
      state.draft?.lat != null && state.draft?.lng != null ? `draft:${state.draft.lat.toFixed(5)},${state.draft.lng.toFixed(5)}` : "",
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
    const state = useDelivery.getState();
    const initial = state.gaze ?? state.base ?? { lat: -26.99, lng: -48.64 };

    const map = L.map(host, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    }).setView([initial.lat, initial.lng], 16.5);

    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      crossOrigin: true,
    }).addTo(map);
    tileLayerRef.current = tiles;

    tiles.once("load", () => {
      if (disposed) return;
      loaded = true;
      window.clearTimeout(loadTimeout);
      setMapError("");
      setReady(true);
    });
    tiles.on("tileerror", (event) => {
      if (disposed) return;
      console.error("[Circuito mapa] Falha ao carregar bloco OSM", event);
      setMapError("Não foi possível carregar os blocos do OpenStreetMap. Confira a conexão e tente novamente.");
    });
    map.on("click", (event) => {
      const current = useDelivery.getState();
      if (current.mapPick) current.dropPin({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    mapRef.current = map;
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(host);
    const initialResize = window.setTimeout(() => map.invalidateSize({ pan: false }), 150);

    return () => {
      disposed = true;
      window.clearTimeout(loadTimeout);
      window.clearTimeout(initialResize);
      resize.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      riderRef.current?.remove();
      routeRef.current?.remove();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      riderRef.current = null;
      routeRef.current = null;
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
      markersRef.current.push(L.marker([state.base.lat, state.base.lng], {
        icon: markerElement("BASE", "base"),
        keyboard: true,
        title: "Base",
      }).addTo(map));
    }

    const visible = state.comandas.filter(comPin).filter((item) => {
      if (item.status === "cancelada") return false;
      if (item.status !== "entregue") return true;
      return (item.deliveredAt ?? 0) >= today || Boolean(run?.ordem.includes(item.id));
    });
    for (const item of visible) {
      const index = run?.ordem.indexOf(item.id) ?? -1;
      const done = item.status === "entregue";
      const icon = markerElement(index >= 0 ? String(index + 1) : "•", done ? "done" : "stop");
      if (upcoming?.id === item.id) {
        const element = icon.options.html as HTMLElement;
        element.classList.add("is-next");
      }
      const marker = L.marker([item.lat, item.lng], {
        icon,
        title: `Comanda ${item.id}`,
      }).addTo(map);
      marker.on("click", () => useDelivery.getState().select(item.id));
      markersRef.current.push(marker);
    }

    const draft = state.draft;
    const draftKey = draft?.lat != null && draft?.lng != null
      ? `${draft.lat.toFixed(5)},${draft.lng.toFixed(5)}`
      : "";
    if (draftKey) {
      const draftMarker = L.marker([draft!.lat!, draft!.lng!], {
        icon: markerElement("NOVO", "stop"),
        title: "Endereço da nova comanda",
        zIndexOffset: 900,
      }).addTo(map);
      markersRef.current.push(draftMarker);
      if (draftKey !== draftLocationRef.current) {
        draftLocationRef.current = draftKey;
        map.flyTo([draft!.lat!, draft!.lng!], 17, { duration: 0.6 });
      }
    } else {
      draftLocationRef.current = "";
    }

    const runPoints = run?.points ?? [];
    const current = state.gaze ?? runPoints[runPoints.length - 1] ?? null;
    const route = state.routeLine.length > 1 ? state.routeLine : [
      ...(current ? [current] : []),
      ...visible.filter((item) => run?.ordem.includes(item.id) && !run.feitas.includes(item.id)),
    ];
    routeRef.current?.remove();
    routeRef.current = route.length > 1
      ? L.polyline(route.map((point) => [point.lat, point.lng] as L.LatLngTuple), {
          color: "#1677ed",
          weight: 6,
          opacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(map)
      : null;

    if (current) {
      const previous = previousPosition.current;
      if (previous && Math.hypot(previous.lat - current.lat, previous.lng - current.lng) > 0.00002) {
        headingRef.current = bearing(previous, current);
      }
      previousPosition.current = current;
      if (!riderRef.current) {
        riderRef.current = L.marker([current.lat, current.lng], {
          icon: markerElement("🏍️", "rider"),
          interactive: false,
          zIndexOffset: 1000,
        }).addTo(map);
      } else {
        riderRef.current.setLatLng([current.lat, current.lng]);
      }
      const riderEl = riderRef.current.getElement()?.querySelector("span");
      riderEl?.setAttribute("style", `transform: rotate(${headingRef.current}deg)`);
    } else {
      riderRef.current?.remove();
      riderRef.current = null;
    }

    if (state.fitToken !== fitted.current) {
      fitted.current = state.fitToken;
      if (current) map.flyTo([current.lat, current.lng], 17.5, { duration: 0.5 });
    } else if (state.follow && current && state.liveStatus === "ativo" && run?.modo === "gps") {
      // Zoom mais próximo para facilitar a leitura das ruas durante a entrega.
      map.flyTo([current.lat, current.lng], Math.max(map.getZoom(), 17.5), { duration: 0.65 });
    }
  }, [ready, tick, tab, classicMap]);

  function locate() {
    const state = useDelivery.getState();
    state.setFollow(true);
    if (state.liveStatus !== "ativo" && state.liveStatus !== "buscando") state.enableLive();
    const gaze = useDelivery.getState().gaze;
    if (gaze && mapRef.current) mapRef.current.flyTo([gaze.lat, gaze.lng], 18, { duration: 0.7 });
  }

  function toggleView() {
    const next = !classicMap;
    setClassicMap(next);
    tileLayerRef.current?.setUrl(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    );
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
        <IconButton label={classicMap ? "Mapa detalhado" : "Mapa clássico"} pressed={classicMap} onClick={toggleView}>
          <Layers2 className="h-5 w-5" />
        </IconButton>
        <IconButton label="Seguir posição" pressed={follow} onClick={() => useDelivery.getState().setFollow(!useDelivery.getState().follow)}>
          <Crosshair className="h-5 w-5" />
        </IconButton>
        <IconButton label="Enquadrar rota" onClick={() => {
          const route = routeRef.current;
          if (route && mapRef.current) mapRef.current.fitBounds(route.getBounds().pad(0.18), { maxZoom: 17 });
          else useDelivery.getState().requestFit();
        }}>
          <Maximize2 className="h-5 w-5" />
        </IconButton>
        <IconButton label="Base aqui" onClick={() => useDelivery.getState().pinBaseHere()}>
          <Home className="h-5 w-5" />
        </IconButton>
      </div>
    </div>
  );
}
