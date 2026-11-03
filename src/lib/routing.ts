import type { LatLng } from "@/lib/geo";

export type RouteCue = {
  meters: number;
  text: string;
  modifier: string;
};

export type DrivingRoute = {
  points: LatLng[];
  km: number;
  cue: RouteCue | null;
};

type OsrmStep = {
  distance?: number;
  name?: string;
  maneuver?: { type?: string; modifier?: string };
};

const turnWord: Record<string, string> = {
  left: "à esquerda",
  right: "à direita",
  "slight left": "levemente à esquerda",
  "slight right": "levemente à direita",
  "sharp left": "fechado à esquerda",
  "sharp right": "fechado à direita",
  straight: "em frente",
  uturn: "em retorno",
};

function instruction(step: OsrmStep) {
  const type = step.maneuver?.type ?? "";
  const modifier = step.maneuver?.modifier ?? "";
  const dir = turnWord[modifier] ?? "";
  const street = step.name?.trim();
  if (type === "arrive") return street ? `Chegou em ${street}` : "Chegou ao destino";
  if (type === "roundabout" || type === "rotary") return street ? `Rotatória para ${street}` : "Na rotatória";
  if (type === "merge") return street ? `Entre na ${street}` : "Entre na via";
  if (type === "fork" || type === "end of road") return dir ? `Pegue ${dir}` : "Na bifurcação";
  if (modifier === "uturn") return "Faça o retorno";
  if (type === "new name" || type === "continue" || modifier === "straight" || !modifier) {
    return street ? `Siga na ${street}` : "Siga em frente";
  }
  return street ? `Vire ${dir} na ${street}` : `Vire ${dir}`;
}

function cueFromSteps(steps: OsrmStep[]): RouteCue | null {
  if (!steps.length) return null;
  const upcoming = steps.find((step, index) => index > 0 && step.maneuver?.type !== "depart") ?? steps[0];
  const meters = steps[0]?.distance ?? upcoming.distance ?? 0;
  return {
    meters,
    text: instruction(upcoming),
    modifier: upcoming.maneuver?.modifier || (upcoming.maneuver?.type === "arrive" ? "arrive" : "straight"),
  };
}

/** Road path through the stops. Null when the router is unavailable. */
export async function drivingRoute(stops: LatLng[]): Promise<DrivingRoute | null> {
  if (stops.length < 2) return null;
  const path = stops.map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      code?: string;
      routes?: {
        distance?: number;
        geometry?: { coordinates?: [number, number][] };
        legs?: { steps?: OsrmStep[] }[];
      }[];
    };
    if (data.code !== "Ok") return null;
    const route = data.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (!route || typeof route.distance !== "number" || !coords || coords.length < 2) return null;
    const steps = (route.legs ?? []).flatMap((leg) => leg.steps ?? []);
    return {
      km: route.distance / 1000,
      points: coords.map(([lng, lat]) => ({ lat, lng })),
      cue: cueFromSteps(steps),
    };
  } catch {
    return null;
  }
}
