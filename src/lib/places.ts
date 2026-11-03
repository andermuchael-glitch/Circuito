import { haversine, type LatLng } from "@/lib/geo";

export type Place = {
  id: string;
  endereco: string;
  bairro: string;
  lat: number;
  lng: number;
};

export const BASE: Place = {
  id: "base",
  endereco: "Rua dos Pinheiros, 498",
  bairro: "Pinheiros",
  lat: -23.5672,
  lng: -46.6915,
};

export const PLACES: Place[] = [
  { id: "harmonia", endereco: "Rua Harmonia, 142", bairro: "Vila Madalena", lat: -23.5546, lng: -46.6904 },
  { id: "aspicuelta", endereco: "Rua Aspicuelta, 277", bairro: "Vila Madalena", lat: -23.5558, lng: -46.689 },
  { id: "augusta", endereco: "Rua Augusta, 1122", bairro: "Consolação", lat: -23.5554, lng: -46.6608 },
  { id: "faria", endereco: "Av. Brigadeiro Faria Lima, 1730", bairro: "Itaim Bibi", lat: -23.5768, lng: -46.6886 },
  { id: "oscar", endereco: "Rua Oscar Freire, 200", bairro: "Jardins", lat: -23.5619, lng: -46.6718 },
  { id: "paulista", endereco: "Av. Paulista, 1000", bairro: "Bela Vista", lat: -23.5648, lng: -46.6528 },
  { id: "haddock", endereco: "Rua Haddock Lobo, 595", bairro: "Cerqueira César", lat: -23.5586, lng: -46.6644 },
  { id: "consolacao", endereco: "Rua da Consolação, 2400", bairro: "Consolação", lat: -23.5559, lng: -46.6662 },
  { id: "teodoro", endereco: "Rua Teodoro Sampaio, 1800", bairro: "Pinheiros", lat: -23.5612, lng: -46.6845 },
  { id: "cardeal", endereco: "Av. Cardeal Arcoverde, 900", bairro: "Pinheiros", lat: -23.5624, lng: -46.6948 },
  { id: "sumare", endereco: "Av. Sumaré, 450", bairro: "Perdizes", lat: -23.5436, lng: -46.6755 },
  { id: "pompeia", endereco: "Rua Tucuna, 110", bairro: "Pompeia", lat: -23.5288, lng: -46.6818 },
  { id: "vilaolimpia", endereco: "Rua Gomes de Carvalho, 1100", bairro: "Vila Olímpia", lat: -23.5954, lng: -46.6858 },
  { id: "moema", endereco: "Av. Ibirapuera, 3100", bairro: "Moema", lat: -23.6032, lng: -46.6638 },
  { id: "brooklin", endereco: "Av. Eng. Luís Carlos Berrini, 500", bairro: "Brooklin", lat: -23.6102, lng: -46.6952 },
  { id: "butanta", endereco: "Av. Vital Brasil, 1200", bairro: "Butantã", lat: -23.5688, lng: -46.7195 },
  { id: "perdizes", endereco: "Rua Cardoso de Almeida, 800", bairro: "Perdizes", lat: -23.5368, lng: -46.6668 },
  { id: "liberdade", endereco: "Rua Galvão Bueno, 300", bairro: "Liberdade", lat: -23.5602, lng: -46.6342 },
  { id: "republica", endereco: "Praça da República, 100", bairro: "República", lat: -23.5438, lng: -46.6426 },
  { id: "itaim", endereco: "Rua Joaquim Floriano, 466", bairro: "Itaim Bibi", lat: -23.5846, lng: -46.6754 },
  { id: "alto", endereco: "Rua Aureliano Guimarães, 150", bairro: "Alto de Pinheiros", lat: -23.5478, lng: -46.7112 },
  { id: "santa", endereco: "Rua Barão de Tatuí, 80", bairro: "Santa Cecília", lat: -23.5386, lng: -46.6548 },
  { id: "bela", endereco: "Rua Treze de Maio, 800", bairro: "Bela Vista", lat: -23.5686, lng: -46.6448 },
];

export function place(id: string) {
  const found = PLACES.find((item) => item.id === id);
  if (!found) throw new Error(`lugar desconhecido: ${id}`);
  return found;
}

