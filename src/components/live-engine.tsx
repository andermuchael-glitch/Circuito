import { useEffect } from "react";
import { buildSimPath, corridaAtiva, isDefaultBase, BASE_HOME, useDelivery } from "@/lib/delivery-store";
import { holdScreen, releaseScreen } from "@/lib/screen";
import { toast } from "sonner";

declare global {
  interface Window {
    Circuito?: {
      startLocationTracking?: () => void;
      stopLocationTracking?: () => void;
      consumeLocationPoints?: () => string;
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
        weak: accuracy != null && accuracy > 40,
      });
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
      useDelivery.getState().pushPoint({ ...point, t: pos.timestamp || Date.now() });
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
    if (nativeBridge?.startLocationTracking) {
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
