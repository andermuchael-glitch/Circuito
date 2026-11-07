import { useEffect } from "react";
import { buildSimPath, corridaAtiva, nextStop, isDefaultBase, BASE_HOME, useDelivery } from "@/lib/delivery-store";
import { holdScreen, releaseScreen } from "@/lib/screen";
import { toast } from "sonner";
import { publishLivePoint, publishPermanentLiveShare } from "@/lib/live-sharing";
import { drivingRoute } from "@/lib/routing";

declare global {
  interface Window {
    Circuito?: {
      startLocationTracking?: () => void;
      stopLocationTracking?: () => void;
      consumeLocationPoints?: () => string;
      hasLocationPermission?: () => boolean;
    };
  }
}

export function LiveEngine() {
  const live = useDelivery((state) => state.live);
  const liveAttempt = useDelivery((state) => state.liveAttempt);
  const modo = useDelivery((state) => corridaAtiva(state)?.modo ?? null);
  const ativaId = useDelivery((state) => state.ativaId);
  const simToken = useDelivery((state) => state.simToken);
  const nativeRun = useDelivery((state) => corridaAtiva(state)?.modo === "gps" && corridaAtiva(state)?.status === "ativa");

  useEffect(() => {
    const sync = () => {
      const run = corridaAtiva(useDelivery.getState());
      if (run?.status === "ativa") void holdScreen();
      else void releaseScreen();
    };
    sync();
    const unsub = useDelivery.subscribe(sync);
    const wake = () => sync();
    document.addEventListener("visibilitychange", wake);
    document.addEventListener("pointerdown", wake);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", wake);
      document.removeEventListener("pointerdown", wake);
      void releaseScreen();
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Circuito?.startLocationTracking) {
      if (live && nativeRun) window.Circuito.startLocationTracking();
      else window.Circuito.stopLocationTracking?.();
    }
  }, [live, nativeRun, ativaId, modo]);

  useEffect(() => {
    if (!live) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      useDelivery.getState().setLiveStatus("erro");
      useDelivery.getState().setGpsError("Geolocalização indisponível neste navegador.");
      return;
    }

    let gotFix = false;
    let lastPermanentPublish = 0;
    let lastPermanentTarget = "";
    useDelivery.getState().setLiveStatus("buscando");

    const onFix = (pos: GeolocationPosition) => {
      gotFix = true;
      const accuracy = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null;
      const raw = pos.coords.speed;
      const speed = raw == null || raw < 0 ? null : raw * 3.6;
      const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const store = useDelivery.getState();
      store.setGpsMeta({
        accuracy,
        speed,
        weak: accuracy != null && accuracy > 35,
      });
      // Não mover o marcador nem recalcular a rota com uma leitura GPS imprecisa.
      // Isso evita que o ponto de entrega seja confundido com a posição real.
      if (accuracy != null && accuracy > 65) {
        store.setLiveStatus("buscando");
        store.setGpsError(`Precisão do GPS baixa (±${Math.round(accuracy)} m). Aguardando uma posição melhor.`);
        return;
      }
      store.setLiveStatus("ativo");
      store.setGpsError(null);
      store.setGaze(point);
      if (isDefaultBase(store.base) && (accuracy == null || accuracy <= 50)) {
        store.setBase({ ...point, endereco: BASE_HOME.endereco });
        toast.success("Base colocada onde você está.");
      }

      const run = corridaAtiva(useDelivery.getState());
      if (!run || run.status !== "ativa" || run.modo !== "gps") return;
      if (accuracy != null && accuracy > 120) return;
      const trackedPoint = { ...point, t: pos.timestamp || Date.now() };
      useDelivery.getState().pushPoint(trackedPoint);
      try {
        const share = JSON.parse(localStorage.getItem("circuito-live-share") || "null") as { id?: string; corridaId?: string } | null;
        const currentRun = corridaAtiva(useDelivery.getState());
        if (share?.id && currentRun?.id === share.corridaId) {
          void publishLivePoint(share.id, { lat: point.lat, lng: point.lng, accuracy, speed, time: trackedPoint.t }, [...currentRun.points, trackedPoint]).catch((error) => {
            console.warn("[Circuito] Falha ao publicar localização compartilhada", error);
          });
        }

        const permanentToken = localStorage.getItem("circuito-permanent-share-token");
        if (permanentToken && currentRun?.status === "ativa" && currentRun.modo === "gps") {
          const latestState = useDelivery.getState();
          const stop = nextStop(currentRun, latestState.comandas);
          const destination = currentRun.destino ?? (stop ? null : (latestState.base ?? BASE_HOME));
          const target = currentRun.destino
            ? { lat: currentRun.destino.lat, lng: currentRun.destino.lng, label: currentRun.destino.label, order: null as string | null, customer: null as string | null, status: "delivery" as const }
            : stop
              ? { lat: stop.lat, lng: stop.lng, label: stop.endereco, order: stop.numero, customer: stop.cliente, status: "delivery" as const }
              : { lat: destination!.lat, lng: destination!.lng, label: "Volta à base", order: null, customer: null, status: "returning" as const };
          const targetKey = `${target.lat.toFixed(5)},${target.lng.toFixed(5)},${target.order ?? target.status}`;
          if (Date.now() - lastPermanentPublish >= 12000 || targetKey !== lastPermanentTarget) {
            lastPermanentPublish = Date.now();
            lastPermanentTarget = targetKey;
            void (async () => {
              const road = await drivingRoute([point, { lat: target.lat, lng: target.lng }]);
              await publishPermanentLiveShare({
                active: true,
                status: target.status,
                current_order: target.order,
                customer: target.customer,
                destination_label: target.label,
                destination_lat: target.lat,
                destination_lng: target.lng,
                latest_lat: point.lat,
                latest_lng: point.lng,
                speed,
                accuracy,
                distance_m: road ? Math.round(road.km * 1000) : null,
                eta_seconds: road?.durationSeconds ?? null,
                updated_at: new Date(trackedPoint.t).toISOString(),
              });
            })().catch((error) => console.warn("[Circuito] Falha ao atualizar link permanente", error));
          }
        }
      } catch {
        // Compartilhamento é opcional; o GPS local continua funcionando.
      }
    };

    const onErr = (err: GeolocationPositionError) => {
      if (gotFix) return;
      const denied = err.code === 1;
      useDelivery.getState().setLiveStatus(denied ? "negado" : "erro");
      useDelivery.getState().setGpsError(
        denied
          ? "Localização bloqueada. Toque em Ativar GPS e permita o acesso do navegador."
          : "Não foi possível ler o GPS agora. Toque em Ativar GPS para tentar de novo.",
      );
    };

    const nativeBridge = typeof window !== "undefined" ? window.Circuito : undefined;
    if (nativeBridge?.startLocationTracking && nativeBridge.hasLocationPermission?.()) {
      const onNativeFix = (event: Event) => {
        const detail = (event as CustomEvent<{ latitude: number; longitude: number; accuracy: number; speed: number; time: number }>).detail;
        if (!detail || !Number.isFinite(detail.latitude) || !Number.isFinite(detail.longitude)) return;
        onFix({
          coords: { latitude: detail.latitude, longitude: detail.longitude, accuracy: detail.accuracy, speed: detail.speed },
          timestamp: detail.time || Date.now(),
        } as GeolocationPosition);
      };
      const drainNative = () => {
        try {
          const pending = JSON.parse(nativeBridge.consumeLocationPoints?.() || "[]") as Array<{ latitude: number; longitude: number; accuracy: number; speed: number; time: number }>;
          for (const detail of pending) onNativeFix(new CustomEvent("circuito-native-location", { detail }));
        } catch {
          // Ignore invalid local queue data; live GPS continues.
        }
      };
      window.addEventListener("circuito-native-location", onNativeFix);
      document.addEventListener("visibilitychange", drainNative);
      drainNative();
      return () => {
        window.removeEventListener("circuito-native-location", onNativeFix);
        document.removeEventListener("visibilitychange", drainNative);
      };
    }

    const watch = navigator.geolocation.watchPosition(onFix, onErr, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 20000,
    });

    const poll = window.setInterval(() => {
      const status = useDelivery.getState().liveStatus;
      if (!useDelivery.getState().live || status === "negado" || status === "erro") return;
      navigator.geolocation.getCurrentPosition(onFix, () => {}, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 8000,
      });
    }, 2500);

    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(poll);
    };
  }, [live, liveAttempt, nativeRun]);

  useEffect(() => {
    if (modo !== "simulacao" || !ativaId) return;
    const path = buildSimPath();
    if (path.length === 0) {
      useDelivery.getState().setModo("parado");
      return;
    }
    let index = 0;
    const timer = window.setInterval(() => {
      const current = corridaAtiva(useDelivery.getState());
      if (!current || current.modo !== "simulacao") {
        window.clearInterval(timer);
        return;
      }
      if (index >= path.length) {
        window.clearInterval(timer);
        useDelivery.getState().setModo("parado");
        return;
      }
      const step = path[index];
      index += 1;
      useDelivery.getState().pushPoint({ lat: step.lat, lng: step.lng, t: Date.now() });
    }, 140);
    return () => window.clearInterval(timer);
  }, [modo, ativaId, simToken]);

  return null;
}
