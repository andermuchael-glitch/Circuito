import type { LatLng } from "@/lib/geo";

export type DrivingRoute = {
  points: LatLng[];
  km: number;
};

/** Road path through the stops. Null when the router is unavailable. */
export async function drivingRoute(stops: LatLng[]): Promise<DrivingRoute | null> {
  if (stops.length < 2) return null;
  const path = stops.map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      code?: string;
      routes?: { distance?: number; geometry?: { coordinates?: [number, number][] } }[];
    };
    if (data.code !== "Ok") return null;
    const route = data.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (!route || typeof route.distance !== "number" || !coords || coords.length < 2) return null;
    return {
      km: route.distance / 1000,
      points: coords.map(([lng, lat]) => ({ lat, lng })),
    };
  } catch {
    return null;
  }
}
