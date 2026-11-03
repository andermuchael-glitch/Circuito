import { useMemo, useState } from "react";
import { MapPin, Plus, Search } from "lucide-react";
import { StatusPill } from "@/components/bits";
import { useDelivery, type Status } from "@/lib/delivery-store";
import { brl } from "@/lib/format";
import { cn } from "@/lib/cn";

const filters: { id: "fila" | "entregue" | "todas"; label: string }[] = [
  { id: "fila", label: "Fila" },
  { id: "entregue", label: "Entregues" },
  { id: "todas", label: "Todas" },
];

function matches(status: Status, filter: (typeof filters)[number]["id"]) {
  if (filter === "todas") return true;
  if (filter === "entregue") return status === "entregue";
  return status === "aberta" || status === "rota";
}

export function ComandasPanel() {
  const comandas = useDelivery((state) => state.comandas);
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("fila");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const list = useMemo(() => {
    return comandas
      .filter((item) => matches(item.status, filter))
      .filter((item) => {
        if (!needle) return true;
        return `${item.cliente} ${item.endereco} ${item.numero}`.toLowerCase().includes(needle);
      })
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [comandas, filter, needle]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <div>
          <h1 className="font-display text-3xl leading-none tracking-wide">COMANDAS</h1>
          <p className="mt-1 text-sm text-muted">Cada pedido entra na fila. A base é a Rua 904.</p>
        </div>
        <button
          type="button"
          onClick={() => useDelivery.getState().openDraft()}
          className="inline-flex h-11 items-center gap-1 rounded-full bg-signal px-4 text-sm font-semibold text-signal-ink"
        >
          <Plus className="h-4 w-4" />
          Nova
        </button>
      </div>

      <div className="px-4 pt-4">
        <label className="flex h-12 items-center gap-2 rounded-2xl border border-line bg-ink px-3">
          <Search className="h-4 w-4 text-muted" />
          <span className="sr-only">Buscar comanda</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Comanda ou endereço"
            className="h-full w-full bg-transparent text-base text-paper outline-none placeholder:text-muted"
          />
        </label>
        <div className="mt-3 flex gap-2">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "h-9 rounded-full px-3 text-sm font-medium",
                filter === item.id ? "bg-paper text-ink" : "bg-raised text-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
            <p className="font-medium">Nenhuma comanda aqui</p>
            <p className="mt-1 text-sm text-muted">Coloque a comanda, o endereço e a taxa.</p>
          </div>
        ) : (
          list.map((item) => (
            <article key={item.id} className="rounded-2xl border border-line bg-raised p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted">
                    {item.numero} · {new Date(item.deliveredAt ?? item.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                  <h2 className="truncate text-base font-semibold">{item.cliente}</h2>
                </div>
                <StatusPill status={item.status} />
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{item.endereco}</span>
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="font-mono text-sm">Taxa {brl(item.valor)}</p>
                {item.lat != null ? (
                  <button
                    type="button"
                    onClick={() => {
                      useDelivery.getState().select(item.id);
                      useDelivery.getState().setTab("mapa");
                      useDelivery.getState().requestFit();
                    }}
                    className="h-10 rounded-full border border-line px-3 text-sm font-medium"
                  >
                    Ver no mapa
                  </button>
                ) : (
                  <span className="text-xs text-muted">Sem endereço</span>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
