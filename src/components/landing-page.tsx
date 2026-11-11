import { Route, ClipboardList, Navigation, Gauge, Share2, MapPin, CheckCircle2, ArrowRight } from "lucide-react";

type LandingPageProps = {
  onEnter: () => void;
  onSignup: () => void;
};

export function LandingPage({ onEnter, onSignup }: LandingPageProps) {
  return (
    <div className="min-h-dvh bg-[#0b1410] text-white">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(184,243,107,0.12),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(61,204,122,0.08),transparent_40%)]" />
        <div className="relative mx-auto max-w-5xl px-5 py-6 sm:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#b8f36b] text-[#14200f]">
                <Route className="h-6 w-6" strokeWidth={2.2} />
              </div>
              <div>
                <p className="text-lg font-bold tracking-[0.14em]">ROUTE<span className="text-[#b8f36b]">377</span></p>
                <p className="text-[10px] tracking-[0.16em] text-white/40">ROTAS E ENTREGAS</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onEnter}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
            >
              Entrar
            </button>
          </div>

          <div className="mt-16 max-w-2xl pb-16 sm:mt-24 sm:pb-24">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#b8f36b]/30 bg-[#b8f36b]/10 px-3 py-1 text-xs font-medium text-[#b8f36b]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#b8f36b]" /> GPS inteligente para entregas
            </p>
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Controle suas corridas e comandas em tempo real
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/70 sm:text-xl">
              Route377 organiza suas entregas, calcula rotas, acompanha sua posição ao vivo e registra os quilômetros — tudo no mesmo lugar, no celular ou no navegador.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onSignup}
                className="inline-flex items-center gap-2 rounded-xl bg-[#b8f36b] px-6 py-3.5 text-base font-bold text-[#14200f] transition hover:bg-[#c9fa88]"
              >
                Começar grátis <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onEnter}
                className="rounded-xl border border-white/15 px-6 py-3.5 text-base font-medium transition hover:bg-white/5"
              >
                Já tenho conta
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Demo video */}
      <section className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-2xl">
          <video
            className="w-full aspect-video object-cover"
            autoPlay
            muted
            loop
            playsInline
            poster="/og.jpg"
          >
            <source src="/demo.mp4" type="video/mp4" />
            Seu navegador não suporta vídeo.
          </video>
        </div>
        <p className="mt-4 text-center text-sm text-white/50">
          Veja o Route377 em ação: rotas, comandas e localização ao vivo.
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Tudo o que o entregador precisa</h2>
        <p className="mt-3 max-w-2xl text-white/60">
          Feito para o dia a dia de quem entrega. Sem complicação, com as informações certas na hora certa.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: ClipboardList,
              title: "Comandas",
              desc: "Crie, edite e acompanhe cada pedido. Marque como entregue, cancele ou reabra com um toque.",
            },
            {
              icon: Navigation,
              title: "Rotas inteligentes",
              desc: "Monte a ordem das entregas, veja a rota no mapa e receba orientações enquanto dirige.",
            },
            {
              icon: MapPin,
              title: "Localização ao vivo",
              desc: "Compartilhe sua posição em tempo real com um link. O cliente acompanha sem precisar instalar nada.",
            },
            {
              icon: Gauge,
              title: "Controle de Km",
              desc: "Registre automaticamente a quilometragem do dia, da corrida e o histórico para fechamento.",
            },
            {
              icon: Share2,
              title: "Compartilhamento",
              desc: "Envie um link da corrida para o cliente acompanhar sua posição em tempo real, sem precisar instalar nada.",
            },
            {
              icon: CheckCircle2,
              title: "Pronto para o dia",
              desc: "Funciona offline no dispositivo, sincroniza quando volta a internet e funciona no Android nativo.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/10 bg-[#111d17] p-5 transition hover:border-[#b8f36b]/30"
            >
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[#b8f36b]/15 text-[#b8f36b]">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-white/5 bg-[#0e1914]">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Como funciona</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { step: "01", title: "Crie suas comandas", desc: "Cadastre os pedidos do dia com endereço, cliente e forma de pagamento." },
              { step: "02", title: "Monte a rota", desc: "Organize a ordem das entregas. O Route377 calcula o caminho e acompanha no mapa." },
              { step: "03", title: "Entregue e registre", desc: "Marque as entregas, compartilhe a localização e feche o dia com o km registrado." },
            ].map((item) => (
              <div key={item.step}>
                <p className="font-mono text-sm text-[#b8f36b]">{item.step}</p>
                <h3 className="mt-2 text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-white/60">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-5xl px-5 py-16 text-center sm:px-8 sm:py-24">
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Pronto para organizar suas entregas?</h2>
        <p className="mx-auto mt-4 max-w-lg text-white/60">
          Crie sua conta em segundos e comece a usar hoje mesmo. Seus dados ficam sincronizados e seguros.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onSignup}
            className="inline-flex items-center gap-2 rounded-xl bg-[#b8f36b] px-6 py-3.5 text-base font-bold text-[#14200f] transition hover:bg-[#c9fa88]"
          >
            Criar conta grátis <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onEnter}
            className="rounded-xl border border-white/15 px-6 py-3.5 text-base font-medium transition hover:bg-white/5"
          >
            Entrar
          </button>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-white/40">
        <p>Route377 · Controle de rotas e comandas</p>
        <p className="mt-1">GPS inteligente para quem entrega</p>
      </footer>
    </div>
  );
}
