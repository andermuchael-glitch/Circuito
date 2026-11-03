import { useEffect, useMemo, useState } from "react";
import { useDelivery, type Comanda, type Corrida } from "@/lib/delivery-store";
import { brl, clock, duration, kmLabel } from "@/lib/format";
import { cn } from "@/lib/cn";

type Periodo = "dia" | "mes" | "ano";

const periodos: { id: Periodo; label: string }[] = [
  { id: "dia", label: "Dia" },
  { id: "mes", label: "Mês" },
  { id: "ano", label: "Ano" },
];

function shift(date: Date, periodo: Periodo, dir: -1 | 1) {
  const next = new Date(date);
  if (periodo === "dia") next.setDate(next.getDate() + dir);
  else if (periodo === "mes") next.setMonth(next.getMonth() + dir);
  else next.setFullYear(next.getFullYear() + dir);
  return next;
}

function samePeriod(ts: number, periodo: Periodo, cursor: Date) {
  const date = new Date(ts);
  if (periodo === "dia") return date.toDateString() === cursor.toDateString();
  if (periodo === "mes") return date.getMonth() === cursor.getMonth() && date.getFullYear() === cursor.getFullYear();
  return date.getFullYear() === cursor.getFullYear();
}

function periodLabel(periodo: Periodo, cursor: Date) {
  if (periodo === "dia") {
    return cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  }
  if (periodo === "mes") {
    return cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }
  return String(cursor.getFullYear());
}

