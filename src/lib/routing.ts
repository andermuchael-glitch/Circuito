import type { LatLng } from "@/lib/geo";

export type RouteCue = {
  meters: number;
  text: string;
  modifier: string;
};

export type DrivingRoute = {
  points: LatLng[];
  km: number;
  durationSeconds: number;
  cue: RouteCue | null;
};

type TomTomInstruction = {
  instruction?: string;
  message?: string;
  maneuver?: string;
  routeOffsetInMeters?: number;
  travelTimeInSeconds?: number;
};

type TomTomRouteResponse = {
  routes?: Array<{
    summary?: { lengthInMeters?: number; travelTimeInSeconds?: number };
    legs?: Array<{
      points?: Array<{ latitude?: number; longitude?: number }>;
      guidance?: { instructions?: TomTomInstruction[] };
    }>;
    guidance?: { instructions?: TomTomInstruction[] };
  }>;
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

function tomtomCue(instructions: TomTomInstruction[]): RouteCue | null {
  if (!instructions.length) return null;
  const next = instructions.find((item) => {
    const text = (item.instruction ?? item.message ?? "").trim();
    return text.length > 0 && !/sair da origem|comece a dirigir|depart/i.test(text);
  }) ?? instructions[0];
  const text = (next.instruction ?? next.message ?? "").trim();
  if (!text) return null;
  return {
    meters: Number.isFinite(next.routeOffsetInMeters) ? Math.max(0, next.routeOffsetInMeters ?? 0) : 0,
    text,
    modifier: (next.maneuver ?? "straight").toLowerCase(),
  };
}

function validPoints(points: Array<{ latitude?: number; longitude?: number }>): LatLng[] {
  return points.flatMap((point) => {
    const lat = point.latitude;
    const lng = point.longitude;
    if (typeof lat !== "number" || typeof lng !== "number" ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    return [{ lat, lng }];
  });
}

async function tomtomDrivingRoute(stops: LatLng[]): Promise<DrivingRoute | null> {
  const key = import.meta.env.VITE_TOMTOM_API_KEY as string | undefined;
  if (!key) return null;
  const locations = stops.map((point) => `${point.lat},${point.lng}`).join(":");
  const params = new URLSearchParams({
    key,
    instructionsType: "text",
    language: "pt-BR",
    routeType: "fastest",
    traffic: "false",
    travelMode: "motorcycle",
  });
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?${params.toString()}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json() as TomTomRouteResponse;
    const route = data.routes?.[0];
    if (!route) return null;
    const legs = Array.isArray(route.legs) ? route.legs : [];
    const points = legs.flatMap((leg) => validPoints(leg.points ?? []));
    const meters = route.summary?.lengthInMeters;
    if (points.length < 2 || typeof meters !== "number" || !Number.isFinite(meters)) return null;
    const instructions = [
      ...(route.guidance?.instructions ?? []),
      ...legs.flatMap((leg) => leg.guidance?.instructions ?? []),
    ];
    return {
      points,
      km: meters / 1000,
      durationSeconds: Number.isFinite(route.summary?.travelTimeInSeconds)
        ? Math.max(0, route.summary?.travelTimeInSeconds ?? 0) : 0,
      cue: tomtomCue(instructions),
    };
  } catch {
    return null;
  }
}

function instruction(step: OsrmStep) {
  const type = step.maneuver?.type ?? "";
  const modifier = step.maneuver?.modifier ?? "";
  const dir = turnWord[modifier] ?? "";
  const street = step.name?.trim();
  if (type === "arrive") return street ? `Chegou em ${street}` : "Chegou ao destino";
  if (type === "roundabout" || type === "rotary") return street ? `Na rotatória, siga as placas para ${street}` : "Entre na rotatória e siga as placas";
  if (type === "merge") return street ? `Acesse a via e continue pela ${street}` : "Acesse a via";
  if (type === "fork" || type === "end of road") return street ? `Na bifurcação, pegue ${dir || "a saída"} para ${street}` : dir ? `Na bifurcação, pegue ${dir}` : "Na bifurcação, escolha a saída indicada";
  if (modifier === "uturn") return "Faça o retorno";
  if (type === "new name" || type === "continue" || modifier === "straight" || !modifier) {
    return street ? `Continue em frente pela ${street}` : "Continue em frente";
  }
  return street ? `Vire ${dir} e entre na ${street}` : `Vire ${dir}`;
}

function cueFromSteps(steps: OsrmStep[]): RouteCue | null {
  const validSteps = steps.filter((step): step is OsrmStep => Boolean(step && typeof step === "object"));
  if (!validSteps.length) return null;
  const upcoming = validSteps.find((step, index) => index > 0 && step.maneuver?.type !== "depart") ?? validSteps[0];
  const meters = validSteps[0]?.distance ?? upcoming.distance ?? 0;
  return {
    meters: Number.isFinite(meters) ? Math.max(0, meters) : 0,
    text: instruction(upcoming),
    modifier: upcoming.maneuver?.modifier || (upcoming.maneuver?.type === "arrive" ? "arrive" : "straight"),
  };
}

/** TomTom is the primary road router; OSRM is retained as a fallback. */
export async function drivingRoute(stops: LatLng[]): Promise<DrivingRoute | null> {
  if (stops.length < 2) return null;
  const tomtomRoute = await tomtomDrivingRoute(stops);
  if (tomtomRoute) return tomtomRoute;

  const path = stops.map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      code?: string;
      routes?: {
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: [number, number][] };
        legs?: { steps?: OsrmStep[] }[];
      }[];
    };
    if (data.code !== "Ok") return null;
    const route = data.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (!route || typeof route.distance !== "number" || !Array.isArray(coords)) return null;
    const points = coords
      .filter((coordinate): coordinate is [number, number] =>
        Array.isArray(coordinate) && coordinate.length >= 2 &&
        Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]) &&
        Math.abs(coordinate[0]) <= 180 && Math.abs(coordinate[1]) <= 90)
      .map(([lng, lat]) => ({ lat, lng }));
    if (points.length < 2) return null;
    const legs = Array.isArray(route.legs) ? route.legs : [];
    const steps = legs.flatMap((leg) => Array.isArray(leg?.steps) ? leg.steps : []);
    return {
      km: route.distance / 1000,
      durationSeconds: Number.isFinite(route.duration) ? Math.max(0, route.duration ?? 0) : 0,
      points,
      cue: cueFromSteps(steps),
    };
  } catch {
    return null;
  }
}
