// Actualiza la biblioteca. Corre en GitHub Actions (Node 20, sin dependencias).
//
//   node scripts/actualizar.mjs           solo procesa enlaces nuevos y portadas faltantes
//   node scripts/actualizar.mjs --todo    vuelve a revisar todos los enlaces
//
// Pasos:
//   1. Lee fuentes/enlaces.txt y fuentes/referencias.json.
//   2. Visita cada fuente y guarda lo que encuentra en datos/metadatos.json
//      (título, autor, fecha, idioma, estado, imagen para compartir, fragmento del texto).
//   3. Actualiza el estado de cada ficha en essays.json. Las fuentes nuevas entran
//      como fichas provisionales (pending: true) hasta que alguien escriba su tema y descripción.
//   4. Descarga a covers/<id>.<ext> las portadas que falten.
//   5. Escribe datos/informe.md con lo que no se pudo resolver.

import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

const TODO = process.argv.includes("--todo");
const UA = "Mozilla/5.0 (compatible; biblioteca-ruth/1.0; +https://github.com/alexandracasillascruz-create/biblioteca-ruth-2026)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- utilidades ----------
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70).replace(/-$/, "");

function idFromUrl(u) {
  const url = new URL(u);
  const host = url.hostname.replace(/^www\./, "");
  const sub = host.endsWith(".substack.com") ? host.split(".")[0] : host.split(".").slice(0, -1).join("-");
  const last = url.pathname.split("/").filter(Boolean).pop() || "";
  return slug(`${sub}-${last}`) || slug(host);
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–", hellip: "…" };
const decode = (s = "") => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e.toLowerCase()] ?? m;
});
const strip = (html = "") => decode(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function meta(html, ...names) {
  for (const n of names) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, "i");
    const m = html.match(re1) || html.match(re2);
    if (m && m[1].trim()) return decode(m[1].trim());
  }
  return null;
}

function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); out.push(...(Array.isArray(j) ? j : j["@graph"] || [j])); } catch {}
  }
  return out;
}

const STOP = {
  en: ["the", "and", "of", "to", "is", "that", "it", "with", "for", "this", "are", "was", "but", "not", "they"],
  es: ["el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "por", "con", "para", "es", "del", "se", "no"],
  pt: ["o", "a", "os", "as", "de", "que", "e", "em", "um", "uma", "por", "com", "para", "é", "do", "da", "não", "uma"],
  fr: ["le", "la", "les", "de", "des", "et", "en", "un", "une", "que", "est", "pour", "dans", "pas", "du"],
};
function language(text = "") {
  const words = text.toLowerCase().match(/[a-záéíóúñãõçêâàü]+/g) || [];
  if (words.length < 20) return null;
  const score = {};
  for (const [k, list] of Object.entries(STOP)) score[k] = words.filter((w) => list.includes(w)).length;
  if (/[ãõ]|ção\b|não\b/.test(text)) score.pt += 6;
  if (/ñ|¿|¡/.test(text)) score.es += 6;
  return Object.entries(score).sort((a, b) => b[1] - a[1])[0][0];
}

async function get(url, { json = false, tries = 3, accept } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: accept || (json ? "application/json" : "text/html,application/xhtml+xml,*/*") },
        redirect: "follow", signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429 || res.status >= 500) { last = { status: res.status }; await sleep(2000 * (i + 1) ** 2); continue; }
      let body;
      if (json) body = res.ok ? await res.json().catch(() => null) : null;
      else {
        const buf = new Uint8Array(await res.arrayBuffer());
        const head = new TextDecoder("latin1").decode(buf.slice(0, 4000));
        const cs = (res.headers.get("content-type") || "").match(/charset=([\w-]+)/i)?.[1] || head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || "utf-8";
        try { body = new TextDecoder(cs.toLowerCase()).decode(buf); } catch { body = new TextDecoder("utf-8").decode(buf); }
      }
      return { status: res.status, url: res.url, body, headers: res.headers };
    } catch (e) { last = { status: 0, error: String(e.message || e) }; await sleep(1500 * (i + 1)); }
  }
  return { status: last?.status ?? 0, error: last?.error, body: null };
}

const PAYWALL_HOSTS = /jstor\.org|academic\.oup\.com|sciencedirect\.com|tandfonline\.com|wiley\.com|springer\.com|cambridge\.org|ft\.com|spectator\.(com|co\.uk)|newstatesman\.com|fortune\.com/;

