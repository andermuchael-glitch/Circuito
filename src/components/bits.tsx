import type { ReactNode } from "react";
import type { Pagamento, Status } from "@/lib/delivery-store";
import { cn } from "@/lib/cn";

const statusCopy: Record<Status, string> = {
  aberta: "Na fila",
  rota: "Em rota",
  entregue: "Entregue",
  cancelada: "Cancelada",
};

const payCopy: Record<Pagamento, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-xs font-medium",
        status === "aberta" && "bg-surface text-muted",
        status === "rota" && "bg-signal text-signal-ink",
        status === "entregue" && "bg-go text-ink",
        status === "cancelada" && "bg-surface text-danger",
      )}
    >
      {statusCopy[status]}
    </span>
  );
}

export function PayLabel({ pagamento }: { pagamento: Pagamento }) {
  return <span>{payCopy[pagamento]}</span>;
}

export function payName(pagamento: Pagamento) {
  return payCopy[pagamento];
}

export function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-paper shadow-none",
        pressed && "border-signal text-signal",
      )}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-signal px-5 text-sm font-semibold text-signal-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-semibold text-paper disabled:opacity-40"
    >
      {children}
    </button>
  );
}
