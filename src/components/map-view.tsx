import { useEffect, useRef, useState } from "react";
import {
  LngLatBounds,
  Map as MlMap,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Crosshair, LocateFixed, Maximize2 } from "lucide-react";
import { IconButton } from "@/components/bits";
import { comPin, corridaAtiva, nextStop, partida, useDelivery, type Comanda } from "@/lib/delivery-store";
import { bearing, haversine, type LatLng } from "@/lib/geo";
import { startOfToday } from "@/lib/format";

setWorkerUrl(workerUrl);

const emptyLine = {
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: [] as [number, number][] },
};

function lineData(points: LatLng[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: points.map((point) => [point.lng, point.lat] as [number, number]),
    },
  };
}

function accuracyRing(center: LatLng, radiusM: number) {
  const earth = 6378137;
  const coordinates: [number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const lat = center.lat + ((radiusM * Math.sin(angle)) / earth) * (180 / Math.PI);
    const lng =
      center.lng +
      ((radiusM * Math.cos(angle)) / (earth * Math.cos((center.lat * Math.PI) / 180))) * (180 / Math.PI);
    coordinates.push([lng, lat]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [coordinates] },
  };
}

function pinElement(className: string, label: string) {
  const el = document.createElement("div");
  el.className = `pin ${className}`;
  el.textContent = label;
  return el;
}

