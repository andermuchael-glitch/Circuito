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
await writeFile(join(out, "404.html"), html);
await writeFile(join(out, ".nojekyll"), "");
console.log("index.html", html.length);
