import { useMemo, useState } from "react";
import { MapPin, Plus, Search } from "lucide-react";
import { StatusPill } from "@/components/bits";
import { dayKey, useDelivery, type Status } from "@/lib/delivery-store";
import { brl, parseMoney } from "@/lib/format";
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
  const arrancadas = useDelivery((state) => state.arrancadas);
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("todas");
  const [query, setQuery] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
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
                  <h2 className="truncate text-base font-semibold">
                    {item.quantidade && item.quantidade > 1 ? `${item.quantidade} comandas` : item.cliente}
                  </h2>
                </div>
                <StatusPill status={item.status} />
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{item.endereco}</span>
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="font-mono text-sm">
                  {item.quantidade && item.quantidade > 1 ? "Taxas" : "Taxa"} {brl(item.valor)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmId(null);
                      setEditId((current) => (current === item.id ? null : item.id));
                    }}
                    className="h-10 rounded-full border border-line px-3 text-sm font-medium"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(null);
                      setConfirmId((current) => (current === item.id ? null : item.id));
                    }}
                    className="h-10 rounded-full border border-line px-3 text-sm font-medium text-danger"
                  >
                    Apagar
                  </button>
                </div>
              </div>
              {editId === item.id ? (
                <EditCard
                  id={item.id}
                  dia={dayKey(new Date(item.deliveredAt ?? item.createdAt))}
                  valor={String(item.valor).replace(".", ",")}
                  quantidade={String(item.quantidade && item.quantidade > 1 ? item.quantidade : 1)}
                  arrancada={String(arrancadas?.[dayKey(new Date(item.deliveredAt ?? item.createdAt))] ?? 60).replace(".", ",")}
                  cliente={item.cliente}
                  lote={Boolean(item.quantidade && item.quantidade > 1)}
                  onClose={() => setEditId(null)}
                />
              ) : null}
              {confirmId === item.id ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setConfirmId(null)} className="h-10 rounded-full border border-line text-sm">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      useDelivery.getState().apagarComanda(item.id);
                      setConfirmId(null);
                    }}
                    className="h-10 rounded-full bg-danger text-sm font-semibold text-ink"
                  >
                    Apagar
                  </button>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function EditCard({
  id,
  dia,
  valor,
  quantidade,
  arrancada,
  cliente,
  lote,
  onClose,
}: {
  id: string;
  dia: string;
  valor: string;
  quantidade: string;
  arrancada: string;
  cliente: string;
  lote: boolean;
  onClose: () => void;
}) {
  const [day, setDay] = useState(dia);
  const [money, setMoney] = useState(valor);
  const [count, setCount] = useState(quantidade);
  const [startFee, setStartFee] = useState(arrancada);
  const [name, setName] = useState(cliente);
  const [error, setError] = useState("");

  function save() {
    const taxa = parseMoney(money);
    if (!Number.isFinite(taxa) || taxa < 0) {
      setError("Informe a taxa.");
      return;
    }
    const arrancadaValor = startFee.trim() === "" ? 60 : parseMoney(startFee);
    if (!Number.isFinite(arrancadaValor) || arrancadaValor < 0) {
      setError("Informe a arrancada.");
      return;
    }
    const qtdDia = Math.round(Number(count.replace(",", ".")));
    if (lote && (!Number.isFinite(qtdDia) || qtdDia < 2)) {
      setError("Informe a quantidade.");
      return;
    }
    useDelivery.getState().editarComanda(id, {
      dia: day,
      valor: taxa,
      quantidade: lote ? qtdDia : 1,
      arrancada: arrancadaValor,
      cliente: name,
    });
    onClose();
  }

  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-line bg-ink p-3">
      <label className="block text-sm font-medium">
        Dia
        <input
          type="date"
          value={day}
          onChange={(event) => setDay(event.target.value)}
          className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-base outline-none"
        />
      </label>
      {lote ? (
        <label className="block text-sm font-medium">
          Quantidade
          <input
            value={count}
            onChange={(event) => setCount(event.target.value)}
            inputMode="numeric"
            className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 font-mono text-base outline-none"
          />
        </label>
      ) : (
        <label className="block text-sm font-medium">
          Comanda
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 text-base outline-none"
          />
        </label>
      )}
      <label className="block text-sm font-medium">
        {lote ? "Total das taxas" : "Taxa"}
        <input
          value={money}
          onChange={(event) => setMoney(event.target.value)}
          inputMode="decimal"
          className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 font-mono text-base outline-none"
        />
      </label>
      <label className="block text-sm font-medium">
        Arrancada do dia
        <input
          value={startFee}
          onChange={(event) => setStartFee(event.target.value)}
          inputMode="decimal"
          className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-3 font-mono text-base outline-none"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="h-10 rounded-full border border-line text-sm">
          Cancelar
        </button>
        <button type="button" onClick={save} className="h-10 rounded-full bg-signal text-sm font-semibold text-signal-ink">
          Salvar
        </button>
      </div>
    </div>
  );
}