export function MapView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const riderRef = useRef<Marker | null>(null);
  const pinsRef = useRef<Marker[]>([]);
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
    const host = hostRef.current;
    if (!host) return;
    const here = useDelivery.getState().gaze ?? useDelivery.getState().base;
    const map = new MlMap({
      container: host,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: here ? [here.lng, here.lat] : [-47.9, -15.8],
      zoom: here ? 16 : 4,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(host);
    map.on("load", () => {
      map.addSource("crumb", { type: "geojson", data: emptyLine });
      map.addSource("plan", { type: "geojson", data: emptyLine });
      map.addSource("accuracy", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "accuracy",
        type: "fill",
        source: "accuracy",
        paint: { "fill-color": "#1a73e8", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "accuracy-line",
        type: "line",
        source: "accuracy",
        paint: { "line-color": "#1a73e8", "line-width": 1, "line-opacity": 0.7 },
      });
      map.addLayer({
        id: "crumb",
        type: "line",
        source: "crumb",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#8d97a5", "line-width": 6, "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "plan",
        type: "line",
        source: "plan",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1a73e8", "line-width": 7, "line-opacity": 0.95 },
      });
      setReady(true);
    });
    map.on("click", (event: MapMouseEvent) => {
      const store = useDelivery.getState();
      if (!store.mapPick) return;
      store.dropPin({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });
    const timer = window.setTimeout(() => map.resize(), 80);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      pinsRef.current.forEach((marker) => marker.remove());
      pinsRef.current = [];
      riderRef.current?.remove();
      riderRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    const crumb = map.getSource("crumb") as GeoJSONSource | undefined;
    const plan = map.getSource("plan") as GeoJSONSource | undefined;
    const accuracy = map.getSource("accuracy") as GeoJSONSource | undefined;
    if (!crumb || !plan || !accuracy) return;

    const state = useDelivery.getState();
    const run = corridaAtiva(state);
    const upcoming = nextStop(run, state.comandas);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    pinsRef.current.forEach((marker) => marker.remove());
    pinsRef.current = [];
    if (state.base) {
      pinsRef.current.push(
        new Marker({ element: pinElement("pin-base", "BASE") })
          .setLngLat([state.base.lng, state.base.lat])
          .addTo(map),
      );
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
      const marker = new Marker({
        element: pinElement(cls, order >= 0 ? String(order + 1) : ""),
      })
        .setLngLat([comanda.lng, comanda.lat])
        .addTo(map);
      marker.getElement().addEventListener("click", (event: MouseEvent) => {
        event.stopPropagation();
        if (useDelivery.getState().mapPick) return;
        useDelivery.getState().select(comanda.id);
        useDelivery.getState().setTab("mapa");
      });
      pinsRef.current.push(marker);
    }

    const points = run?.points ?? [];
    crumb.setData(lineData(points));

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
      plan.setData(lineData(routed));
    } else {
      const planPts: LatLng[] = [];
      if (last && pending.length) planPts.push(last);
      else if (!last && pending.length) planPts.push(origin);
      planPts.push(...pending);
      plan.setData(lineData(planPts));
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
      const chevron = document.createElement("div");
      chevron.className = `car-chevron${liveDot ? " rider-pulse" : ""}`;
      chevron.style.transform = `rotate(${heading}deg)`;
      if (!riderRef.current) {
        const wrap = document.createElement("div");
        wrap.appendChild(chevron);
        riderRef.current = new Marker({ element: wrap }).setLngLat([riderAt.lng, riderAt.lat]).addTo(map);
      } else {
        riderRef.current.setLngLat([riderAt.lng, riderAt.lat]);
        const inner = riderRef.current.getElement().firstElementChild;
        if (inner instanceof HTMLElement) {
          inner.className = chevron.className;
          inner.style.transform = chevron.style.transform;
        }
      }
    } else if (riderRef.current) {
      riderRef.current.remove();
      riderRef.current = null;
    }

    const showAcc = state.liveStatus === "ativo" && state.gaze && !simulating && state.gpsMeta.accuracy != null;
    accuracy.setData(
      showAcc && state.gaze
        ? accuracyRing(state.gaze, Math.max(8, state.gpsMeta.accuracy ?? 8))
        : { type: "FeatureCollection", features: [] },
    );

    const host = hostRef.current;
    const onScreen = !!host && host.clientWidth > 20 && host.clientHeight > 20;
    const spots: [number, number][] = [];
    if (state.gaze) spots.push([state.gaze.lng, state.gaze.lat]);
    else if (state.base) spots.push([state.base.lng, state.base.lat]);
    for (const comanda of visible) spots.push([comanda.lng, comanda.lat]);
    const step = Math.max(1, Math.ceil(state.routeLine.length / 80));
    for (let i = 0; i < state.routeLine.length; i += step) {
      const point = state.routeLine[i];
      spots.push([point.lng, point.lat]);
    }

    if (!onScreen) return;

    const fitRoute = () => {
      fitted.current = state.fitToken;
      if (spots.length >= 2) {
        const bounds = spots.reduce(
          (box, point) => box.extend(point),
          new LngLatBounds(spots[0], spots[0]),
        );
        map.fitBounds(bounds, {
          padding: { top: 130, bottom: 170, left: 28, right: 28 },
          animate: !reduced,
          duration: reduced ? 0 : 600,
        });
      } else if (spots.length === 1) {
        map.easeTo({ center: spots[0], zoom: 16, duration: reduced ? 0 : 600 });
      }
    };

    if (state.fitToken !== fitted.current && fitted.current !== -1) {
      fitRoute();
    } else if (state.follow && state.gaze && state.liveStatus === "ativo" && !simulating && !homed.current) {
      homed.current = true;
      fitted.current = state.fitToken;
      map.flyTo({ center: [state.gaze.lng, state.gaze.lat], zoom: 16, duration: reduced ? 0 : 800 });
    } else if (state.fitToken !== fitted.current) {
      fitRoute();
    } else if (state.follow && riderAt && host) {
      map.easeTo({
        center: [riderAt.lng, riderAt.lat],
        zoom: Math.max(map.getZoom(), 17),
        offset: [0, Math.round(host.clientHeight * 0.18)],
        duration: reduced ? 0 : 350,
      });
    }
  }, [ready, tick, tab]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => map.resize(), 80);
    return () => window.clearTimeout(id);
  }, [ready, tab]);

  const liveStatus = useDelivery((state) => state.liveStatus);

  function locate() {
    const state = useDelivery.getState();
    state.setFollow(true);
    if (state.liveStatus !== "ativo" && state.liveStatus !== "buscando") state.enableLive();
    else if (!state.live) state.enableLive();
    const gaze = useDelivery.getState().gaze;
    if (gaze && mapRef.current) mapRef.current.flyTo({ center: [gaze.lng, gaze.lat], zoom: 16 });
  }

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="absolute top-28 right-3 z-10 flex flex-col gap-2">
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
