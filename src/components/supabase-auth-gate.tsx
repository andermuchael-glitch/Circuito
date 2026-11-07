import { useEffect, useState, type FormEvent } from "react";
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
        const redirectTo = location.origin + location.pathname;\n        const result = await request("signup?redirect_to=" + encodeURIComponent(redirectTo), { email, password });
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
  if (session && mode !== "reset") return <div className="relative h-dvh"><App /><div className="absolute right-3 top-16 z-40 flex max-w-[75vw] items-center gap-2 rounded-full border border-white/15 bg-[#101c16]/95 px-3 py-2 text-xs text-white shadow-lg"><span className="max-w-36 truncate">{session.user?.email || "Conta conectada"}</span><button type="button" disabled={busy} onClick={() => void logout()} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold">Sair</button></div></div>;

  const title = mode === "signup" ? "Criar conta" : mode === "recover" ? "Recuperar senha" : mode === "reset" ? "Nova senha" : "Entrar no Circuito";
  return <main className="grid min-h-dvh place-items-center bg-[#07110c] px-4 py-8 text-white"><section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101c16] p-6 shadow-2xl sm:p-8">
    <div className="mb-7 text-center"><div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[#b8f36b] text-2xl font-black text-[#14200f]">C</div><p className="font-display text-3xl tracking-wider">CIRCUITO</p><p className="mt-1 text-sm text-white/60">{title}</p></div>
    <form onSubmit={submit} className="space-y-4">
      {mode !== "reset" && <label className="block text-sm text-white/75">E-mail<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-base text-white outline-none focus:border-[#b8f36b]" placeholder="seu@email.com" /></label>}
      {mode !== "recover" && <label className="block text-sm text-white/75">{mode === "reset" ? "Nova senha" : "Senha"}<input required minLength={6} type="password" autoComplete={mode === "signup" || mode === "reset" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-base text-white outline-none focus:border-[#b8f36b]" placeholder="Mínimo de 6 caracteres" /></label>}
      {(mode === "signup" || mode === "reset") && <label className="block text-sm text-white/75">Confirmar senha<input required minLength={6} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-base text-white outline-none focus:border-[#b8f36b]" /></label>}
      {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-[#b8f36b]/25 bg-[#b8f36b]/10 p-3 text-sm text-[#d8ffad]">{message}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-[#b8f36b] px-4 py-3.5 font-bold text-[#14200f] hover:bg-[#c9fa88] disabled:opacity-60">{busy ? "Aguarde…" : title}</button>
    </form>
    <div className="mt-5 flex flex-wrap justify-center gap-4 text-sm text-white/65">
      {mode === "login" && <><button type="button" onClick={() => { setMode("signup"); setError(""); setMessage(""); }}>Criar conta</button><button type="button" onClick={() => { setMode("recover"); setError(""); setMessage(""); }}>Esqueci a senha</button></>}
      {mode !== "login" && mode !== "reset" && <button type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Voltar ao login</button>}
      {mode === "reset" && <button type="button" onClick={() => { setMode("login"); setSession(null); save(null); }}>Voltar ao login</button>}
    </div>
    <p className="mt-6 text-center text-xs leading-relaxed text-white/40">Nesta etapa, suas comandas e corridas antigas continuam preservadas neste dispositivo. A sincronização em nuvem será feita separadamente.</p>
  </section></main>;
}
