import { useEffect } from "react";
import { comPin, corridaAtiva, useDelivery, type Comanda } from "@/lib/delivery-store";
import { straightKm, type LatLng } from "@/lib/geo";
import { drivingRoute } from "@/lib/routing";

function originKey(point: LatLng | null) {
  if (!point) return "";
  return `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
}

export function RouteEngine() {
  const gaze = useDelivery((state) => state.gaze);
  const base = useDelivery((state) => state.base);
  const previewKey = useDelivery((state) => state.previewIds.join(","));
  const ativaId = useDelivery((state) => state.ativaId);
  const ordemKey = useDelivery((state) => corridaAtiva(state)?.ordem.join(",") ?? "");
  const feitasKey = useDelivery((state) => corridaAtiva(state)?.feitas.join(",") ?? "");
  const pinsKey = useDelivery((state) =>
    state.comandas
      .map((item) => `${item.id}:${item.lat ?? "s"}:${item.lng ?? "s"}:${item.status}`)
      .join("|"),
  );
  const here = originKey(ativaId ? (gaze ?? base) : base);

  useEffect(() => {
    const state = useDelivery.getState();
    const run = corridaAtiva(state);
    const home = state.base;
    const origin = run ? (state.gaze ?? home) : (home ?? state.gaze);
    const feitas = new Set(run?.feitas ?? []);
    const ids = run ? run.ordem.filter((id) => !feitas.has(id)) : state.previewIds;
    const stops = ids
      .map((id) => state.comandas.find((item) => item.id === id))
      .filter((item): item is Comanda & { lat: number; lng: number } => Boolean(item && comPin(item)));

    if (!origin || !home || (!run && stops.length === 0)) {
      const current = useDelivery.getState();
      if (current.routeLine.length || current.routeKm != null || current.routeCue) {
        current.setRoute({ line: [], km: null, kind: null, cue: null });
      }
      return;
    }

    const waypoints = [origin, ...stops, home];
    let cancel = false;
    const timer = window.setTimeout(() => {
      void drivingRoute(waypoints).then((routed) => {
        if (cancel) return;
        if (routed) {
          useDelivery.getState().setRoute({ line: routed.points, km: routed.km, kind: "rua", cue: routed.cue });
          return;
        }
        useDelivery.getState().setRoute({
          line: waypoints,
          km: straightKm(origin, [...stops, home]),
          kind: "reta",
          cue: null,
        });
      });
    }, 280);

    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [here, previewKey, ativaId, ordemKey, feitasKey, pinsKey]);

  return null;
}
