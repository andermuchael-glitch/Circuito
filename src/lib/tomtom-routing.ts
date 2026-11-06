import type { LatLng } from "@/lib/geo";

type TomTomRouteResponse = {
  routes?: Array<{
    summary?: { lengthInMeters?: number };
    legs?: Array<{ points?: Array<{ latitude: number; longitude: number }> }>;
  }>;
};

export type RoadRoute = { line: LatLng[]; km: number };

const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY as string | undefined;

/** Calculates a road route with TomTom. Returns null when unavailable. */
export async function calculateTomTomRoute(
  stops: LatLng[],
  signal?: AbortSignal,
): Promise<RoadRoute | null> {
  if (!TOMTOM_KEY || stops.length < 2) return null;

  const locations = stops.map(({ lat, lng }) => `${lat},${lng}`).join(":");
  const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${locations}/json`);
  url.searchParams.set("key", TOMTOM_KEY);
  url.searchParams.set("traffic", "true");
  url.searchParams.set("routeType", "fastest");
  url.searchParams.set("travelMode", "motorcycle");
  url.searchParams.set("instructions", "false");

  const response = await fetch(url, { signal });
  if (!response.ok) {
    // Some regions/accounts do not expose motorcycle routing; retry with car routing.
    if (response.status === 400 || response.status === 422) {
      url.searchParams.set("travelMode", "car");
      const fallback = await fetch(url, { signal });
      if (!fallback.ok) return null;
      return parseRoute(await fallback.json() as TomTomRouteResponse);
    }
    return null;
  }
  return parseRoute(await response.json() as TomTomRouteResponse);
}

function parseRoute(data: TomTomRouteResponse): RoadRoute | null {
  const route = data.routes?.[0];
  if (!route) return null;
  const line = (route.legs ?? []).flatMap((leg) =>
    (leg.points ?? []).map((point) => ({ lat: point.latitude, lng: point.longitude })),
  );
  const meters = route.summary?.lengthInMeters;
  if (line.length < 2 || typeof meters !== "number" || !Number.isFinite(meters)) return null;
  return { line, km: meters / 1000 };
}
