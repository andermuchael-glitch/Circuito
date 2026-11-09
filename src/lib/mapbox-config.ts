/**
 * Token público do Mapbox injetado pelo ambiente de build.
 * Configure VITE_MAPBOX_ACCESS_TOKEN no provedor de hospedagem.
 * Não coloque tokens secretos (sk.*) no frontend.
 */
export const MAPBOX_ACCESS_TOKEN =
  (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) ?? "";
