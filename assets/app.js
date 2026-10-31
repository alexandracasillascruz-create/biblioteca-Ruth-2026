// Biblioteca de Ruth: un estante cilíndrico que gira, con filtros por tema.
// Los datos viven en essays.json; este archivo no necesita cambios para agregar lecturas.

const PALETTE = [
  ["#FF5FA2", "#B8326F", "#1a0010"], ["#FFD23F", "#D9A300", "#2a1d00"], ["#3DDC97", "#12925C", "#00210f"],
  ["#FF8A3D", "#C9561A", "#2a0f00"], ["#5B6CFF", "#2F3BC2", "#ffffff"], ["#A05BFF", "#6A2BC4", "#ffffff"],
  ["#E8384F", "#9E1427", "#ffffff"], ["#33C7F0", "#1484A8", "#001e29"],
];
const PATTERNS = ["p-stripes", "p-band", "p-dots", "p-plain", "p-split"];
const TOPIC_COLORS = ["#FF5FA2", "#FFD23F", "#3DDC97", "#FF8A3D", "#8C98FF", "#B98AFF", "#FF6B7D", "#33C7F0", "#F4F2EC"];

const UI = {
  es: {
    title: "Biblioteca de Ruth", lede: "Ensayos, artículos y libros que he leído y recomiendo.",
    surprise: "Sorpréndeme", asList: "Ver como lista", asShelf: "Ver el estante", all: "Todo",
    hint: "Arrastra para girar el estante. Toca un libro para abrirlo.", unsorted: "Sin clasificar",
    read: "Leer", archived: "Leer la copia archivada", close: "Cerrar", topics: "Temas", shelf: "Estante",
    count: (n, t) => `${n} lecturas en ${t} temas.`, updated: (d) => `Actualizado el ${d}.`,
    kind: { essay: "Ensayo", book: "Libro", chapter: "Capítulo de libro", paper: "Artículo académico", data: "Datos e indicadores" },
    status: { working: ["Acceso libre", ""], paid: ["De pago", "Puede requerir suscripción o compra."], broken: ["Enlace roto", "El original ya no está en línea."] },
    langName: { en: "Inglés", es: "Español", pt: "Portugués", fr: "Francés" },
    minutes: (m) => `${m} min de lectura`, pages: (p) => `${p} páginas`,
  },
  en: {
    title: "Ruth's Library", lede: "Essays, articles and books I've read and recommend.",
    surprise: "Surprise me", asList: "View as list", asShelf: "View the shelf", all: "All",
    hint: "Drag to spin the shelf. Tap a book to open it.", unsorted: "Unsorted",
    read: "Read", archived: "Read the archived copy", close: "Close", topics: "Topics", shelf: "Shelf",
    count: (n, t) => `${n} reads across ${t} topics.`, updated: (d) => `Updated ${d}.`,
    kind: { essay: "Essay", book: "Book", chapter: "Book chapter", paper: "Academic paper", data: "Data and indicators" },
    status: { working: ["Free to read", ""], paid: ["Paywalled", "May require a subscription or purchase."], broken: ["Broken link", "The original is no longer online."] },
    langName: { en: "English", es: "Spanish", pt: "Portuguese", fr: "French" },
    minutes: (m) => `${m} min read`, pages: (p) => `${p} pages`,
  },
};

const $ = (s, el = document) => el.querySelector(s);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

let lang = store.get("lang") || ((navigator.language || "es").toLowerCase().startsWith("es") ? "es" : "en");
let data, books = [], topics = [], activeTopic = "all", angle = 0, velocity = 0.045, autoSpin = true;
let geometry = { R: 400, tiers: 1, tierH: 260 };

function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Etiqueta de idioma: solo cuando el texto está en un idioma distinto al de la página.
const tag = (b) => (b.lang && b.lang !== lang ? ` [${UI[lang].langName[b.lang] || b.lang}]` : "");
const titleWithTag = (b) => b.title + tag(b);

function words(b) {
  if (b.length?.words) return b.length.words;
  if (b.length?.pages) return b.length.pages * 300;
  return null;
}

function look(b) {
  const h = hash(b.id);
  const [c, c2, ink] = PALETTE[(h >>> 3) % PALETTE.length];
  const w = words(b);
  // Grosor según extensión (escala logarítmica: 800 palabras → 16px, 120 000 → 50px).
  const t = w ? Math.round(16 + 34 * Math.max(0, Math.min(1, (Math.log10(w) - 2.9) / (5.08 - 2.9)))) : 28;
  return { c, c2, ink, pattern: PATTERNS[(h >>> 11) % PATTERNS.length], t, h: 150 + (h % 66) };
}

