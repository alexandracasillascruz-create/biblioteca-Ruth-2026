// Biblioteca de Ruth: estante giratorio, filtros por tema, "Sorpréndeme" y versión bilingüe.
// Los datos viven en essays.json; para agregar lecturas no hace falta tocar este archivo.
import { Shelf } from "./shelf.js";

// Tonos de encuadernación: profundos y apagados, con tinta clara u oscura según el fondo.
const PALETTE = [
  ["#6B2A2A", "#4A1D1D", "#EFE4D2"], // vino
  ["#4A3048", "#332132", "#ECE2D2"], // ciruela
  ["#2F4A3A", "#213428", "#E9E2CE"], // bosque
  ["#2B5558", "#1E3C3F", "#EAE3D0"], // petróleo
  ["#9C4F31", "#743A24", "#F3E8D6"], // terracota
  ["#B08A3E", "#86682D", "#1F1A11"], // ocre
  ["#E3D9C4", "#C8BDA5", "#2A2620"], // hueso
  ["#25324A", "#182236", "#E7DFCB"], // azul tinta
  ["#2C2B29", "#1C1B1A", "#E4DAC6"], // carbón
  ["#A87B6F", "#86605A", "#1F1715"], // rosa viejo
  ["#5E6B4A", "#444F35", "#ECE5D2"], // oliva
];
const PATTERNS = ["band", "plain", "split", "band", "plain"];
const TOPIC_COLORS = ["#FF5FA2", "#FFD23F", "#3DDC97", "#FF8A3D", "#8C98FF", "#B98AFF", "#FF6B7D", "#33C7F0", "#F4F2EC"];

const UI = {
  es: {
    title: "Biblioteca de Ruth", lede: "Ensayos, artículos y libros que he leído y recomiendo.",
    surprise: "Sorpréndeme", asList: "Ver como lista", asShelf: "Ver el estante", all: "Todo",
    hint: "Arrastra para girar el estante. Toca un libro para abrirlo.", unsorted: "Sin clasificar",
    read: "Leer", archived: "Leer la copia archivada", close: "Cerrar", topics: "Temas", shelf: "Estante",
    srShelf: "Libros en el estante",
    count: (n, t) => `${n} lecturas en ${t} temas.`, updated: (d) => `Actualizado el ${d}.`,
    kind: { essay: "Ensayo", book: "Libro", chapter: "Capítulo de libro", paper: "Artículo académico", data: "Datos e indicadores" },
    status: { working: ["Acceso libre", ""], paid: ["De pago", "Puede requerir suscripción o compra."], broken: ["Enlace roto", "El original ya no está en línea."] },
    langName: { en: "Inglés", es: "Español", pt: "Portugués", fr: "Francés" },
    minutes: (m) => `${m} min de lectura`, pages: (p) => `${p} páginas`,
    noGL: "Tu navegador no puede mostrar el estante en 3D; aquí tienes la lista.",
  },
  en: {
    title: "Ruth's Library", lede: "Essays, articles and books I've read and recommend.",
    surprise: "Surprise me", asList: "View as list", asShelf: "View the shelf", all: "All",
    hint: "Drag to spin the shelf. Tap a book to open it.", unsorted: "Unsorted",
    read: "Read", archived: "Read the archived copy", close: "Close", topics: "Topics", shelf: "Shelf",
    srShelf: "Books on the shelf",
    count: (n, t) => `${n} reads across ${t} topics.`, updated: (d) => `Updated ${d}.`,
    kind: { essay: "Essay", book: "Book", chapter: "Book chapter", paper: "Academic paper", data: "Data and indicators" },
    status: { working: ["Free to read", ""], paid: ["Paywalled", "May require a subscription or purchase."], broken: ["Broken link", "The original is no longer online."] },
    langName: { en: "English", es: "Spanish", pt: "Portuguese", fr: "French" },
    minutes: (m) => `${m} min read`, pages: (p) => `${p} pages`,
    noGL: "Your browser can't show the 3D shelf, so here is the list.",
  },
};

const $ = (s, el = document) => el.querySelector(s);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

