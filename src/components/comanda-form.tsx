import { useEffect, useState, type FormEvent } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { PrimaryButton } from "@/components/bits";
import { useDelivery } from "@/lib/delivery-store";
import { parseMoney } from "@/lib/format";
import { addressWithNumber, searchNominatim } from "@/lib/places";

function diaHoje() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function ComandaForm() {
  const draft = useDelivery((state) => state.draft);
  const near = useDelivery((state) => state.base);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [marcar, setMarcar] = useState(false);
  const [dia, setDia] = useState(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  });
  const [hits, setHits] = useState<{ label: string; lat: number; lng: number }[]>([]);

  const endereco = draft?.endereco ?? "";
  const pinned = draft?.lat != null && draft?.lng != null;

  useEffect(() => {
    if (pinned) return;
    const query = endereco.trim();
    if (query.length < 3) return;
    let cancel = false;
    const timer = window.setTimeout(() => {
      void searchNominatim(query, near)
        .then((found) => {
          if (!cancel) setHits(found);
        })
        .catch(() => {
          if (!cancel) setHits([]);
        });
    }, 700);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [endereco, pinned, near]);

  if (!draft || draft.picking) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const current = useDelivery.getState().draft;
    if (!current) return;
    if (!current.cliente.trim()) {
      setError("Informe a comanda.");
      return;
    }
    const taxa = parseMoney(current.valor);
    if (!Number.isFinite(taxa) || taxa < 0) {
      setError("Informe a taxa.");
      return;
    }
    if (!marcar) {
      setError("");
      useDelivery.getState().saveDraft({ valor: taxa, dia, comEndereco: false });
      return;
    }
    if (current.endereco.trim().length < 3) {
      setError("Informe o endereço ou desmarque essa opção.");
      return;
    }
    let lat = current.lat;
    let lng = current.lng;
    let enderecoFinal = current.endereco.trim();
    if (lat == null || lng == null) {
      setBusy(true);
      try {
        const found = await searchNominatim(enderecoFinal, near);
        const first = found[0];
        if (!first) {
          setError("Endereço não encontrado. Escolha uma sugestão ou marque no mapa.");
          setBusy(false);
          return;
        }
        lat = first.lat;
        lng = first.lng;
        enderecoFinal = addressWithNumber(current.endereco, first.label);
      } catch {
        setError("Não achei o endereço. Marque o ponto no mapa.");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setError("");
    useDelivery.getState().patchDraft({ endereco: enderecoFinal, lat, lng });
    useDelivery.getState().saveDraft({ valor: taxa, dia, comEndereco: true });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 md:items-center">
      <form
        onSubmit={submit}
        className="scroll max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-surface p-4 md:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl leading-none tracking-wide">NOVA COMANDA</h2>
            <p className="mt-1 text-sm text-muted">Escolha o dia. O endereço só entra se você marcar.</p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => useDelivery.getState().closeDraft()}
            className="grid h-11 w-11 place-items-center rounded-full border border-line"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-4 block text-sm font-medium">
          Dia
          <input
            type="date"
            value={dia}
            max={diaHoje()}
            onChange={(event) => setDia(event.target.value)}
            className="mt-1 h-12 w-full rounded-2xl border border-line bg-ink px-3 text-base outline-none"
          />
        </label>

        <label className="mt-3 block text-sm font-medium">
          Comanda
          <input
            value={draft.cliente}
            onChange={(event) => useDelivery.getState().patchDraft({ cliente: event.target.value })}
            className="mt-1 h-12 w-full rounded-2xl border border-line bg-ink px-3 text-base outline-none"
            placeholder="Número ou nome"
            autoFocus
          />
        </label>

        <button
          type="button"
          onClick={() => setMarcar((value) => !value)}
          className="mt-3 flex h-12 w-full items-center justify-between rounded-2xl border border-line bg-ink px-3 text-sm font-medium"
        >
          Marcar endereço
          <span className={marcar ? "text-go" : "text-muted"}>{marcar ? "Sim" : "Não"}</span>
        </button>

        {marcar ? (
          <>
            <label className="mt-3 block text-sm font-medium">
              Endereço
              <input
                value={draft.endereco}
                onChange={(event) => {
                  setHits([]);
                  useDelivery.getState().patchDraft({ endereco: event.target.value, lat: null, lng: null });
                }}
                className="mt-1 h-12 w-full rounded-2xl border border-line bg-ink px-3 text-base outline-none"
                placeholder="Rua, número, bairro"
                autoComplete="off"
              />
            </label>

            {hits.length > 0 && !pinned ? (
              <ul className="mt-2 overflow-hidden rounded-2xl border border-line">
                {hits.map((item) => (
                  <li key={`${item.lat}-${item.lng}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setHits([]);
                        useDelivery.getState().patchDraft({
                          endereco: addressWithNumber(draft.endereco, item.label),
                          lat: item.lat,
                          lng: item.lng,
                        });
                      }}
                      className="flex w-full items-start gap-2 px-3 py-3 text-left text-sm hover:bg-raised"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                      <span>{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {pinned ? (
              <p className="mt-2 text-xs text-go">Endereço localizado no mapa.</p>
            ) : (
              <button
                type="button"
                onClick={() => useDelivery.getState().startPick()}
                className="mt-2 text-sm text-muted underline"
              >
                Marcar no mapa
              </button>
            )}
          </>
        ) : null}

        <label className="mt-3 block text-sm font-medium">
          Taxa
          <input
            value={draft.valor}
            onChange={(event) => useDelivery.getState().patchDraft({ valor: event.target.value })}
            className="mt-1 h-12 w-full rounded-2xl border border-line bg-ink px-3 font-mono text-base outline-none"
            placeholder="0,00"
            inputMode="decimal"
          />
        </label>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        <div className="mt-4">
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
