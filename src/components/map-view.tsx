import { useEffect, useRef, useState } from "react";
import { Crosshair, LocateFixed, Maximize2 } from "lucide-react";
import { IconButton } from "@/components/bits";
import { comPin, corridaAtiva, nextStop, partida, useDelivery, type Comanda } from "@/lib/delivery-store";
import { bearing, haversine, type LatLng } from "@/lib/geo";
import { startOfToday } from "@/lib/format";

type LeafletNS = typeof import("leaflet");

function resolveLeaflet(mod: LeafletNS & { default?: LeafletNS }) {
  if (mod.default && typeof mod.default.map === "function") return mod.default;
  return mod;
}

function cssColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function MapView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<LeafletNS | null>(null);
  const crumbRef = useRef<import("leaflet").Polyline | null>(null);
  const planRef = useRef<import("leaflet").Polyline | null>(null);
  const riderRef = useRef<import("leaflet").Marker | null>(null);
  const pinsRef = useRef<import("leaflet").LayerGroup | null>(null);
  const accRef = useRef<import("leaflet").Circle | null>(null);
  const signalRef = useRef("#ffb020");
  const prevGaze = useRef<LatLng | null>(null);
  const headingRef = useRef(0);
  const homed = useRef(false);
  const fitted = useRef(-1);
  const follow = useDelivery((state) => state.follow);
  const tab = useDelivery((state) => state.tab);
  const [ready, setReady] = useState(false);

  const tick = useDelivery((state) => {
    const run = corridaAtiva(state);
    const statuses = state.comandas
      .map((item) => `${item.id}:${item.status}:${item.lat ?? "s"}`)
      .join("|");
    return [
      statuses,
      state.selectedId ?? "",
      state.gaze ? `${state.gaze.lat.toFixed(5)},${state.gaze.lng.toFixed(5)}` : "",
      state.liveStatus,
      state.gpsMeta.accuracy == null ? "" : String(Math.round(state.gpsMeta.accuracy)),
      state.base ? `${state.base.lat.toFixed(4)},${state.base.lng.toFixed(4)}` : "",
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
    let dead = false;
    let observer: ResizeObserver | null = null;
    const host = hostRef.current;
    if (!host) return;

    void (async () => {
      const mod = (await import("leaflet")) as LeafletNS & { default?: LeafletNS };
      if (dead || !hostRef.current) return;
      const L = resolveLeaflet(mod);
      leafletRef.current = L;
      const here = useDelivery.getState().gaze ?? useDelivery.getState().base;
      const map = L.map(hostRef.current, { zoomControl: false, attributionControl: true }).setView(
        here ? [here.lat, here.lng] : [-15.8, -47.9],
        here ? 15 : 4,
      );
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Ruas &copy; Esri, OpenStreetMap",
          maxZoom: 19,
        },
      ).addTo(map);
      const signal = cssColor("--color-signal", "#ffb020");
      signalRef.current = signal;
      crumbRef.current = L.polyline([], { color: signal, weight: 5, opacity: 0.95 }).addTo(map);
      planRef.current = L.polyline([], {
        color: signal,
        weight: 4,
        opacity: 0.9,
        dashArray: "8 8",
      }).addTo(map);
      pinsRef.current = L.layerGroup().addTo(map);
      map.on("click", (event) => {
        const store = useDelivery.getState();
        if (!store.mapPick) return;
        store.dropPin({ lat: event.latlng.lat, lng: event.latlng.lng });
      });
      if (dead) {
        map.remove();
        return;
      }
      mapRef.current = map;
      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(hostRef.current);
      setReady(true);
      window.setTimeout(() => map.invalidateSize(), 80);
    })();

    return () => {
      dead = true;
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      crumbRef.current = null;
      planRef.current = null;
      riderRef.current = null;
      pinsRef.current = null;
      accRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const L = leafletRef.current;
    const pins = pinsRef.current;
    const crumb = crumbRef.current;
    const plan = planRef.current;
    if (!map || !L || !pins || !crumb || !plan) return;

    const state = useDelivery.getState();
    const run = corridaAtiva(state);
    const upcoming = nextStop(run, state.comandas);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    pins.clearLayers();
    if (state.base) {
      const baseIcon = L.divIcon({
        className: "pin-wrap",
        html: `<div class="pin pin-base">BASE</div>`,
        iconSize: [36, 28],
        iconAnchor: [18, 14],
      });
      L.marker([state.base.lat, state.base.lng], { icon: baseIcon, zIndexOffset: 100 }).addTo(pins);
    }

    const today = startOfToday();
    const visible = state.comandas.filter(comPin).filter((item) => {
      if (item.status === "cancelada") return false;
      if (item.status !== "entregue") return true;
      return (item.deliveredAt ?? 0) >= today || Boolean(run?.ordem.includes(item.id));
    });
    for (const comanda of visible) {
      const order = run?.ordem.indexOf(comanda.id) ?? -1;
      const isNext = upcoming?.id === comanda.id;
      const cls = isNext
        ? "pin-next"
        : comanda.status === "entregue"
          ? "pin-done"
          : comanda.status === "rota"
            ? "pin-route"
            : "pin-open";
      const label = order >= 0 ? String(order + 1) : "";
      const icon = L.divIcon({
        className: "pin-wrap",
        html: `<div class="pin ${cls}">${label}</div>`,
        iconSize: isNext ? [34, 34] : [28, 28],
        iconAnchor: isNext ? [17, 17] : [14, 14],
      });
      const marker = L.marker([comanda.lat, comanda.lng], { icon, zIndexOffset: isNext ? 400 : 200 });
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        if (useDelivery.getState().mapPick) return;
        useDelivery.getState().select(comanda.id);
        useDelivery.getState().setTab("mapa");
      });
      marker.addTo(pins);
    }

    const points = run?.points ?? [];
    crumb.setLatLngs(points.map((point) => [point.lat, point.lng]));

    const feitas = new Set(run?.feitas ?? []);
    const pending: Array<Comanda & { lat: number; lng: number }> = [];
    if (run) {
      for (const id of run.ordem) {
        if (feitas.has(id)) continue;
        const comanda = state.comandas.find((item) => item.id === id);
        if (comanda && comPin(comanda)) pending.push(comanda);
      }
    }
    const origin = state.gaze ?? partida(state);
    const last = points[points.length - 1];
    const routed = state.routeLine;
    if (routed.length >= 2) {
      plan.setLatLngs(routed.map((point) => [point.lat, point.lng]));
    } else {
      const planPts: [number, number][] = [];
      if (last && pending.length) planPts.push([last.lat, last.lng]);
      else if (!last && pending.length) planPts.push([origin.lat, origin.lng]);
      for (const stop of pending) planPts.push([stop.lat, stop.lng]);
      plan.setLatLngs(planPts);
    }

    const simulating = run?.modo === "simulacao";
    let riderAt: LatLng | null = simulating && last ? last : (state.gaze ?? last ?? null);
    let heading = headingRef.current;
    if (simulating && last && points.length > 1) {
      heading = bearing(points[points.length - 2], last);
      headingRef.current = heading;
    } else if (state.gaze) {
      const prev = prevGaze.current;
      if (prev && haversine(prev, state.gaze) > 0.004) {
        heading = bearing(prev, state.gaze);
        headingRef.current = heading;
      }
      prevGaze.current = state.gaze;
    } else if (last && points.length > 1) {
      heading = bearing(points[points.length - 2], last);
      headingRef.current = heading;
    }

    if (riderAt) {
      const liveDot = state.liveStatus === "ativo" && !simulating;
      const icon = L.divIcon({
        className: "pin-wrap",
        html: `<div class="rider${liveDot ? " rider-pulse" : ""}" style="transform: rotate(${heading}deg)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      if (!riderRef.current) {
        riderRef.current = L.marker([riderAt.lat, riderAt.lng], { icon, zIndexOffset: 800 }).addTo(map);
      } else {
        riderRef.current.setLatLng([riderAt.lat, riderAt.lng]);
        riderRef.current.setIcon(icon);
      }
    } else if (riderRef.current) {
      riderRef.current.remove();
      riderRef.current = null;
    }

    const showAcc = state.liveStatus === "ativo" && state.gaze && !simulating && state.gpsMeta.accuracy != null;
    if (showAcc && state.gaze) {
      const radius = Math.max(8, state.gpsMeta.accuracy ?? 8);
      if (!accRef.current) {
        accRef.current = L.circle([state.gaze.lat, state.gaze.lng], {
          radius,
          color: signalRef.current,
          weight: 1,
          opacity: 0.7,
          fillColor: signalRef.current,
          fillOpacity: 0.12,
        }).addTo(map);
      } else {
        accRef.current.setLatLng([state.gaze.lat, state.gaze.lng]);
        accRef.current.setRadius(radius);
      }
    } else if (accRef.current) {
      accRef.current.remove();
      accRef.current = null;
    }

    const host = hostRef.current;
    const onScreen = !!host && host.clientWidth > 20 && host.clientHeight > 20;
    const spots: [number, number][] = [];
    if (state.gaze) spots.push([state.gaze.lat, state.gaze.lng]);
    else if (state.base) spots.push([state.base.lat, state.base.lng]);
    for (const comanda of visible) spots.push([comanda.lat, comanda.lng]);
    const step = Math.max(1, Math.ceil(state.routeLine.length / 80));
    for (let i = 0; i < state.routeLine.length; i += step) {
      const point = state.routeLine[i];
      spots.push([point.lat, point.lng]);
    }

    if (!onScreen) return;

    const fitRoute = () => {
      fitted.current = state.fitToken;
      if (spots.length >= 2) {
        map.fitBounds(L.latLngBounds(spots).pad(0.22), { animate: !reduced });
      } else if (spots.length === 1) {
        map.setView(spots[0], 16);
      }
    };

    if (state.fitToken !== fitted.current && fitted.current !== -1) {
      fitRoute();
    } else if (state.follow && state.gaze && state.liveStatus === "ativo" && !simulating && !homed.current) {
      homed.current = true;
      fitted.current = state.fitToken;
      map.flyTo([state.gaze.lat, state.gaze.lng], 16, { animate: !reduced });
    } else if (state.fitToken !== fitted.current) {
      fitRoute();
    } else if (state.follow && riderAt) {
      map.panTo([riderAt.lat, riderAt.lng], { animate: !reduced });
    }
  }, [ready, tick, tab]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(id);
  }, [ready, tab]);

  const liveStatus = useDelivery((state) => state.liveStatus);

  function locate() {
    const state = useDelivery.getState();
    state.setFollow(true);
    if (state.liveStatus !== "ativo" && state.liveStatus !== "buscando") state.enableLive();
    else if (!state.live) state.enableLive();
    const gaze = useDelivery.getState().gaze;
    if (gaze && mapRef.current) mapRef.current.flyTo([gaze.lat, gaze.lng], 16);
  }

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        <IconButton label="Onde estou" pressed={liveStatus === "ativo"} onClick={locate}>
          <LocateFixed className="h-5 w-5" />
        </IconButton>
        <IconButton
          label="Seguir rastro"
          pressed={follow}
          onClick={() => useDelivery.getState().setFollow(!useDelivery.getState().follow)}
        >
          <Crosshair className="h-5 w-5" />
        </IconButton>
        <IconButton label="Enquadrar rota" onClick={() => useDelivery.getState().requestFit()}>
          <Maximize2 className="h-5 w-5" />
        </IconButton>
      </div>
    </div>
  );
}