async function wayback(url) {
  const r = await get(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, { json: true });
  return r.body?.archived_snapshots?.closest?.available ? r.body.archived_snapshots.closest.url.replace(/^http:/, "https:") : null;
}

// ---------- fuentes en línea ----------
const CHALLENGE = /Just a moment\.\.\.|cf-chl|challenge-platform|Attention Required/i;

function substackPreloads(html) {
  const m = html.match(/window\._preloads\s*=\s*JSON\.parse\("((?:[^"\\]|\\.)*)"\)/);
  if (!m) return null;
  try { return JSON.parse(JSON.parse(`"${m[1]}"`))?.post || null; } catch { return null; }
}

function applySubstackPost(m, p) {
  m.substack = true;
  m.titulo = p.title;
  m.subtitulo = p.subtitle || null;
  m.descripcion ||= p.description || null;
  m.fecha = p.post_date || m.fecha;
  m.autor = (p.publishedBylines || []).map((b) => b.name).join(", ") || m.autor;
  m.publicacion ||= p.publishedBylines?.[0]?.publicationUsers?.find((u) => u.publication)?.publication?.name || null;
  m.palabras = p.wordcount || null;
  m.audiencia = p.audience || null;
  m.muro = p.audience === "only_paid" || p.audience === "founding";
  m.imagen = p.cover_image || null; // sin imagen propia, Substack usa el logo: se omite
  if (p.canonical_url) m.canonical = p.canonical_url;
  const body = p.body_html ? strip(p.body_html) : (p.truncated_body_text || "");
  if (body) { m.fragmento = body.slice(0, 1800); m.palabras ||= body.split(/\s+/).length; }
}