let lang = store.get("lang") || ((navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en");
let data, books = [], topics = [], activeTopic = "all", shelf = null;

// Etiqueta de idioma: solo cuando el texto está en un idioma distinto al de la página.
const tag = (b) => (b.lang && b.lang !== lang ? ` [${UI[lang].langName[b.lang] || b.lang}]` : "");
const titleWithTag = (b) => b.title + tag(b);
const words = (b) => b.length?.words || (b.length?.pages ? b.length.pages * 300 : null);

function look(b) {
  const h = hash(b.id);
  const [c, c2, ink] = PALETTE[(h >>> 3) % PALETTE.length];
  const w = words(b);
  // Grosor según extensión, en escala logarítmica: 800 palabras → 20, 120 000 → 54.
  const t = w ? Math.round(20 + 34 * Math.max(0, Math.min(1, (Math.log10(w) - 2.9) / (5.08 - 2.9)))) : 32;
  return { c, c2, ink, pattern: PATTERNS[(h >>> 11) % PATTERNS.length], t, h: 165 + (h % 70) };
}

const inTopic = (b, id) => id === "all" || (b.topic || "_") === id;

// ---------- temas ----------
function renderTopics() {
  const nav = $("#topics");
  nav.setAttribute("aria-label", UI[lang].topics);
  const counts = {};
  for (const b of books) counts[b.topic || "_"] = (counts[b.topic || "_"] || 0) + 1;
  const list = [{ id: "all", label: UI[lang].all, n: books.length, color: "#F4F2EC" },
    ...topics.map((t, i) => ({ id: t.id, label: t[lang] || t.es || t.en, n: counts[t.id] || 0, color: t.color || TOPIC_COLORS[i % TOPIC_COLORS.length] }))];
  if (counts._) list.push({ id: "_", label: UI[lang].unsorted, n: counts._, color: "#9b9b9b" });
  nav.innerHTML = "";
  for (const t of list) {
    if (!t.n) continue;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "topic";
        btn.setAttribute("aria-pressed", String(activeTopic === t.id));
    btn.innerHTML = `${esc(t.label)}<small>${t.n}</small>`;
    btn.addEventListener("click", () => chooseTopic(t.id));
    nav.appendChild(btn);
  }
}

function chooseTopic(id) {
  if (id === activeTopic && id !== "all") id = "all";
  activeTopic = id;
  renderTopics();
  renderList();
  renderSr();
  if (shelf) { shelf.pullOut(null); shelf.setVisible((b) => inTopic(b, id)); }
}

// ---------- lector (libro abierto) ----------
let lastFocus = null;
function openBook(b) {
  lastFocus = document.activeElement;
  if (shelf) { shelf.turnTo(b); shelf.pullOut(b); }
  const T = UI[lang];
  const spread = $(".spread");
  spread.style.setProperty("--c", b.c); spread.style.setProperty("--ink", b.ink);
  const cover = $("#readerCover");
  cover.style.setProperty("--c", b.c2); cover.style.setProperty("--ink", b.ink);
  const fake = `<div class="fake" style="--c:${b.c};--ink:${b.ink}"><b>${esc(b.title)}</b><span>${esc(b.author || "")}</span></div>`;
  cover.innerHTML = b.cover ? `<img src="${esc(b.cover)}" alt="">` : fake;
  const img = $("img", cover);
  if (img) img.onerror = () => { cover.innerHTML = fake; };
  const len = words(b);
  const extra = b.length?.pages ? T.pages(b.length.pages) : len ? T.minutes(Math.max(1, Math.round(len / 230))) : "";
  $("#readerKind").textContent = [T.kind[b.kind] || T.kind.essay, extra].filter(Boolean).join(", ");
  $("#readerTitle").innerHTML = `${esc(b.title)}${tag(b) ? ` <span class="tag">${esc(tag(b).trim())}</span>` : ""}`;
  $("#readerByline").textContent = [b.author, b.publication, b.year].filter(Boolean).join(", ");
  $("#readerDesc").textContent = b.description?.[lang] || b.description?.[lang === "es" ? "en" : "es"] || "";
  const [label, note] = T.status[b.status] || T.status.working;
  const st = $("#readerStatus");
  st.className = `status st-${b.status || "working"}`;
  st.innerHTML = `<b>${esc(label)}</b>${esc(note)}`;
  const actions = [];
  if (b.status !== "broken" && b.link) actions.push(`<a href="${esc(b.link)}" target="_blank" rel="noopener">${esc(T.read)}</a>`);
  if (b.archive) actions.push(`<a href="${esc(b.archive)}" target="_blank" rel="noopener" class="${b.status === "broken" ? "" : "secondary"}">${esc(T.archived)}</a>`);
  $("#readerActions").innerHTML = actions.join("");
  $(".close").setAttribute("aria-label", T.close);
  $("#reader").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $(".close").focus(), 50);
}

function closeBook() {
  $("#reader").hidden = true;
  document.body.style.overflow = "";
  if (shelf) { shelf.pullOut(null); shelf.resumeSoon(1500); }
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}

function surprise() {
  const pool = books.filter((b) => inTopic(b, activeTopic));
  if (!pool.length) return;
  const b = pool[Math.floor(Math.random() * pool.length)];
  if (!shelf || !$("#list").hidden) { openBook(b); return; }
  shelf.turnTo(b);
  shelf.pullOut(b);
  setTimeout(() => openBook(b), reduceMotion ? 0 : 1100);
}

// ---------- lista ----------
function renderList() {
  const T = UI[lang];
  const groups = [...topics.map((t, i) => ({ id: t.id, label: t[lang] || t.es, color: t.color || TOPIC_COLORS[i % TOPIC_COLORS.length] })), { id: "_", label: T.unsorted, color: "#9b9b9b" }];
  const list = $("#list");
  list.innerHTML = "";
  for (const g of groups) {
    if (activeTopic !== "all" && activeTopic !== g.id) continue;
    const items = books.filter((b) => (b.topic || "_") === g.id).sort((a, b) => a.title.localeCompare(b.title, lang));
    if (!items.length) continue;
    const h = document.createElement("h2"); h.textContent = g.label;
    const ol = document.createElement("ol");
    for (const b of items) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button"; btn.style.setProperty("--c", b.c);
      btn.innerHTML = `<span class="lt">${esc(titleWithTag(b))}</span><span class="lb">${esc([b.author, b.publication, b.year].filter(Boolean).join(", "))}</span><span class="ld">${esc(b.description?.[lang] || "")}</span>`;
      btn.addEventListener("click", () => openBook(b));
      li.appendChild(btn); ol.appendChild(li);
    }
    list.append(h, ol);
  }
}