function fit(node, start, min) {
  let fs = start; node.style.fontSize = fs + "px";
  while ((node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1) && fs > min) { fs -= 0.5; node.style.fontSize = fs + "px"; }
}

// ---------- construcción ----------
function buildBooks() {
  const carousel = $("#carousel");
  for (const b of data.essays) {
    const L = look(b);
    const slot = document.createElement("div");
    slot.className = "slot";
    const el = document.createElement("div");
    el.className = `book ${L.pattern}`;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.style.cssText = `--t:${L.t}px;--h:${L.h}px;--c:${L.c};--c2:${L.c2};--ink:${L.ink}`;
    el.innerHTML = `<div class="face cap"></div><div class="face side l"></div><div class="face side r"></div>
      <div class="face spine"><span class="t"></span><span class="a"></span></div>`;
    $(".t", el).textContent = b.title;
    $(".a", el).textContent = b.author || b.publication || "";
    slot.appendChild(el);
    carousel.appendChild(slot);
    const book = { ...b, ...L, slot, el, visible: true };
    el.addEventListener("click", (e) => { if (!dragMoved) openBook(book); });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBook(book); } });
    el.addEventListener("focus", () => { if (!book.visible) return; autoSpin = false; turnTo(book); });
    books.push(book);
  }
  // Ajusta el tamaño del texto de cada lomo cuando ya están en el DOM.
  requestAnimationFrame(() => {
    for (const b of books) {
      fit($(".t", b.el), Math.min(b.t * 0.56, 22), 7);
      fit($(".a", b.el), Math.min(Math.max(b.t * 0.42, 11), 15), 9);
    }
  });
}

function layout() {
  const vis = books.filter((b) => b.visible);
  const scene = $("#scene");
  const vw = scene.clientWidth, vh = scene.clientHeight;
  const gap = 3;
  const total = vis.reduce((s, b) => s + b.t + gap, 0);
  const maxH = Math.max(...books.map((b) => b.h));
  const tierH = maxH + 40;
  const Rmax = 430, Rmin = 170;
  let tiers = Math.max(1, Math.ceil(total / (2 * Math.PI * Rmax)));
  let R = Math.max(Rmin, Math.min(Rmax, total / tiers / (2 * Math.PI) + 8));
  const H = tiers * tierH;
  geometry = { R, tiers, tierH, H };

  // Reparte los libros visibles en anillos, de arriba abajo.
  const perTier = Array.from({ length: tiers }, () => []);
  let acc = 0, tier = 0;
  const cap = total / tiers;
  for (const b of vis) { if (acc > cap * (tier + 1) && tier < tiers - 1) tier++; perTier[tier].push(b); acc += b.t + gap; }

  perTier.forEach((row, k) => {
    const rowTotal = row.reduce((s, b) => s + b.t + gap, 0);
    const circ = 2 * Math.PI * R;
    const spare = Math.max(0, circ - rowTotal) / Math.max(1, row.length);
    const y = -H / 2 + (k + 1) * tierH - 14;
    let x = k * 37; // desfase entre anillos para que no se alineen
    for (const b of row) {
      const theta = ((x + b.t / 2) / circ) * 360;
      b.theta = theta; b.y = y;
      b.slot.style.transform = `translateY(${y}px) rotateY(${theta}deg) translateZ(${R}px)`;
      x += b.t + gap + spare;
    }
  });

  const carousel = $("#carousel");
  carousel.style.setProperty("--R", R + "px");
  carousel.style.setProperty("--H", H + "px");
  // Repisas
  carousel.querySelectorAll(".disc").forEach((d) => d.remove());
  for (let k = 1; k <= tiers; k++) {
    const d = document.createElement("div");
    d.className = "disc";
    d.style.setProperty("--y", (-H / 2 + k * tierH - 14) + "px");
    carousel.appendChild(d);
  }
  // Escala para que el estante quepa en pantalla.
  // La perspectiva agranda la parte delantera del cilindro: se compensa.
  const mag = 1700 / (1700 - R);
  const needW = 2 * (R + 40) * mag, needH = (H + 60) * mag;
  const fitScale = Math.min(1, (vw * 0.94) / needW, (vh * 0.9) / needH);
  $("#rig").style.setProperty("--fit", fitScale.toFixed(3));
}

function buildCore() {
  const core = $("#core");
  core.innerHTML = "";
  for (let i = 0; i < 24; i++) { const p = document.createElement("i"); p.style.setProperty("--a", i * 15 + "deg"); core.appendChild(p); }
}

