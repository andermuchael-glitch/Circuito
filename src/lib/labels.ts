import type { Pagamento, Status } from "@/lib/delivery-store";

export const statusCopy: Record<Status, string> = {
  aberta: "Na fila",
  rota: "Em rota",
  entregue: "Entregue",
  cancelada: "Cancelada",
};

export const payCopy: Record<Pagamento, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
};

export function payName(pagamento: Pagamento) {
  return payCopy[pagamento];
}
