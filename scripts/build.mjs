// Arma el sitio publicable en dist/ (Cloudflare Pages: npm run build → dist).
// No hay nada que compilar: se copian los archivos que el sitio necesita.
import { rm, mkdir, cp, readdir } from "node:fs/promises";

const OUT = "dist";
const ENTRIES = ["index.html", "assets", "essays.json", "covers"];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const e of ENTRIES) await cp(e, `${OUT}/${e}`, { recursive: true });
const covers = (await readdir(`${OUT}/covers`)).filter((f) => !f.startsWith("."));
console.log(`dist/ listo: ${ENTRIES.join(", ")} (${covers.length} portadas)`);