function parseHtml(m, html) {
  m.titulo = meta(html, "og:title", "twitter:title") || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "") || null;
  m.publicacion = meta(html, "og:site_name", "application-name");
  m.autor = meta(html, "author", "article:author", "parsely-author", "sailthru.author");
  m.fecha = meta(html, "article:published_time", "datePublished", "date", "dc.date", "citation_publication_date", "citation_date");
  m.descripcion = meta(html, "og:description", "description", "twitter:description");
  m.imagen = meta(html, "og:image", "og:image:url", "twitter:image", "twitter:image:src");
  m.lang_html = html.match(/<html[^>]+lang=["']([a-z-]+)/i)?.[1] || null;
  for (const ld of jsonLd(html)) {
    const t = [].concat(ld["@type"] || []).join(",");
    if (!/Article|Posting|Report|CreativeWork|WebPage/i.test(t)) continue;
    m.autor ||= [].concat(ld.author || []).map((a) => a?.name || a).filter((x) => typeof x === "string" && !/^https?:/.test(x)).join(", ") || null;
    m.fecha ||= ld.datePublished || null;
    if (ld.isAccessibleForFree === false || ld.isAccessibleForFree === "False") m.muro = true;
  }
  const post = substackPreloads(html);
  if (post?.title) applySubstackPost(m, post);
  if (!m.fragmento) {
    const art = html.match(/<article[\s\S]*?<\/article>/i)?.[0] || html;
    const paras = [...art.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((x) => strip(x[1])).filter((t) => t.length > 40);
    const text = paras.join(" ");
    m.fragmento = text.slice(0, 1800);
    m.palabras ||= text ? text.split(/\s+/).length : null;
  }
}

async function substackApi(u) {
  const url = new URL(u);
  const slug = url.pathname.match(/^\/p\/([^/?#]+)/)?.[1];
  const byId = url.pathname.match(/\/post\/p-(\d+)/)?.[1];
  if (!slug && !byId) return null;
  const api = byId ? `https://substack.com/api/v1/posts/by-id/${byId}` : `${url.origin}/api/v1/posts/${slug}`;
  const r = await get(api, { json: true, tries: 2 });
  const p = r.body?.post || r.body;
  return p?.title ? p : null;
}

async function substackRss(u) {
  const url = new URL(u);
  const slug = url.pathname.match(/^\/p\/([^/?#]+)/)?.[1];
  if (!slug) return null;
  const r = await get(`${url.origin}/feed`, { tries: 2 });
  if (r.status !== 200 || typeof r.body !== "string") return null;
  const item = r.body.split("<item>").slice(1).find((it) => it.includes(`/p/${slug}<`) || it.includes(`/p/${slug}?`));
  if (!item) return null;
  const tag = (t) => decode((item.match(new RegExp(`<${t}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${t}>`))?.[1] || "").trim());
  const content = tag("content:encoded");
  return {
    title: tag("title"), subtitle: tag("description"), post_date: new Date(tag("pubDate")).toISOString(),
    publishedBylines: [{ name: tag("dc:creator") }], cover_image: item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] || null,
    body_html: content, audience: /paywall|subscribe to keep reading/i.test(content) && content.length < 4000 ? "only_paid" : "everyone",
  };
}

// ---------- fuentes en línea ----------
async function fromWeb(url) {
  const m = { fuente: url, revisado: new Date().toISOString().slice(0, 10) };
  const host = new URL(url).hostname;

  // Substack: su API da datos limpios y a veces responde aunque la página esté protegida.
  if (/substack\.com$/.test(host) || /^\/p\//.test(new URL(url).pathname)) {
    const p = await substackApi(url);
    if (p) {
      applySubstackPost(m, p);
      m.http = 200; m.via = "api";
      m.enlace_final = m.canonical || url;
      m.idioma = language(`${m.titulo} ${m.fragmento || ""}`);
      m.estado = m.muro ? "paid" : "working";
      return m;
    }
  }

  const page = await get(url);
  m.http = page.status;
  m.enlace_final = page.url || url;
  const html = typeof page.body === "string" ? page.body : "";

  // Página protegida contra robots (Cloudflare): no está rota. Se leen los datos de otra vía.
  if (page.status === 403 && CHALLENGE.test(html)) {
    m.bloqueado = true;
    const rss = await substackRss(url);
    if (rss?.title) { applySubstackPost(m, rss); m.via = "rss"; }
    else {
      const snap = await wayback(url);
      if (snap) {
        const raw = await get(snap.replace(/\/web\/(\d+)\//, "/web/$1id_/"));
        if (raw.status === 200 && typeof raw.body === "string") { parseHtml(m, raw.body); m.via = "wayback"; m.copia = snap; }
      }
    }
    if (!m.titulo || CHALLENGE.test(m.titulo)) { m.titulo = null; m.revisar = "La página bloquea a los robots y no hay copia legible: completar a mano."; }
    m.estado = m.muro ? "paid" : "working";
    m.verificado = false;
    m.idioma = language(`${m.titulo || ""} ${m.fragmento || ""}`) || null;
    return m;
  }

  if (!page.status || page.status === 404 || page.status === 410 || page.status >= 500) {
    m.estado = "broken";
    m.archivo = await wayback(url);
    return m;
  }
  if ([401, 402, 403, 451].includes(page.status)) {
    m.estado = PAYWALL_HOSTS.test(url) ? "paid" : "working";
    m.verificado = false;
    m.revisar = `HTTP ${page.status}: la página bloquea visitas automáticas; confirmar a mano.`;
  }
  parseHtml(m, html);
  m.idioma = language(`${m.titulo || ""} ${m.fragmento || ""}`) || (m.lang_html || "").slice(0, 2) || null;
  if (!m.estado) m.estado = m.muro || (PAYWALL_HOSTS.test(url) && (m.palabras || 0) < 600) ? "paid" : "working";
  return m;
}

// ---------- libros y artículos académicos ----------
async function openLibraryByIsbn(isbn) {
  const r = await get(`https://openlibrary.org/isbn/${isbn}.json`, { json: true });
  if (!r.body) return null;
  const b = r.body;
  let autor = null;
  if (b.authors?.[0]?.key) autor = (await get(`https://openlibrary.org${b.authors[0].key}.json`, { json: true })).body?.name || null;
  let titulo = b.title + (b.subtitle ? `: ${b.subtitle}` : "");
  let cover = b.covers?.find((c) => c > 0);
  if (!cover && b.works?.[0]?.key) cover = (await get(`https://openlibrary.org${b.works[0].key}.json`, { json: true })).body?.covers?.find((c) => c > 0);
  return {
    ol_titulo: titulo, ol_autor: autor, ol_editorial: b.publishers?.[0] || null, ol_fecha: b.publish_date || null,
    ol_paginas: b.number_of_pages || null,
    ol_enlace: b.works?.[0]?.key ? `https://openlibrary.org${b.works[0].key}` : `https://openlibrary.org${b.key}`,
    portada: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`,
  };
}

const norm = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

async function openLibrarySearch({ title, author }) {
  const q = new URLSearchParams({ title, author, limit: "5", fields: "key,title,author_name,first_publish_year,cover_i,number_of_pages_median" });
  const r = await get(`https://openlibrary.org/search.json?${q}`, { json: true });
  const hit = (r.body?.docs || []).find((d) => norm(d.title).startsWith(norm(title).slice(0, 18)));
  if (!hit) return null;
  return {
    ol_titulo: hit.title, ol_autor: hit.author_name?.join(", ") || null, ol_anio: hit.first_publish_year || null,
    ol_paginas: hit.number_of_pages_median || null, ol_enlace: `https://openlibrary.org${hit.key}`,
    portada: hit.cover_i ? `https://covers.openlibrary.org/b/id/${hit.cover_i}-L.jpg` : null,
  };
}

async function crossref(ref) {
  let w = null;
  if (ref.doi) w = (await get(`https://api.crossref.org/works/${encodeURIComponent(ref.doi)}?mailto=noreply@example.org`, { json: true })).body?.message;
  else if (ref.busqueda_crossref) {
    const items = (await get(`https://api.crossref.org/works?rows=5&query.bibliographic=${encodeURIComponent(ref.busqueda_crossref)}&mailto=noreply@example.org`, { json: true })).body?.message?.items || [];
    w = items.find((i) => norm(i.title?.[0]).includes(norm(ref.titulo).slice(0, 20))) || null;
  }
  if (!w) return null;
  return {
    cr_titulo: w.title?.[0] || null,
    cr_autor: (w.author || []).map((a) => [a.given, a.family].filter(Boolean).join(" ")).join(", ") || null,
    cr_revista: w["container-title"]?.[0] || null,
    cr_anio: w.issued?.["date-parts"]?.[0]?.[0] || null,
    cr_paginas: w.page || null,
    doi: w.DOI,
  };
}

async function fromReference(ref) {
  const m = { fuente: ref.enlace || (ref.doi ? `https://doi.org/${ref.doi}` : null), referencia: true, revisado: new Date().toISOString().slice(0, 10) };
  if (ref.isbn) Object.assign(m, (await openLibraryByIsbn(ref.isbn)) || {});
  if (!m.portada && ref.busqueda_openlibrary) Object.assign(m, (await openLibrarySearch(ref.busqueda_openlibrary)) || {});
  if (ref.doi || ref.busqueda_crossref) Object.assign(m, (await crossref(ref)) || {});
  m.fuente ||= m.doi ? `https://doi.org/${m.doi}` : m.ol_enlace || null;
  if (m.fuente) {
    const page = await get(m.fuente);
    m.http = page.status;
    m.enlace_final = page.url || m.fuente;
    const html = typeof page.body === "string" ? page.body : "";
    if (ref.tipo === "articulo") m.imagen = meta(html, "og:image", "twitter:image");
    m.descripcion = meta(html, "og:description", "description", "citation_abstract");
    m.fragmento = strip(html.match(/<(?:section|div)[^>]+(?:abstract|Abstract)[^>]*>([\s\S]{0,6000}?)<\/(?:section|div)>/)?.[1] || "").slice(0, 1500) || null;
    m.titulo_pagina = meta(html, "citation_title", "og:title");
    if (!page.status || page.status === 404 || page.status === 410) { m.estado = "broken"; m.archivo = await wayback(m.fuente); }
    else if ([401, 402, 403].includes(page.status) || PAYWALL_HOSTS.test(m.enlace_final) || ["libro", "capitulo"].includes(ref.tipo)) {
      m.estado = page.status < 400 && /revistas\.ucm\.es|ccru\.net/.test(m.enlace_final) ? "working" : "paid";
      if (page.status >= 400) m.revisar = `HTTP ${page.status}: confirmar a mano.`;
    } else m.estado = "working";
  } else m.estado = "paid";
  return m;
}

// ---------- portadas ----------
function imageSize(buf) {
  const u = new Uint8Array(buf);
  if (u[0] === 0x89 && u[1] === 0x50) return { w: (u[16] << 24) | (u[17] << 16) | (u[18] << 8) | u[19], h: (u[20] << 24) | (u[21] << 16) | (u[22] << 8) | u[23], ext: "png" };
  if (u[0] === 0x47 && u[1] === 0x49) return { w: u[6] | (u[7] << 8), h: u[8] | (u[9] << 8), ext: "gif" };
  if (u[0] === 0x52 && u[8] === 0x57) { // WEBP
    const tag = String.fromCharCode(u[12], u[13], u[14], u[15]);
    if (tag === "VP8X") return { w: 1 + (u[24] | (u[25] << 8) | (u[26] << 16)), h: 1 + (u[27] | (u[28] << 8) | (u[29] << 16)), ext: "webp" };
    if (tag === "VP8 ") return { w: (u[26] | (u[27] << 8)) & 0x3fff, h: (u[28] | (u[29] << 8)) & 0x3fff, ext: "webp" };
    if (tag === "VP8L") { const b = u[21] | (u[22] << 8) | (u[23] << 16) | (u[24] << 24); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, ext: "webp" }; }
  }
  if (u[0] === 0xff && u[1] === 0xd8) {
    let i = 2;
    while (i < u.length) {
      if (u[i] !== 0xff) { i++; continue; }
      const mk = u[i + 1];
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return { h: (u[i + 5] << 8) | u[i + 6], w: (u[i + 7] << 8) | u[i + 8], ext: "jpg" };
      i += 2 + ((u[i + 2] << 8) | u[i + 3]);
    }
    return { w: 0, h: 0, ext: "jpg" };
  }
  return null;
}

const LOGO = /logo|favicon|apple-touch|icon[-_.]|avatar|subscribe-card|reader-share|default[-_]?(og|share|image)|placeholder|brand/i;

async function downloadCover(id, src) {
  if (!src) return { ok: false, motivo: "sin imagen en la fuente" };
  if (LOGO.test(src)) return { ok: false, motivo: "la imagen para compartir es un logo" };
  const res = await fetch(src, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!res || !res.ok) return { ok: false, motivo: `no se pudo descargar (${res?.status ?? "sin respuesta"})` };
  const buf = await res.arrayBuffer();
  const size = imageSize(buf);
  if (!size) return { ok: false, motivo: "el archivo no es una imagen" };
  if (size.w && (size.w < 200 || size.h < 200)) return { ok: false, motivo: `imagen demasiado pequeña (${size.w}×${size.h}), probablemente un logo` };
  if (size.w && size.w === size.h && size.w <= 512) return { ok: false, motivo: `imagen cuadrada de ${size.w}px, probablemente un logo` };
  for (const f of (await readdir("covers")).filter((f) => f.startsWith(id + "."))) await unlink(`covers/${f}`);
  const file = `covers/${id}.${size.ext}`;
  await writeFile(file, Buffer.from(buf));
  return { ok: true, file, w: size.w, h: size.h };
}

// ---------- principal ----------
const LANG_OK = ["en", "es", "pt", "fr"];

async function main() {
  await mkdir("datos", { recursive: true });
  await mkdir("covers", { recursive: true });
  const enlaces = (await readFile("fuentes/enlaces.txt", "utf8")).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const refs = JSON.parse(await readFile("fuentes/referencias.json", "utf8"));
  const metaPath = "datos/metadatos.json";
  const metas = existsSync(metaPath) ? JSON.parse(await readFile(metaPath, "utf8")) : {};
  const lib = JSON.parse(await readFile("essays.json", "utf8"));

  const fuentes = [
    ...enlaces.map((u) => ({ id: idFromUrl(u), url: u })),
    ...refs.map((r) => ({ id: r.id, ref: r })),
  ];
  const vistos = new Set();
  for (const f of fuentes) {
    if (vistos.has(f.id)) continue;
    vistos.add(f.id);
    if (metas[f.id] && !TODO) continue;
    console.log("→", f.id);
    try {
      const nuevo = f.ref ? await fromReference(f.ref) : await fromWeb(f.url);
      const previo = metas[f.id];
      metas[f.id] = nuevo.bloqueado && !nuevo.titulo && previo?.titulo ? { ...previo, revisado: nuevo.revisado, bloqueado: true } : nuevo;
    }
    catch (e) { metas[f.id] = { fuente: f.url || f.ref?.enlace, estado: "broken", error: String(e) }; }
    await writeFile(metaPath, JSON.stringify(metas, null, 2) + "\n");
    await sleep(700);
  }

  // Fichas: actualiza estado y agrega provisionales.
  const byId = new Map(lib.essays.map((e) => [e.id, e]));
  for (const f of fuentes) {
    const m = metas[f.id];
    if (!m) continue;
    const e = byId.get(f.id);
    if (e) {
      if (e.status_manual) continue; // estado fijado a mano en essays.json
      e.status = m.estado;
      if (m.estado === "broken" && m.archivo) e.archive = m.archivo; else if (m.estado !== "broken") delete e.archive;
      continue;
    }
    const r = f.ref || {};
    const lang = LANG_OK.includes(r.idioma || m.idioma) ? (r.idioma || m.idioma) : "en";
    const desc = (m.subtitulo || m.descripcion || "").slice(0, 200);
    const nueva = {
      id: f.id,
      kind: r.tipo === "libro" ? "book" : r.tipo === "capitulo" ? "chapter" : r.tipo === "articulo" ? "paper" : "essay",
      title: r.titulo || m.cr_titulo || m.ol_titulo || m.titulo || f.id,
      author: r.autor || m.cr_autor || m.ol_autor || m.autor || "",
      publication: r.publicacion || m.cr_revista || m.publicacion || new URL(m.enlace_final || m.fuente).hostname.replace(/^www\./, ""),
      year: r.anio || m.cr_anio || m.ol_anio || (m.fecha ? Number(String(m.fecha).slice(0, 4)) : null),
      lang,
      description: { en: desc, es: desc },
      link: m.enlace_final || m.fuente,
      status: m.estado,
      topic: null,
      length: r.paginas || m.ol_paginas ? { pages: r.paginas || m.ol_paginas } : m.palabras ? { words: m.palabras } : {},
      cover: "",
      pending: true,
    };
    if (m.archivo) nueva.archive = m.archivo;
    lib.essays.push(nueva);
    byId.set(f.id, nueva);
  }

  // Portadas.
  const faltantes = [];
  const existentes = new Set(await readdir("covers"));
  for (const e of lib.essays) {
    const m = metas[e.id] || {};
    const actual = [...existentes].find((f) => f.startsWith(e.id + "."));
    if (actual) { e.cover = `covers/${actual}`; continue; }
    if (e.cover_skip) { e.cover = ""; faltantes.push({ id: e.id, titulo: e.title, motivo: e.cover_skip }); continue; }
    const libro = ["book", "chapter"].includes(e.kind);
    const src = libro ? m.portada : m.imagen;
    const r = await downloadCover(e.id, src);
    if (r.ok) { e.cover = r.file; console.log("  portada", r.file, `${r.w}×${r.h}`); }
    else { e.cover = ""; faltantes.push({ id: e.id, titulo: e.title, motivo: (libro ? "Open Library: " : "") + r.motivo }); }
    await sleep(300);
  }

  lib.updated = new Date().toISOString().slice(0, 10);
  await writeFile("essays.json", JSON.stringify(lib, null, 2) + "\n");

  // Informe.
  const rotos = lib.essays.filter((e) => e.status === "broken");
  const pendientes = lib.essays.filter((e) => e.pending);
  const revisar = Object.entries(metas).filter(([, m]) => m.revisar);
  const md = [
    `# Informe de la biblioteca (${lib.updated})`, "",
    `Fichas: ${lib.essays.length}. Pendientes de tema y descripción: ${pendientes.length}.`, "",
    "## Enlaces rotos", "",
    ...(rotos.length ? rotos.map((e) => `- **${e.title}** — ${e.link}${e.archive ? ` → copia en Wayback: ${e.archive}` : " → **sin copia encontrada**"}`) : ["Ninguno."]), "",
    "## Para confirmar a mano", "",
    ...(revisar.length ? revisar.map(([id, m]) => `- \`${id}\` (${m.fuente}): ${m.revisar}`) : ["Nada."]), "",
    "## Sin portada", "",
    ...(faltantes.length ? faltantes.map((f) => `- **${f.titulo}** (\`${f.id}\`): ${f.motivo}`) : ["Todas tienen portada."]), "",
    "## Fichas provisionales", "",
    ...(pendientes.length ? pendientes.map((e) => `- \`${e.id}\` — ${e.title}`) : ["Ninguna."]), "",
  ].join("\n");
  await writeFile("datos/informe.md", md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