// Botones invisibles para recorrer el estante con el teclado o un lector de pantalla.
function renderSr() {
  const box = $("#srBooks");
  box.setAttribute("aria-label", UI[lang].srShelf);
  box.innerHTML = "";
  for (const b of books) {
    if (!inTopic(b, activeTopic)) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${titleWithTag(b)}${b.author ? ", " + b.author : ""}`;
    btn.addEventListener("focus", () => {
      if (shelf) { shelf.turnTo(b); shelf.pullOut(b); }
      const hint = $("#hint"); hint.textContent = btn.textContent; hint.classList.add("focus");
    });
    btn.addEventListener("blur", () => {
      if (shelf && $("#reader").hidden) shelf.pullOut(null);
      const hint = $("#hint"); hint.textContent = UI[lang].hint; hint.classList.remove("focus");
    });
    btn.addEventListener("click", () => openBook(b));
    box.appendChild(btn);
  }
}

// ---------- idioma ----------
function applyLang() {
  const T = UI[lang];
  document.documentElement.lang = lang;
  document.title = T.title;
  document.querySelectorAll("[data-i18n]").forEach((n) => { const v = T[n.dataset.i18n]; if (typeof v === "string") n.textContent = v; });
  $("#viewToggle").textContent = $("#list").hidden ? T.asList : T.asShelf;
  $("#scene").setAttribute("aria-label", T.shelf);
  document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  const shown = new Set(books.map((e) => e.topic || "_"));
  $("#count").textContent = `${T.count(books.length, shown.size)} ${data.updated ? T.updated(data.updated) : ""}`;
  renderTopics(); renderList(); renderSr();
}

function showList(toList) {
  $("#list").hidden = !toList; $("#scene").hidden = toList;
  $("#viewToggle").setAttribute("aria-pressed", String(toList));
  $("#viewToggle").textContent = toList ? UI[lang].asShelf : UI[lang].asList;
  if (!toList && shelf) shelf.resize();
}

// ---------- inicio ----------
async function init() {
  data = await fetch("essays.json", { cache: "no-cache" }).then((r) => r.json());
  topics = data.topics || [];
  // Las fichas que la Action aún no pudo leer (sin título) no se muestran.
  books = data.essays.filter((e) => e.title && e.title !== e.id).map((b) => ({ ...b, ...look(b) }));
  applyLang();

  // Espera las fuentes para pintar los lomos con la tipografía correcta.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('800 24px "Big Shoulders Display"'), document.fonts.load('700 16px "Big Shoulders Display"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {}
  try {
    shelf = new Shelf($("#shelfCanvas"), books, { reduceMotion, onOpen: openBook });
  } catch (e) {
    console.warn(e);
    showList(true);
    $("#viewToggle").hidden = true;
    $("#list").insertAdjacentHTML("afterbegin", `<p class="nogl">${esc(UI[lang].noGL)}</p>`);
  }

  $("#surprise").addEventListener("click", surprise);
  $("#viewToggle").addEventListener("click", () => showList($("#list").hidden));
  document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => { lang = b.dataset.lang; store.set("lang", lang); applyLang(); }));
  $("#reader").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeBook(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#reader").hidden) closeBook();
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && $("#reader").hidden && shelf && !$("#scene").hidden && document.activeElement?.closest?.(".topics, .controls") == null) {
      shelf.nudge(e.key === "ArrowLeft" ? 18 : -18);
    }
  });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => shelf && shelf.resize(), 120); });
}

init().catch((e) => { console.error(e); document.body.insertAdjacentHTML("beforeend", `<p style="padding:24px">No se pudo cargar essays.json (${esc(e.message)}).</p>`); });
