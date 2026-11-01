// Arma la carpeta dist/ con lo que necesita el sitio publicado (Cloudflare Pages).
// El sitio no tiene dependencias: solo se copian los archivos públicos.
import { rm, mkdir, cp, readdir, stat } from "node:fs/promises";

const PUBLIC = ["index.html", "essays.json", "assets", "covers"];
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
for (const p of PUBLIC) await cp(p, `dist/${p}`, { recursive: true, filter: (src) => !src.endsWith(".gitkeep") });

let files = 0, bytes = 0;
async function count(dir) {
  for (const f of await readdir(dir)) {
    const s = await stat(`${dir}/${f}`);
    if (s.isDirectory()) await count(`${dir}/${f}`); else { files++; bytes += s.size; }
  }
}
await count("dist");
console.log(`dist/ listo: ${files} archivos, ${(bytes / 1e6).toFixed(1)} MB`);