export function KmPanel() {
  const comandas = useDelivery((state) => state.comandas);
  const corridas = useDelivery((state) => state.corridas);
  const ativaId = useDelivery((state) => state.ativaId);
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [cursor, setCursor] = useState(() => new Date());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const focusDay = useDelivery((state) => state.focusDay);

  useEffect(() => {
    if (!focusDay) return;
    setPeriodo("dia");
    setCursor(new Date(focusDay));
    useDelivery.setState({ focusDay: null });
  }, [focusDay]);

  const entregues = useMemo(
    () => comandas.filter((item) => item.deliveredAt && samePeriod(item.deliveredAt, periodo, cursor)),
    [comandas, periodo, cursor],
  );
  const saidas = useMemo(
    () =>
      corridas
        .filter((item) => samePeriod(item.startedAt, periodo, cursor))
        .slice()
        .sort((a, b) => b.startedAt - a.startedAt),
    [corridas, periodo, cursor],
  );
  const taxas = entregues.reduce((sum, item) => sum + item.valor, 0);
  const km = saidas.reduce((sum, item) => sum + item.km, 0);
  const rows = useMemo(() => bars(periodo, cursor, saidas), [periodo, cursor, saidas]);

  return (
    <div className="scroll h-full min-h-0 overflow-y-auto px-4 py-4">
      <div className="flex gap-2">
        {periodos.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setPeriodo(item.id);
              setCursor(new Date());
            }}
            className={cn(
              "h-10 flex-1 rounded-full text-sm font-semibold",
              periodo === item.id ? "bg-paper text-ink" : "bg-raised text-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => setCursor((current) => shift(current, periodo, -1))}
          className="grid h-10 w-10 place-items-center rounded-full border border-line"
        >
          ‹
        </button>
        <p className="text-center text-sm font-medium capitalize">{periodLabel(periodo, cursor)}</p>
        <button
          type="button"
          aria-label="Próximo"
          onClick={() => setCursor((current) => shift(current, periodo, 1))}
          className="grid h-10 w-10 place-items-center rounded-full border border-line"
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-raised px-3 py-3">
          <p className="text-xs text-muted">Soma das taxas</p>
          <p className="mt-1 font-display text-4xl leading-none tracking-wide text-signal">{brl(taxas)}</p>
          <p className="mt-2 text-sm text-muted">
            {entregues.length} {entregues.length === 1 ? "entrega" : "entregas"}
          </p>
        </div>
        <div className="rounded-2xl bg-raised px-3 py-3">
          <p className="text-xs text-muted">Km rodados</p>
          <p className="mt-1 font-display text-4xl leading-none tracking-wide">{kmLabel(km)}</p>
          <p className="mt-2 text-sm text-muted">
            {saidas.length} {saidas.length === 1 ? "saída" : "saídas"}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">Entregas e taxas do período. Os km somam as rotas dessa data.</p>

      <h2 className="mt-6 text-sm font-semibold tracking-wide text-muted">
        {periodo === "dia" ? "DO DIA" : periodo === "mes" ? "DO MÊS" : "DO ANO"}
      </h2>
      <div className="mt-2 h-48 rounded-2xl border border-line bg-raised p-2">
        <KmChart rows={rows} />
      </div>

      <ul className="mt-4 space-y-2">
        {saidas.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-line px-3 py-6 text-sm text-muted">
            Nenhuma rota neste período.
          </li>
        ) : (
          saidas.map((item) => (
            <li key={item.id} className="rounded-2xl border border-line px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {new Date(item.startedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} ·{" "}
                    {clock(item.startedAt)}
                    {item.status === "ativa" ? " · aberta" : ""}
                  </p>
                  <p className="text-sm text-muted">
                    {brl(taxasDaCorrida(item, comandas))} · {item.feitas.length}{" "}
                    {item.feitas.length === 1 ? "entrega" : "entregas"}
                    {item.endedAt ? ` · ${duration(item.endedAt - item.startedAt)}` : ""}
                  </p>
                </div>
                <p className="font-mono text-sm">{kmLabel(item.km)}</p>
              </div>
              {confirmId === item.id ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="h-10 rounded-full border border-line text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      useDelivery.getState().apagarCorrida(item.id);
                      setConfirmId(null);
                    }}
                    className="h-10 rounded-full bg-danger text-sm font-semibold text-ink"
                  >
                    Apagar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(item.id)}
                  disabled={item.id === ativaId}
                  className="mt-2 text-sm text-danger disabled:text-muted"
                >
                  {item.id === ativaId ? "Encerre a corrida antes de apagar" : "Apagar rota"}
                </button>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function bars(periodo: Periodo, cursor: Date, saidas: Corrida[]) {
  if (periodo === "dia") {
    return saidas
      .slice()
      .reverse()
      .map((item) => ({ nome: clock(item.startedAt), km: Number(item.km.toFixed(2)) }));
  }
  if (periodo === "mes") {
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      const km = saidas
        .filter((item) => new Date(item.startedAt).getDate() === day)
        .reduce((sum, item) => sum + item.km, 0);
      return { nome: String(day), km: Number(km.toFixed(2)) };
    }).filter((item) => item.km > 0);
  }
  return Array.from({ length: 12 }, (_, month) => {
    const km = saidas
      .filter((item) => new Date(item.startedAt).getMonth() === month)
      .reduce((sum, item) => sum + item.km, 0);
    const nome = new Date(cursor.getFullYear(), month, 1).toLocaleDateString("pt-BR", { month: "short" });
    return { nome, km: Number(km.toFixed(2)) };
  }).filter((item) => item.km > 0);
}

function taxasDaCorrida(corrida: { feitas: string[] }, comandas: Comanda[]) {
  return corrida.feitas.reduce((sum, id) => sum + (comandas.find((item) => item.id === id)?.valor ?? 0), 0);
}

function KmChart({ rows }: { rows: { nome: string; km: number }[] }) {
  const [charts, setCharts] = useState<typeof import("recharts") | null>(null);
  useEffect(() => {
    void import("recharts").then(setCharts);
  }, []);
  if (!rows.length) return null;
  if (!charts) return <div className="h-full animate-pulse rounded-xl bg-surface" />;
  const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } = charts;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} barSize={18}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis dataKey="nome" tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: "transparent" }}
          contentStyle={{
            background: "var(--color-ink)",
            border: "1px solid var(--color-line)",
            borderRadius: 12,
            color: "var(--color-paper)",
          }}
          formatter={(value) => [kmLabel(Number(value)), "km"]}
        />
        <Bar dataKey="km" fill="var(--color-signal)" radius={6} />
      </BarChart>
    </ResponsiveContainer>
  );
}
