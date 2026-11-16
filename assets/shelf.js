// Estante 3D en WebGL2, sin dependencias.
// Dibuja cada libro como una caja con su lomo (texto pintado en un atlas), un cilindro negro
// en el centro y una repisa por piso. Gira solo, se arrastra, y deja caer los libros que no
// pertenecen al tema elegido.

// ---------- matemáticas mínimas ----------
const M = {
  ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
    }
    return o;
  },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f); return o;
  },
  lookAt(e, c, u) {
    let z = norm(sub(e, c)), x = norm(cross(u, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  },
  T: (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]),
  S: (x, y, z) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]),
  Ry(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  Rx(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  Rz(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  inv(m) {
    const o = new Float32Array(16);
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!d) return null; d = 1 / d;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
    return o;
  },
  xf(m, p, w = 1) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * w, m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * w,
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * w, m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] * w];
  },
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const wrapAngle = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

// ---------- shaders ----------
const BOOK_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUv; layout(location=3) in float aFace;
layout(location=4) in vec4 m0; layout(location=5) in vec4 m1; layout(location=6) in vec4 m2; layout(location=7) in vec4 m3;
layout(location=8) in vec3 aC; layout(location=9) in vec3 aC2; layout(location=10) in vec4 aRect; layout(location=11) in vec2 aMeta;
uniform mat4 uVP;
out vec3 vN; out vec2 vUv; flat out float vFace; out vec3 vC; out vec3 vC2; out vec4 vRect; out vec2 vMeta; out vec3 vW; out float vZ;
void main(){
  mat4 m = mat4(m0,m1,m2,m3);
  float bulge = clamp(0.24 * aMeta.x, 6.5, 13.0) / 6.0; // curva del lomo proporcional al grosor, como en un libro real
  vec3 p = aPos; if (p.z > 0.5) p.z = 0.5 + (p.z - 0.5) * bulge;
  vec4 w = m * vec4(p,1.0);
  vW = w.xyz;
  vec3 nn = vec3(aNor.x * bulge / (aMeta.x * aMeta.x), aNor.y, aNor.z / 14400.0); // normal correcta con escala no uniforme (fondo = 120)
  vN = normalize(mat3(m) * nn);
  vZ = aPos.z;
  vUv = aUv; vFace = aFace; vC = aC; vC2 = aC2; vRect = aRect; vMeta = aMeta;
  gl_Position = uVP * w;
}`;
const BOOK_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec2 vUv; flat in float vFace; in vec3 vC; in vec3 vC2; in vec4 vRect; in vec2 vMeta; in vec3 vW; in float vZ;
uniform sampler2D uAtlas; uniform vec3 uLight; uniform vec3 uEye;
out vec4 o;
void main(){
  vec3 n = normalize(vN);
  float diff = max(dot(n, uLight), 0.0);
  vec3 col;
  if (vFace < 0.5) {                       // lomo
    float g = texture(uAtlas, vRect.xy + vec2(vUv.x, 1.0 - vUv.y) * vRect.zw).g; // máscara: 0.5 tela, 1 tinta, <0.5 sombra
    col = mix(vC * min(g * 2.0, 1.0), vC2, clamp((g - 0.5) * 2.0, 0.0, 1.0));       // vC2 = color de la tinta
    col *= 0.60 + 0.52 * diff;
  } else if (vFace > 3.5 && vFace < 4.5) { // canto superior: hojas
    col = vec3(0.90,0.87,0.80) * (0.75 + 0.3 * diff); // papel liso, sin rayas
  } else if (vFace > 0.5 && vFace < 1.5) { // fondo
    col = vec3(0.92,0.89,0.81) * 0.55;
  } else if (vFace > 5.5) {                // cofia: la tela doblada en cabeza y pie
    col = vC * (0.50 + 0.45 * diff);
  } else {                                  // tapas: tela en el tercio del lomo, cartón gris en el resto
    col = mix(vec3(0.50,0.48,0.45), vC, step(0.17, vZ)) * (0.55 + 0.5 * diff);
  }
  col += vMeta.y * 0.08;                    // resaltado al pasar el puntero
  o = vec4(col, 1.0);
}`;
const FLAT_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor;
uniform mat4 uVP; uniform mat4 uM;
out vec3 vN; out vec3 vL;
void main(){ vN = normalize(mat3(uM) * aNor); vL = aPos; gl_Position = uVP * uM * vec4(aPos,1.0); }`;
const FLAT_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vL; uniform vec3 uColor; uniform vec3 uLight; uniform float uRim;
out vec4 o;
void main(){
  float d = max(dot(normalize(vN), uLight), 0.0);
  vec3 c = uColor * (0.6 + 0.6 * d);
  if (uRim > 0.0) { float r = length(vL.xz); c = mix(c, uColor * 1.9, smoothstep(0.93, 1.0, r) * step(0.49, vL.y)); }
  o = vec4(c, 1.0);
}`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// Caja unitaria: cara 0 lomo (+Z), 1 fondo (-Z), 2 derecha (+X), 3 izquierda (-X), 4 arriba (+Y), 5 abajo (-Y).
function boxGeometry() {
  const F = [
    [[0, 0, 1], [-1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, -1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
  ];
  const v = [], idx = [];
  F.forEach(([n, u, w], f) => {
    // u apunta a la derecha de la cara vista desde fuera; w hacia arriba.
    if (f === 0) { // forma D: lomo redondo (arco de 140°) con cofias arriba y abajo
      const N = 14, A = (70 * Math.PI) / 180, B = 0.05, sA = Math.sin(A), cA = Math.cos(A);
      const prof = (i) => { const a = -A + (2 * A * i) / N; return [(0.5 * Math.sin(a)) / sA, 0.5 + (B * (Math.cos(a) - cA)) / (1 - cA), (0.5 * Math.cos(a)) / sA, (-B * Math.sin(a)) / (1 - cA)]; };
      const b0 = v.length / 9;
      for (let i = 0; i <= N; i++) {
        const [X, Z, dX, dZ] = prof(i), L = Math.hypot(dX, dZ);
        for (const sw of [-1, 1]) v.push(X, 0.5 * sw, Z, -dZ / L, 0, dX / L, X + 0.5, (sw + 1) / 2, 0);
      }
      for (let i = 0; i < N; i++) { const a = b0 + i * 2; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
      for (const sw of [1, -1]) {
        const c = v.length / 9; v.push(0, 0.5 * sw, 0.5, 0, sw, 0, 0.5, 0.5, 6);
        for (let i = 0; i <= N; i++) { const [X, Z] = prof(i); v.push(X, 0.5 * sw, Z, 0, sw, 0, 0.5, 0.5, 6); }
        for (let i = 0; i < N; i++) { if (sw > 0) idx.push(c, c + 1 + i, c + 2 + i); else idx.push(c, c + 2 + i, c + 1 + i); }
      }
      return;
    }
    const base = v.length / 9;
    const uu = f === 0 ? [1, 0, 0] : u.map((x) => -x);
    for (const [su, sw] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 1, 2].map((i) => 0.5 * n[i] + 0.5 * su * uu[i] + 0.5 * sw * w[i]);
      v.push(...p, ...n, (su + 1) / 2, (sw + 1) / 2, f);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { v: new Float32Array(v), i: new Uint16Array(idx) };
}

// Cilindro de radio 1 y altura 1 centrado en el origen (lado + tapa superior).
function cylinderGeometry(seg = 72, cap = true) {
  const v = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, x = Math.sin(a), z = Math.cos(a);
    v.push(x, -0.5, z, x, 0, z, x, 0.5, z, x, 0, z);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
  if (cap) {
    const c = v.length / 6; v.push(0, 0.5, 0, 0, 1, 0);
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; v.push(Math.sin(a), 0.5, Math.cos(a), 0, 1, 0); }
    for (let i = 0; i < seg; i++) idx.push(c, c + 1 + i, c + 2 + i);
  }
  return { v: new Float32Array(v), i: new Uint16Array(idx) };
}

// ---------- texto de los lomos ----------
const PATTERNS = ["stripes", "band", "dots", "plain", "split"];

function wrapWords(ctx, text, max) {
  const words = text.split(/\s+/), lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width <= max || !line) line = t; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

// Encuentra el mayor tamaño de letra con el que el texto cabe en (largo × ancho), en hasta maxLines líneas.
function fitText(ctx, text, font, len, wid, maxFs, minFs, maxLines) {
  for (let fs = maxFs; fs >= minFs; fs -= 0.5) {
    ctx.font = font(fs);
    const lines = wrapWords(ctx, text, len);
    const tooLong = lines.some((l) => ctx.measureText(l).width > len);
    if (lines.length <= maxLines && lines.length * fs * 1.02 <= wid && !tooLong) return { fs, lines };
  }
  ctx.font = font(minFs);
  let lines = wrapWords(ctx, text, len).slice(0, maxLines);
  lines = lines.map((l) => { while (ctx.measureText(l + "…").width > len && l.length > 1) l = l.slice(0, -1); return l; });
  return { fs: minFs, lines, cut: true };
}

function drawSpine(ctx, b, x, y, S) {
  const w = b.t * S, h = b.h * S;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  // El atlas es una máscara en grises, no una imagen a color: gris medio = tela, blanco = tinta, más oscuro = sombra.
  // El color lo pone el sombreador (tela y tinta de cada libro). Así no depende de cómo cada navegador sube
  // el lienzo a la GPU: algunos intercambian el rojo y el azul, y los lomos salían con el color cambiado.
  ctx.fillStyle = "#808080"; ctx.fillRect(x, y, w, h);
  const ink = "#fff";
  // Forma D: cajos hundidos junto a cada orilla y cofia en cabeza y pie. Sin textura dibujada.
  ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(x + 2.2 * S, y, 0.9 * S, h); ctx.fillRect(x + w - 3.1 * S, y, 0.9 * S, h);
  ctx.fillStyle = "rgba(0,0,0,.13)"; ctx.fillRect(x, y, w, 3 * S); ctx.fillRect(x, y + h - 3 * S, w, 3 * S);
  const pad = 9 * S, wid = w - 6 * S;
  // Autor: zona inferior, legible (peso 700, tamaño generoso).
  const authorLen = Math.min(h * 0.3, 70 * S);
  const titleLen = h - authorLen - pad * 2 - 6 * S;
  if (b.pattern === "band") {
    ctx.fillStyle = ink; ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y + h - pad - authorLen - 13 * S, w, 8 * S); ctx.fillRect(x, y + 6 * S, w, 3 * S); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = ink; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  const fam = '"Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
  const drawRun = (text, weight, len, maxFs, minFs, maxLines, along) => {
    const r = fitText(ctx, text, (fs) => `${weight} ${fs}px ${fam}`, len, wid, maxFs * S, minFs * S, maxLines);
    const lh = r.fs * 1.02;
    ctx.save();
    ctx.translate(x + w / 2, along);
    ctx.rotate(-Math.PI / 2); // se lee de abajo arriba
    ctx.font = `${weight} ${r.fs}px ${fam}`;
    const off = ((r.lines.length - 1) * lh) / 2;
    r.lines.forEach((l, i) => ctx.fillText(r.cut && i === r.lines.length - 1 ? l + "…" : l, 0, i * lh - off));
    ctx.restore();
  };
  drawRun(b.title, 800, titleLen, Math.min(b.t * 0.62, 26), 5.5, 4, y + pad + titleLen / 2);
  if (b.author) drawRun(b.author, 700, authorLen, Math.min(Math.max(b.t * 0.42, 12), 17), 8, 2, y + h - pad - authorLen / 2);
  ctx.restore();
}

// ---------- el estante ----------
export class Shelf {
  constructor(canvas, books, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 no disponible");
    this.gl = gl;
    this.books = books;
    for (const b of books) Object.assign(b, { visible: true, mode: "shelf", pull: 0, pullT: 0, hl: 0, rgb: hex(b.c), rgb2: hex(b.ink) });
    this.angle = 0; this.angleT = null; this.spinV = 0; this.auto = !opts.reduceMotion;
    this.depth = 120; this.gap = 3;
    // Resolución adaptativa: se empieza en la del monitor (máximo 1,25 píxeles por píxel CSS), se sube hasta 1,5
    // si el equipo va holgado (eso suaviza los bordes sin MSAA) y se baja sola, hasta 0,6, si los cuadros tardan demasiado.
    this.maxScale = 1.5; this.minScale = 0.6;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    this.perf = { sum: 0, n: 0, t: 0, good: 0, ups: 0 };
    // Pausa: no se dibuja si el estante no está a la vista, si la pestaña está oculta o si hay un libro abierto.
    this.pauses = new Set();
    this.light = norm([0.45, 0.75, 0.55]);
    this.bookProg = compile(gl, BOOK_VS, BOOK_FS);
    this.flatProg = compile(gl, FLAT_VS, FLAT_FS);
    this.#buffers();
    this.#atlas();
    this.layout(true);
    this.#input();
    this.resize();
    this.last = performance.now();
    this.running = true;
    this.#watchVisibility();
    this.raf = requestAnimationFrame((t) => this.#frame(t));
  }

  #buffers() {
    const gl = this.gl;
    const box = boxGeometry();
    this.bookVao = gl.createVertexArray(); gl.bindVertexArray(this.bookVao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, box.v, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, box.i, gl.STATIC_DRAW);
    this.boxCount = box.i.length;
    // Datos por libro: 16 matriz + 3 color + 3 color2 + 4 rect + 2 meta = 28 floats
    this.inst = new Float32Array(this.books.length * 28);
    this.instBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    const layout = [[4, 4], [5, 4], [6, 4], [7, 4], [8, 3], [9, 3], [10, 4], [11, 2]];
    let off = 0;
    for (const [loc, n] of layout) {
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 112, off); gl.vertexAttribDivisor(loc, 1); off += n * 4;
    }
    gl.bindVertexArray(null);

    const mk = (geo) => {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, geo.v, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      const i = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.i, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, n: geo.i.length };
    };
    this.disc = mk(cylinderGeometry(96, true));
    this.core = mk(cylinderGeometry(48, false));
  }

  #atlas() {
    const gl = this.gl;
    const maxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);
    let S = 3, rects;
    const pack = (S) => {
      let x = 0, y = 0, rowH = 0; const out = [];
      for (const b of this.books) {
        const w = Math.ceil(b.t * S) + 2, h = Math.ceil(b.h * S) + 2;
        if (x + w > maxTex) { x = 0; y += rowH; rowH = 0; }
        out.push([x + 1, y + 1, w - 2, h - 2]); x += w; rowH = Math.max(rowH, h);
      }
      return { out, H: y + rowH };
    };
    let p = pack(S);
    while (p.H > maxTex && S > 1) { S -= 0.5; p = pack(S); }
    rects = p.out;
    const H = Math.min(maxTex, 1 << Math.ceil(Math.log2(Math.max(64, p.H))));
    const cv = document.createElement("canvas"); cv.width = maxTex; cv.height = H;
    const ctx = cv.getContext("2d");
    this.books.forEach((b, i) => { const [x, y] = rects[i]; drawSpine(ctx, b, x, y, S); b.rect = [x / maxTex, y / H, (b.t * S) / maxTex, (b.h * S) / H]; });
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const ext = gl.getExtension("EXT_texture_filter_anisotropic");
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    this.tex = tex;
  }

  // Reparte los libros visibles en anillos. Con pocos libros, el cilindro se encoge.
  layout(instant = false) {
    const vis = this.books.filter((b) => b.visible);
    const total = vis.reduce((s, b) => s + b.t + this.gap, 0);
    const maxH = Math.max(...this.books.map((b) => b.h));
    const tierH = maxH + 44, Rmax = 1000, Rmin = 190;
    const tiers = Math.max(1, Math.ceil(total / (2 * Math.PI * Rmax)));
    const R = Math.max(Rmin, Math.min(Rmax, total / tiers / (2 * Math.PI) + 10));
    const H = tiers * tierH;
    this.geoT = { R, H, tiers, tierH };
    if (instant || !this.geo) this.geo = { ...this.geoT };
    const rows = Array.from({ length: tiers }, () => []);
    let acc = 0, k = 0; const cap = total / tiers;
    for (const b of vis) { if (acc > cap * (k + 1) && k < tiers - 1) k++; rows[k].push(b); acc += b.t + this.gap; }
    rows.forEach((row, k) => {
      const circ = 2 * Math.PI * R;
      const rowTotal = row.reduce((s, b) => s + b.t + this.gap, 0);
      const spare = Math.max(0, circ - rowTotal) / Math.max(1, row.length);
      const base = H / 2 - (k + 1) * tierH + 14; // y hacia arriba
      let x = k * 37;
      for (const b of row) {
        b.thT = ((x + b.t / 2) / circ) * Math.PI * 2;
        b.rT = R; b.yT = base + b.h / 2; b.tier = k;
        if (instant || b.th === undefined) { b.th = b.thT; b.r = b.rT; b.y = b.yT; }
        x += b.t + this.gap + spare;
      }
    });
  }

  setVisible(pred) {
    const leaving = [], coming = [];
    for (const b of this.books) {
      const v = !!pred(b);
      if (b.visible && !v) leaving.push(b);
      if (!b.visible && v && b.mode !== "fall") coming.push(b);
      if (!b.visible && v && b.mode === "fall") coming.push(b);
      b.visible = v;
    }
    const instant = this.opts.reduceMotion;
    for (const b of leaving) {
      if (instant) { b.mode = "gone"; continue; }
      // Física simple: se inclina hacia fuera y cae.
      b.mode = "fall";
      const wa = b.th;
      b.p = [Math.sin(wa) * (b.r - this.depth / 2), b.y, Math.cos(wa) * (b.r - this.depth / 2)];
      const out = 35 + Math.random() * 60;
      b.v = [Math.sin(wa) * out, 30 + Math.random() * 80, Math.cos(wa) * out];
      b.rot = [0, 0]; b.w = [-(2 + Math.random() * 3), (Math.random() - 0.5) * 6];
      b.delay = Math.random() * 0.25; b.age = 0;
    }
    this.layout();
    for (const b of coming) {
      b.mode = "shelf";
      if (instant) { b.th = b.thT; b.r = b.rT; b.y = b.yT; continue; }
      b.th = b.thT; b.r = b.rT; b.y = b.yT + 700 + Math.random() * 400; b.drop = true;
    }
  }

  turnTo(b) { this.auto = false; this.angleT = -b.th; }
  pullOut(b) { for (const x of this.books) x.pullT = 0; if (b) b.pullT = 70; }
  resumeSoon(ms = 2500) { clearTimeout(this.resumeTimer); this.resumeTimer = setTimeout(() => { this.auto = !this.opts.reduceMotion; this.angleT = null; }, ms); }
  nudge(deg) { this.auto = false; this.angleT = (this.angleT ?? this.angle) + (deg * Math.PI) / 180; this.resumeSoon(4000); }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, Math.round(r.width * this.dpr)); this.Hpx = Math.max(1, Math.round(r.height * this.dpr));
    this.canvas.width = this.W; this.canvas.height = this.Hpx;
  }

  #camera() {
    const g = this.geo, asp = this.W / this.Hpx, fov = (30 * Math.PI) / 180;
    const t = Math.tan(fov / 2);
    // Encuadre por altura: el frente del estante llena el alto del lienzo, así los lomos se leen.
    // A lo ancho, el cilindro puede salirse de la pantalla.
    // En pantallas angostas se limita el acercamiento para que se vean varios libros a la vez.
    const dFront = Math.max((g.H + 150) / (2 * t), 300 / (2 * t * asp));
    const dist = dFront + g.R;
    const eye = [0, -g.H * 0.2 + dist * 0.035, dist]; // casi de frente (unos 2° de picado): no se ven los cantos de las hojas
    const view = M.lookAt(eye, [0, -g.H * 0.2, 0], [0, 1, 0]);
    const proj = M.persp(fov, asp, 10, dist * 4);
    this.eye = eye; this.view = view; this.proj = proj;
    this.vp = M.mul(proj, view);
  }

  bookMatrix(b) {
    const C = M.Ry(this.angle);
    let m;
    if (b.mode === "fall") {
      m = M.mul(C, M.mul(M.T(...b.p), M.mul(M.Ry(b.th), M.mul(M.Rx(b.rot[0]), M.Rz(b.rot[1])))));
    } else {
      const r = b.r - this.depth / 2 + b.pull;
      m = M.mul(C, M.mul(M.Ry(b.th), M.T(0, b.y, r)));
    }
    return M.mul(m, M.S(b.t, b.h, this.depth));
  }

  pause(reason) { this.pauses.add(reason); }
  resume(reason) {
    if (!this.pauses.delete(reason) || this.pauses.size || this.raf) return;
    // Al volver de una pausa larga, lo que estaba en movimiento termina de golpe en vez de saltar a medias.
    if (performance.now() - this.pausedAt > 800) {
      for (const b of this.books) {
        if (b.mode === "fall") b.mode = "gone";
        if (b.mode === "shelf") { b.th = b.thT; b.r = b.rT; b.y = b.yT; b.drop = false; }
      }
      this.geo = { ...this.geoT };
    }
    this.last = performance.now();
    this.perf = { ...this.perf, sum: 0, n: 0, t: 0 };
    this.raf = requestAnimationFrame((t) => this.#frame(t));
  }
  #watchVisibility() {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => (e.isIntersecting ? this.resume("offscreen") : this.pause("offscreen"))).observe(this.canvas);
    }
    document.addEventListener("visibilitychange", () => (document.hidden ? this.pause("hidden") : this.resume("hidden")));
  }
  // Ajusta la resolución según el tiempo real entre cuadros (promedio de cada segundo).
  #adapt(ms) {
    const p = this.perf;
    if (ms > 250) return; // pausas del navegador: no cuentan
    p.sum += ms; p.n++; p.t += ms;
    if (p.t < 1000) return;
    const avg = p.sum / p.n; p.sum = 0; p.n = 0; p.t = 0;
    if (avg > 24 && this.dpr > this.minScale) {
      this.dpr = Math.max(this.minScale, this.dpr * (avg > 45 ? 0.65 : 0.8)); p.good = 0; this.resize();
    } else if (avg < 18 && this.dpr < this.maxScale && p.ups < 3) {
      if (++p.good >= 4) { this.dpr = Math.min(this.maxScale, this.dpr * 1.15); p.good = 0; p.ups++; this.resize(); }
    } else p.good = 0;
  }

  #frame(now) {
    this.raf = null;
    if (!this.running) return;
    if (this.pauses.size) { this.pausedAt = performance.now(); return; }
    this.#adapt(now - this.last);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const k = 1 - Math.pow(0.002, dt); // suavizado
    // giro
    if (this.angleT !== null) {
      const d = wrapAngle(this.angleT - this.angle);
      this.angle += d * Math.min(1, dt * 5);
      if (Math.abs(d) < 0.002) { this.angle = this.angleT; }
    } else if (this.dragging || this.holding) {
      // lo maneja el puntero (con el dedo puesto, el estante no gira solo)
    } else if (Math.abs(this.spinV) > 0.004) {
      this.angle += this.spinV * dt; this.spinV *= Math.pow(0.05, dt);
    } else if (this.auto) {
      this.angle -= 0.075 * dt;
    }
    // geometría
    for (const key of ["R", "H"]) this.geo[key] += (this.geoT[key] - this.geo[key]) * k;
    this.geo.tiers = this.geoT.tiers; this.geo.tierH = this.geoT.tierH;
    // libros
    for (const b of this.books) {
      b.pull += (b.pullT - b.pull) * Math.min(1, dt * 9);
      b.hl += ((b === this.hover ? 1 : 0) - b.hl) * Math.min(1, dt * 10);
      if (b.mode === "fall") {
        b.age += dt;
        if (b.age < b.delay) continue;
        b.v[1] -= 2600 * dt;
        for (let i = 0; i < 3; i++) b.p[i] += b.v[i] * dt;
        b.rot[0] += b.w[0] * dt; b.rot[1] += b.w[1] * dt;
        if (b.p[1] < -this.geo.H / 2 - 2500) b.mode = "gone";
      } else if (b.mode === "shelf") {
        b.th += wrapAngle(b.thT - b.th) * k; b.r += (b.rT - b.r) * k;
        const ky = b.drop ? 1 - Math.pow(0.0005, dt) : k;
        b.y += (b.yT - b.y) * ky;
        if (Math.abs(b.y - b.yT) < 0.5) b.drop = false;
      }
    }
    this.#draw();
    this.raf = requestAnimationFrame((t) => this.#frame(t));
  }

  #draw() {
    const gl = this.gl;
    this.#camera();
    gl.viewport(0, 0, this.W, this.Hpx);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    const g = this.geo;
    // núcleo y repisas
    gl.useProgram(this.flatProg);
    const u = (n) => gl.getUniformLocation(this.flatProg, n);
    gl.uniformMatrix4fv(u("uVP"), false, this.vp); gl.uniform3fv(u("uLight"), this.light);
    const C = M.Ry(this.angle);
    const coreR = Math.max(40, g.R - this.depth - 8);
    gl.uniform1f(u("uRim"), 0);
    gl.uniformMatrix4fv(u("uM"), false, M.mul(C, M.mul(M.T(0, 0, 0), M.S(coreR, g.H, coreR))));
    gl.uniform3fv(u("uColor"), [0.025, 0.025, 0.025]);
    gl.bindVertexArray(this.core.vao); gl.drawElements(gl.TRIANGLES, this.core.n, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(this.disc.vao);
    gl.uniform3fv(u("uColor"), [0.075, 0.075, 0.075]); gl.uniform1f(u("uRim"), 1);
    for (let k = 1; k <= g.tiers; k++) {
      const top = g.H / 2 - k * g.tierH + 14;
      gl.uniformMatrix4fv(u("uM"), false, M.mul(C, M.mul(M.T(0, top - 6, 0), M.S(g.R + 26, 12, g.R + 26))));
      gl.drawElements(gl.TRIANGLES, this.disc.n, gl.UNSIGNED_SHORT, 0);
    }
    // libros
    let n = 0;
    this.drawn = [];
    for (const b of this.books) {
      if (b.mode === "gone") continue;
      const m = this.bookMatrix(b); b.m = m;
      const o = n * 28;
      this.inst.set(m, o);
      this.inst.set(b.rgb, o + 16); this.inst.set(b.rgb2, o + 19); this.inst.set(b.rect, o + 22);
      this.inst[o + 26] = b.t; this.inst[o + 27] = b.hl;
      this.drawn.push(b); n++;
    }
    gl.useProgram(this.bookProg);
    const ub = (x) => gl.getUniformLocation(this.bookProg, x);
    gl.uniformMatrix4fv(ub("uVP"), false, this.vp); gl.uniform3fv(ub("uLight"), this.light); gl.uniform3fv(ub("uEye"), this.eye);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(ub("uAtlas"), 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, n * 28);
    gl.bindVertexArray(this.bookVao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.boxCount, gl.UNSIGNED_SHORT, 0, n);
    gl.bindVertexArray(null);
    this.#front();
  }

  // Libro de enfrente: el que queda más cerca de la cámara. Avisa a la página cuando cambia
  // y le dice a qué altura (en píxeles del lienzo) termina la repisa, para poner la barra debajo.
  #front() {
    if (!this.opts.onFront) return;
    // Con el cursor encima del estante manda el libro bajo el cursor; si no, el del centro.
    // Como el estante gira bajo un cursor quieto, se vuelve a apuntar cada 80 ms.
    const now = performance.now();
    if (this.pointer && !this.dragging && now - (this.pickedAt || 0) > 80) {
      this.pickedAt = now;
      this.hover = this.pick(this.pointer.x, this.pointer.y);
      this.canvas.style.cursor = this.hover ? "pointer" : "grab";
    }
    let best = this.pointer && this.hover && this.hover.visible && this.hover.mode === "shelf" ? this.hover : null;
    if (!best) {
      let bd = Infinity;
      for (const b of this.books) {
        if (!b.visible || b.mode !== "shelf") continue;
        const d = Math.abs(wrapAngle(this.angle + b.th));
        if (d < bd) { bd = d; best = b; }
      }
    }
    const g = this.geo;
    const floor = g.H / 2 - g.tiers * g.tierH + 14 - 12; // borde inferior de la repisa más baja
    const p = M.xf(this.vp, [0, floor, g.R + 26]);
    const y = Math.round(((1 - p[1] / p[3]) / 2) * this.canvas.clientHeight);
    if (best !== this.frontBook || y !== this.frontY) { this.frontBook = best; this.frontY = y; this.opts.onFront(best, y); }
  }

  // Rayo desde la cámara hasta el libro bajo el puntero.
  pick(clientX, clientY) {
    if (!this.vp) return null;
    const r = this.canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1, ny = -(((clientY - r.top) / r.height) * 2 - 1);
    const ivp = M.inv(this.vp);
    const a = M.xf(ivp, [nx, ny, -1]), c = M.xf(ivp, [nx, ny, 1]);
    const p0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], p1 = [c[0] / c[3], c[1] / c[3], c[2] / c[3]];
    // el núcleo tapa lo que está detrás
    let best = null, bestT = Infinity;
    for (const b of this.drawn || []) {
      if (!b.visible || b.mode !== "shelf") continue;
      const im = M.inv(b.m); if (!im) continue;
      const o = M.xf(im, p0), e = M.xf(im, p1);
      const d = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
      let tmin = 0, tmax = 1, ok = true;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (o[i] < -0.5 || o[i] > 0.5) { ok = false; break; } continue; }
        let t1 = (-0.5 - o[i]) / d[i], t2 = (0.5 - o[i]) / d[i]; if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmin < bestT) { bestT = tmin; best = b; }
    }
    if (!best) return null;
    // descarta libros del lado de atrás (ocultos por el núcleo)
    const wa = wrapAngle(this.angle + best.th);
    return Math.cos(wa) > -0.2 ? best : null;
  }

  // Radianes de giro por píxel de dedo. El lomo que queda bajo el dedo avanza 1,5 veces lo que el dedo
  // (antes dependía del ancho de la pantalla: en un celular el estante corría unas 14 veces más que el dedo).
  #dragGain(r) {
    if (!this.eye) return (Math.PI * 1.4) / r.width / 9;
    const t = Math.tan((15 * Math.PI) / 180), dFront = Math.max(1, this.eye[2] - this.geo.R);
    const pxPerRad = this.geo.R * (r.height / 2) / (t * dFront); // píxeles que recorre el frente del estante por radián
    return Math.min(1.5 / pxPerRad, (Math.PI * 1.4) / r.width);  // nunca más rápido que antes (estantes chicos, al filtrar)
  }

  #input() {
    const c = this.canvas;
    let down = false, id = null, sx = 0, sa = 0, moved = false, gain = 0, trail = [];
    const end = () => { down = false; id = null; this.dragging = false; this.holding = false; c.style.cursor = "grab"; };
    c.addEventListener("pointerdown", (e) => {
      if (down) return; // un segundo dedo no cuenta
      down = true; id = e.pointerId; moved = false; sx = e.clientX; sa = this.angle; trail = [];
      this.angleT = null; this.spinV = 0; this.holding = true; // al poner el dedo, el estante se detiene en seco
    });
    window.addEventListener("pointermove", (e) => {
      if (!down) {
        if (e.target === c && e.pointerType === "mouse") {
          this.pointer = { x: e.clientX, y: e.clientY }; this.pickedAt = performance.now();
          const b = this.pick(e.clientX, e.clientY); this.hover = b; c.style.cursor = b ? "pointer" : "grab";
        }
        return;
      }
      if (e.pointerId !== id) return;
      const now = performance.now();
      if (!moved) {
        // Un dedo se desliza más que un mouse al tocar: umbral más amplio en pantallas táctiles.
        if (Math.abs(e.clientX - sx) <= (e.pointerType === "mouse" ? 5 : 12)) return;
        moved = true; this.dragging = true; this.auto = false; c.style.cursor = "grabbing";
        sx = e.clientX; sa = this.angle; // el arrastre arranca desde aquí: sin salto inicial
        gain = this.#dragGain(c.getBoundingClientRect());
      }
      this.angle = sa + (e.clientX - sx) * gain;
      trail.push([now, e.clientX]);
      while (trail.length > 2 && now - trail[0][0] > 100) trail.shift();
    });
    window.addEventListener("pointerup", (e) => {
      if (!down || e.pointerId !== id) return;
      const wasMoved = moved; end();
      if (wasMoved) {
        // Inercia: velocidad promedio de los últimos 100 ms, con tope. Si el dedo se detuvo antes de soltar, no hay inercia.
        const now = performance.now(), a = trail[0], z = trail[trail.length - 1];
        let v = 0;
        if (a && z && z[0] - a[0] >= 16 && now - z[0] < 80) v = ((z[1] - a[1]) / ((z[0] - a[0]) / 1000)) * gain;
        const vMax = 1700 * gain; // con el freno de #frame, deja pasar unos 20 libros como mucho en un celular
        this.spinV = Math.max(-vMax, Math.min(vMax, v));
        this.resumeSoon(2500); return;
      }
      this.spinV = 0;
      const b = this.pick(e.clientX, e.clientY);
      if (b && this.opts.onOpen) this.opts.onOpen(b);
    });
    // El navegador se queda con el gesto (por ejemplo, para desplazar la página en vertical): se suelta el estante.
    window.addEventListener("pointercancel", (e) => {
      if (!down || e.pointerId !== id) return;
      const wasMoved = moved; end(); this.spinV = 0;
      if (wasMoved) this.resumeSoon(2500);
    });
    c.addEventListener("pointerleave", () => { this.hover = null; this.pointer = null; });
  }
}