// ---------- giro ----------
let last = performance.now(), dragMoved = false, target = null;
function tick(now) {
  const dt = Math.min(64, now - last); last = now;
  if (target !== null) {
    const diff = ((target - angle + 540) % 360) - 180;
    angle += diff * Math.min(1, dt / 180);
    if (Math.abs(diff) < 0.15) { angle = target; target = null; }
  } else if (autoSpin && !reduceMotion) {
    angle -= velocity * dt * 0.06;
  } else if (Math.abs(spinV) > 0.001) {
    angle += spinV * dt; spinV *= Math.pow(0.94, dt / 16);
  }
  $("#carousel").style.transform = `rotateY(${angle}deg)`;
  requestAnimationFrame(tick);
}

let spinV = 0;
function setupDrag() {
  const scene = $("#scene");
  let startX = 0, startAngle = 0, lastX = 0, lastT = 0, down = false;
  scene.addEventListener("pointerdown", (e) => {
    down = true; dragMoved = false; startX = lastX = e.clientX; lastT = performance.now(); startAngle = angle; target = null;
  });
  window.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) { dragMoved = true; autoSpin = false; scene.classList.add("dragging"); }
    if (!dragMoved) return;
    angle = startAngle + dx * 0.25;
    const now = performance.now();
    spinV = ((e.clientX - lastX) * 0.25) / Math.max(1, now - lastT);
    lastX = e.clientX; lastT = now;
  });
  window.addEventListener("pointerup", () => {
    if (!down) return; down = false; scene.classList.remove("dragging");
    if (dragMoved) setTimeout(() => { dragMoved = false; autoSpin = true; }, 2500);
  });
}

function turnTo(b) { target = -b.theta; }

// ---------- temas ----------
function renderTopics() {
  const nav = $("#topics");
  nav.setAttribute("aria-label", UI[lang].topics);
  const counts = {};
  for (const b of data.essays) counts[b.topic || "_"] = (counts[b.topic || "_"] || 0) + 1;
  const list = [{ id: "all", label: UI[lang].all, n: data.essays.length, color: "#F4F2EC" },
    ...topics.map((t, i) => ({ id: t.id, label: t[lang] || t.es || t.en, n: counts[t.id] || 0, color: TOPIC_COLORS[i % TOPIC_COLORS.length] }))];
  if (counts._) list.push({ id: "_", label: UI[lang].unsorted, n: counts._, color: "#9b9b9b" });
  nav.innerHTML = "";
  for (const t of list) {
    if (!t.n) continue;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "topic";
    btn.style.setProperty("--c", t.color);
    btn.setAttribute("aria-pressed", String(activeTopic === t.id));
    btn.innerHTML = `${esc(t.label)}<small>${t.n}</small>`;
    btn.addEventListener("click", () => chooseTopic(t.id));
    nav.appendChild(btn);
  }
}

const inTopic = (b, id) => id === "all" || (b.topic || "_") === id;

function chooseTopic(id) {
  if (id === activeTopic && id !== "all") id = "all";
  activeTopic = id;
  renderTopics();
  renderList();
  const leaving = books.filter((b) => b.visible && !inTopic(b, id));
  const coming = books.filter((b) => !b.visible && inTopic(b, id));

  // Los que no son del tema se caen del estante.
  for (const b of leaving) {
    b.visible = false;
    b.el.tabIndex = -1;
    if (reduceMotion) { b.slot.hidden = true; continue; }
    const spin = (hash(b.id) % 2 ? 1 : -1) * (40 + (hash(b.id) % 70));
    const delay = Math.random() * 200;
    const a = b.el.animate([
      { transform: "none" },
      { transform: `translateZ(26px) rotateX(-14deg)`, offset: 0.22 },
      { transform: `translate3d(${spin / 3}px, 1500px, 160px) rotateX(-80deg) rotateZ(${spin}deg)` },
    ], { duration: 1000, delay, easing: "cubic-bezier(.5,0,.9,.55)", fill: "forwards" });
    a.onfinish = () => { if (!b.visible) b.slot.hidden = true; a.cancel(); };
  }
  // Reacomoda cuando ya cayeron; los que vuelven bajan desde arriba.
  setTimeout(() => {
    for (const b of coming) { b.visible = true; b.slot.hidden = false; b.el.tabIndex = 0; }
    layout();
    if (!reduceMotion) for (const b of coming) {
      b.el.animate([{ transform: "translateY(-900px)", opacity: 0 }, { transform: "translateY(10px)", opacity: 1, offset: 0.8 }, { transform: "none", opacity: 1 }],
        { duration: 900, delay: Math.random() * 400, easing: "cubic-bezier(.3,.6,.4,1)", fill: "backwards" });
    }
  }, leaving.length && !reduceMotion ? 1250 : 0);
}

