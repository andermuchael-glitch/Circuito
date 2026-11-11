import { useEffect, useState, type FormEvent } from "react";
import { LogOut, UserRound, Route, Navigation } from "lucide-react";
import { App } from "@/components/app";

const URL = "https://buvvxwzhqfkberreqbrk.supabase.co";
const KEY = "sb_publishable_tYL4tG01KbADZievXeOGpg_ExD1fP9c";
const STORE = "circuito-supabase-session-v1";
type Session = { access_token: string; refresh_token: string; expires_at?: number; user: { id: string; email?: string } };
type Mode = "login" | "signup" | "recover" | "reset";

async function request(path: string, body?: unknown, token?: string) {
  const res = await fetch(`${URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.message || data.error_description || data.error || "Não foi possível concluir. Verifique os dados e tente novamente.");
  return data;
}
const save = (s: Session | null) => s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE);
function load(): Session | null { try { const s = localStorage.getItem(STORE); return s ? JSON.parse(s) as Session : null; } catch { return null; } }
const expiry = (s: Session & { expires_in?: number }) => ({ ...s, expires_at: Math.floor(Date.now() / 1000) + (s.expires_in || 3600) });

export function SupabaseAuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const hash = new URLSearchParams(location.hash.slice(1));
      if (hash.get("type") === "recovery" && hash.get("access_token")) {
        setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token") || "", user: { id: "" } });
        setMode("reset");
        history.replaceState({}, "", location.pathname + location.search);
      } else {
        const old = load();
        if (old?.access_token) {
          try {
            if (!old.expires_at || old.expires_at * 1000 < Date.now() + 60_000) {
              const next = expiry(await request("token?grant_type=refresh_token", { refresh_token: old.refresh_token }) as Session & { expires_in?: number });
              save(next); if (alive) setSession(next);
            } else if (alive) setSession(old);
          } catch { save(null); }
        }
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!session?.refresh_token || mode === "reset") return;
    const id = window.setInterval(async () => {
      if (session.expires_at && session.expires_at * 1000 > Date.now() + 90_000) return;
      try {
        const next = expiry(await request("token?grant_type=refresh_token", { refresh_token: session.refresh_token }) as Session & { expires_in?: number });
        save(next); setSession(next);
      } catch { save(null); setSession(null); }
    }, 60_000);
    return () => clearInterval(id);
  }, [session, mode]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "recover") {
        await request("recover?redirect_to=" + encodeURIComponent(location.origin + location.pathname), { email });
        setMessage("Link enviado. Confira seu e-mail e a caixa de spam.");
      } else if (mode === "reset") {
        if (password.length < 6 || password !== confirm) throw new Error(password.length < 6 ? "Use pelo menos 6 caracteres." : "As senhas não conferem.");
        await request("user", { password }, session?.access_token);
        if (session?.access_token) await request("logout", {}, session.access_token).catch(() => undefined);
        save(null); setSession(null); setMode("login"); setPassword(""); setConfirm("");
        setMessage("Senha atualizada. Entre com a nova senha.");
      } else if (mode === "signup") {
        if (password !== confirm) throw new Error("As senhas não conferem.");
        const redirectTo = location.origin + location.pathname;
        const result = await request("signup?redirect_to=" + encodeURIComponent(redirectTo), { email, password });
        if (result.access_token) { const next = expiry(result as Session & { expires_in?: number }); save(next); setSession(next); }
        else { setMode("login"); setMessage("Cadastro criado. Confirme seu e-mail pelo link enviado para ativar a conta."); }
      } else {
        const result = await request("token?grant_type=password", { email, password });
        const next = expiry(result as Session & { expires_in?: number }); save(next); setSession(next);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Erro inesperado."); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try { if (session?.access_token) await request("logout", {}, session.access_token); }
    catch { /* encerra também a cópia local se estiver sem conexão */ }
    finally { save(null); setSession(null); setBusy(false); }
  }

  if (!ready) return <div className="grid min-h-dvh place-items-center bg-[#07110c] text-white">Carregando conta…</div>;

  if (session && mode !== "reset") return <div className="relative h-dvh"><App /><div className="absolute right-3 top-3 z-50">
    <button type="button" aria-label="Abrir menu da conta" aria-expanded={accountOpen} onClick={() => setAccountOpen(v => !v)} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-[#101c16]/95 text-white shadow-lg">
      <UserRound className="h-5 w-5" />
    </button>
    {accountOpen && <div className="absolute right-0 top-12 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/15 bg-[#101c16] p-3 text-white shadow-2xl">
      <p className="px-2 py-2 text-xs text-white/55">Conta conectada</p>
      <p className="break-all px-2 pb-3 text-sm font-medium">{session.user?.email || "Conta conectada"}</p>
      <button type="button" disabled={busy} onClick={() => void logout()} className="flex w-full items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold disabled:opacity-50">
        <LogOut className="h-4 w-4" /> {busy ? "Saindo…" : "Sair da conta"}
      </button>
    </div>}
  </div></div>;

  const title = mode === "signup" ? "Criar conta" : mode === "recover" ? "Recuperar senha" : mode === "reset" ? "Nova senha" : "Entrar no Route377";
  return <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#07110c] px-4 py-8 text-white">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#b8f36b]/10 blur-3xl" />
      <div className="absolute -bottom-28 -left-24 h-80 w-80 rounded-full bg-[#ffb020]/10 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#b8f36b] via-[#ffb020] to-[#b8f36b]" />
    </div>
    <section className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-[#101c16]/95 p-6 shadow-[0_24px_90px_rgba(0,0,0,.45)] backdrop-blur sm:p-8">
      <div className="mb-8 text-center">
        <div className="relative mx-auto mb-4 grid h-20 w-20 place-items-center rounded-[1.7rem] bg-[#b8f36b] text-[#14200f] shadow-[0_10px_35px_rgba(184,243,107,.2)]">
          <Route className="h-10 w-10" strokeWidth={2.5} />
          <span className="absolute -bottom-2 -right-2 grid h-8 min-w-8 place-items-center rounded-full border-2 border-[#101c16] bg-[#ffb020] px-1 font-mono text-xs font-black text-[#1a1200]">377</span>
        </div>
        <p className="font-display text-5xl font-semibold tracking-[0.12em]">ROUTE377</p>
        <div className="mx-auto mt-2 flex items-center justify-center gap-2 text-[10px] font-semibold tracking-[0.22em] text-[#b8f36b]/80">
          <span className="h-px w-7 bg-[#b8f36b]/40" />
          ROTAS • ENTREGAS • CONTROLE
          <span className="h-px w-7 bg-[#b8f36b]/40" />
        </div>
        <p className="mt-4 text-base text-white/65">{title}</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {mode !== "reset" && <label className="block text-sm font-medium text-white/75">E-mail<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-4 text-base text-white outline-none transition focus:border-[#b8f36b] focus:ring-2 focus:ring-[#b8f36b]/15" placeholder="seu@email.com" /></label>}
        {mode !== "recover" && <label className="block text-sm font-medium text-white/75">{mode === "reset" ? "Nova senha" : "Senha"}<input required minLength={6} type="password" autoComplete={mode === "signup" || mode === "reset" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-4 text-base text-white outline-none transition focus:border-[#b8f36b] focus:ring-2 focus:ring-[#b8f36b]/15" placeholder="Mínimo de 6 caracteres" /></label>}
        {(mode === "signup" || mode === "reset") && <label className="block text-sm font-medium text-white/75">Confirmar senha<input required minLength={6} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-4 text-base text-white outline-none transition focus:border-[#b8f36b] focus:ring-2 focus:ring-[#b8f36b]/15" /></label>}
        {error && <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        {message && <p role="status" className="rounded-2xl border border-[#b8f36b]/25 bg-[#b8f36b]/10 p-3 text-sm text-[#d8ffad]">{message}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#b8f36b] px-4 py-4 text-base font-extrabold text-[#14200f] shadow-lg shadow-[#b8f36b]/10 transition hover:bg-[#c9fa88] disabled:opacity-60">
          <Navigation className="h-5 w-5" /> {busy ? "Aguarde…" : title}
        </button>
      </form>
      <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-white/65">
        {mode === "login" && <><button type="button" onClick={() => { setMode("signup"); setError(""); setMessage(""); }}>Criar conta</button><button type="button" onClick={() => { setMode("recover"); setError(""); setMessage(""); }}>Esqueci a senha</button></>}
        {mode !== "login" && mode !== "reset" && <button type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Voltar ao login</button>}
        {mode === "reset" && <button type="button" onClick={() => { setMode("login"); setSession(null); save(null); }}>Voltar ao login</button>}
      </div>
      <div className="mt-8 border-t border-white/10 pt-5 text-center">
        <p className="text-xs leading-relaxed text-white/40">Acesse sua conta para continuar. Suas comandas e corridas antigas permanecem preservadas neste dispositivo.</p>
        <p className="mt-3 font-mono text-[10px] tracking-[0.18em] text-white/25">ROUTE377 <span className="text-[#b8f36b]/60">•</span> SUA ROTA, SEU CONTROLE</p>
      </div>
    </section>
  </main>;
}
