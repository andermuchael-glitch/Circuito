import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ssrUrl = pathToFileURL(join(root, "node_modules/.nitro/vite/services/ssr/index.js")).href;
const handler = (await import(ssrUrl)).default;
const response = await handler.fetch(new Request("http://localhost/Circuito/"));
const html = (await response.text()).replaceAll("\u0000", "");

if (response.status !== 200 || !html.includes('src="/Circuito/assets/')) {
  console.error("página do GitHub não ficou utilizável", response.status);
  process.exit(1);
}

const out = join(root, ".output/public");
await mkdir(out, { recursive: true });
await writeFile(join(out, "index.html"), html);
const notFound = "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Abrindo acompanhamento — Circuito</title></head><body style=\"margin:0;background:#07110c;color:#e7f0e9;font:16px Arial,sans-serif\"><p>Abrindo o acompanhamento…</p><script>(async function(){var requested=location.pathname+location.search+location.hash;try{var response=await fetch(\"/Circuito/\");if(!response.ok)throw new Error(\"Falha\");var app=await response.text();history.replaceState(null,\"\",requested);document.open();document.write(app);document.close()}catch(error){document.body.textContent=\"Não foi possível abrir o acompanhamento. Verifique sua conexão e tente novamente.\"}})();</script></body></html>";
await writeFile(join(out, "404.html"), notFound);
await writeFile(join(out, ".nojekyll"), "");
console.log("index.html", html.length);