// ---------- lector ----------
let lastFocus = null;
function openBook(b) {
  lastFocus = document.activeElement;
  autoSpin = false;
  turnTo(b);
  books.forEach((x) => x.el.classList.remove("pulled"));
  b.el.classList.add("pulled");
  const T = UI[lang];
  const reader = $("#reader");
  const spread = $(".spread", reader);
  spread.style.setProperty("--c", b.c); spread.style.setProperty("--ink", b.ink);
  const cover = $("#readerCover");
  cover.style.setProperty("--c", b.c2); cover.style.setProperty("--ink", b.ink);
  cover.innerHTML = b.cover
    ? `<img src="${esc(b.cover)}" alt="" loading="eager">`
    : `<div class="fake" style="--c:${b.c};--ink:${b.ink}"><b>${esc(b.title)}</b><span>${esc(b.author || "")}</span></div>`;
  const img = $("img", cover);
  if (img) img.onerror = () => { cover.innerHTML = `<div class="fake" style="--c:${b.c};--ink:${b.ink}"><b>${esc(b.title)}</b><span>${esc(b.author || "")}</span></div>`; };

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
  $(".close", reader).setAttribute("aria-label", T.close);
  reader.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $(".close", reader).focus(), 50);
}

function closeBook() {
  $("#reader").hidden = true;
  document.body.style.overflow = "";
  books.forEach((x) => x.el.classList.remove("pulled"));
  setTimeout(() => { autoSpin = true; }, 1500);
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}

function surprise() {
  const pool = books.filter((b) => b.visible);
  if (!pool.length) return;
  const b = pool[Math.floor(Math.random() * pool.length)];
  if (!$("#list").hidden) { openBook(b); return; }
  autoSpin = false;
  turnTo(b);
  b.el.classList.add("pulled");
  setTimeout(() => openBook(b), reduceMotion ? 0 : 900);
}

// ---------- lista ----------
function renderList() {
  const T = UI[lang];
  const groups = [...topics.map((t, i) => ({ id: t.id, label: t[lang] || t.es, color: TOPIC_COLORS[i % TOPIC_COLORS.length] })), { id: "_", label: T.unsorted, color: "#9b9b9b" }];
  const list = $("#list");
  list.innerHTML = "";
  for (const g of groups) {
    if (activeTopic !== "all" && activeTopic !== g.id) continue;
    const items = books.filter((b) => (b.topic || "_") === g.id).sort((a, b) => a.title.localeCompare(b.title, lang));
    if (!items.length) continue;
    const h = document.createElement("h2"); h.textContent = g.label; h.style.setProperty("--c", g.color);
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

// ---------- idioma ----------
function applyLang() {
  const T = UI[lang];
  document.documentElement.lang = lang;
  document.title = T.title;
  document.querySelectorAll("[data-i18n]").forEach((n) => { const v = T[n.dataset.i18n]; if (typeof v === "string") n.textContent = v; });
  $("#viewToggle").textContent = $("#list").hidden ? T.asList : T.asShelf;
  $("#scene").setAttribute("aria-label", T.shelf);
  document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  for (const b of books) { b.el.setAttribute("aria-label", `${titleWithTag(b)}${b.author ? ", " + b.author : ""}`); b.el.title = titleWithTag(b); }
  const shown = new Set(data.essays.map((e) => e.topic || "_"));
  $("#count").textContent = `${T.count(data.essays.length, shown.size)} ${data.updated ? T.updated(data.updated) : ""}`;
  renderTopics();
  renderList();
}

// ---------- inicio ----------
async function init() {
  data = await fetch("essays.json", { cache: "no-cache" }).then((r) => r.json());
  topics = data.topics || [];
  buildCore();
  buildBooks();
  layout();
  applyLang();
  setupDrag();
  requestAnimationFrame(tick);

  $("#surprise").addEventListener("click", surprise);
  $("#viewToggle").addEventListener("click", () => {
    const toList = $("#list").hidden;
    $("#list").hidden = !toList; $("#scene").hidden = toList;
    $("#viewToggle").setAttribute("aria-pressed", String(toList));
    $("#viewToggle").textContent = toList ? UI[lang].asShelf : UI[lang].asList;
    if (!toList) layout();
  });
  document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => { lang = b.dataset.lang; store.set("lang", lang); applyLang(); }));
  $("#reader").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeBook(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#reader").hidden) closeBook();
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && $("#reader").hidden && !e.target.closest("input,textarea")) {
      autoSpin = false; target = (target ?? angle) + (e.key === "ArrowLeft" ? 20 : -20);
    }
  });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(layout, 150); });
  if (matchMedia("(max-width: 720px)").matches && reduceMotion) $("#viewToggle").click();
}

init().catch((e) => { console.error(e); document.body.insertAdjacentHTML("beforeend", `<p style="padding:24px">No se pudo cargar essays.json (${esc(e.message)}).</p>`); });