export function addressLabel(item: { endereco: string; bairro: string }) {
  return `${item.endereco} · ${item.bairro}`;
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function houseNumber(query: string): string | null {
  const cut = query
    .replace(/,?\s*(balne[aá]rio\s+cambori[uú]|cambori[uú]|itaja[ií]|santa catarina).*$/i, "")
    .trim();
  const nums = [...cut.matchAll(/\d{1,5}/g)].map((match) => match[0]);
  if (nums.length >= 2) return nums[nums.length - 1];
  if (nums.length === 1) {
    const rest = cut.replace(nums[0], "").replace(/rua|avenida|av\.?|travessa|alameda|r\./gi, "");
    if (/[a-zà-ú]/i.test(rest)) return nums[0];
  }
  return null;
}

function cityOf(query: string) {
  if (/itaja[ií]/i.test(query)) return "Itajaí";
  if (/balne[aá]rio/i.test(query)) return "Balneário Camboriú";
  if (/cambori[uú]/i.test(query)) return "Camboriú";
  return "Balneário Camboriú";
}

export function addressWithNumber(typed: string, found: string) {
  const num = houseNumber(typed);
  const road = (found.split(",")[0] || typed).trim();
  const city = cityOf(`${typed} ${found}`);
  if (!num) return typed.trim() || `${road}, ${city}`;
  return `${road}, ${num}, ${city}`;
}

export function searchPlaces(query: string, near?: LatLng | null) {
  const needle = fold(query.trim());
  if (needle.length < 3) return [];
  const pool = near ? PLACES.filter((item) => haversine(near, item) <= 60) : [];
  return pool.filter((item) => fold(`${item.endereco} ${item.bairro}`).includes(needle)).slice(0, 6);
}

const CITY = "Balneário Camboriú, Santa Catarina";

function expandQueries(query: string) {
  const q = query.trim().replace(/\s+/g, " ");
  const out = [q];
  const hasCity = /cambori[uú]|itaja|camboriu|santa catarina/i.test(q);
  if (/rua\\s+araquari/i.test(q) && /balne[aá]rio/i.test(q)) {
    out.push(`${q}, Municípios, Balneário Camboriú, SC, 88337-480`);
  }
  if (!hasCity) out.push(`${q}, ${CITY}`);
  const house = q.match(/^(.*\D)[,\s]+(\d{1,5})$/);
  if (house) {
    const street = house[1].trim();
    const num = house[2];
    out.push(`${num} ${street}, ${CITY}`);
    out.push(`${street} ${num}, ${CITY}`);
  }
  return [...new Set(out)];
}

async function fetchNominatim(query: string, near?: LatLng | null) {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "8",
    countrycodes: "br",
    addressdetails: "1",
    q: query,
  });
  if (near) {
    // Keep address candidates inside the local delivery area, not neighboring cities.
    const span = 0.08;
    params.set("viewbox", `${near.lng - span},${near.lat + span},${near.lng + span},${near.lat - span}`);
    params.set("bounded", "1");
  }
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "Accept-Language": "pt-BR" },
  });
  if (response.status === 429) throw new Error("busca ocupada");
  if (!response.ok) throw new Error("não foi possível buscar o endereço");
  const data = (await response.json()) as { lat: string; lon: string; display_name: string }[];
  return data.map((item) => ({
    label: item.display_name.split(",").slice(0, 5).join(",").trim(),
    lat: Number(item.lat),
    lng: Number(item.lon),
    city: item.address?.city ?? item.address?.town ?? item.address?.municipality ?? item.address?.county ?? "",
  }));
}


async function fetchPhoton(query: string, near?: LatLng | null) {
  const params = new URLSearchParams({ q: query, lang: "pt", limit: "5" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
    headers: { Accept: "application/json", "Accept-Language": "pt-BR" },
  });
  if (!response.ok) throw new Error("não foi possível buscar o endereço");
  const data = (await response.json()) as {
    features?: {
      geometry?: { coordinates?: unknown };
      properties?: { name?: string; street?: string; housenumber?: string; city?: string; state?: string };
    }[];
  };
  return (data.features ?? []).flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates;
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      !Number.isFinite(coordinates[0]) ||
      !Number.isFinite(coordinates[1])
    ) return [];
    const [lng, lat] = coordinates as [number, number];
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    const props = feature.properties ?? {};
    const label = [
      [props.street ?? props.name, props.housenumber].filter(Boolean).join(", "),
      props.city,
      props.state,
    ].filter(Boolean).join(", ");
    if (!label) return [];
    return [{ label, lat, lng }];
  });
}

export async function searchNominatim(query: string, near?: LatLng | null) {
  const seen = new Set<string>();
  const hits: { label: string; lat: number; lng: number }[] = [];
  for (const attempt of expandQueries(query)) {
    try {
      const batch = await fetchNominatim(attempt, near);
      for (const item of batch) {
        if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
        if (/balne[aá]rio/i.test(query) && item.city && !/balne[aá]rio cambori[uú]/i.test(item.city)) continue;
        if (near && haversine(near, item) > 60) continue;
        const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ lat: item.lat, lng: item.lng, label: addressWithNumber(query, item.label) });
      }
    } catch {
      // Continue with the next spelling/city variant and use Photon below
      // if Nominatim is temporarily rate-limited or unavailable.
    }
    if (hits.length >= 5) break;
  }

  if (!hits.length) {
    for (const attempt of expandQueries(query)) {
      try {
        const batch = await fetchPhoton(attempt, near);
        for (const item of batch) {
          if (near && haversine(near, item) > 12) continue;
          const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push({ lat: item.lat, lng: item.lng, label: addressWithNumber(query, item.label) });
        }
      } catch {
        // The form will offer manual map pin placement if both services fail.
      }
      if (hits.length >= 5) break;
    }
  }
  return hits.slice(0, 5);
}
