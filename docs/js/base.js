/* window.TB: helpers comunes, íconos, registro de secciones, tema, navegación y modo presentación */
(function () {
  "use strict";
  var D = window.DATOS || { entornos: [], pendientes: [], slo: { p95_ms: 300, error_pct: 1 } };
  D.entornos = D.entornos || []; D.pendientes = D.pendientes || []; D.slo = D.slo || { p95_ms: 300, error_pct: 1 };
  var root = document.documentElement;
  var SLOT = { "fisica-local": "--s1", "contenedor-2cpu-1g": "--s2", "aws-t3-small": "--s3", "contenedor-1cpu-512m": "--s4", "contenedor-sin-limite": "--s7" };
  var CORTOS = { "fisica-local": "Física", "contenedor-2cpu-1g": "2 CPU · 1 GB", "contenedor-1cpu-512m": "1 CPU · 512 MB", "contenedor-sin-limite": "Sin límites", "aws-t3-small": "AWS t3.small" };
  var FUENTE = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
  var charts = {}, secciones = [], callbacksTema = [];

  function css(v) { return getComputedStyle(root).getPropertyValue(v).trim(); }
  function esObj(x) { return x && typeof x === "object" && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype; }
  function mergeDeep(a, b) {
    if (!esObj(b)) return a;
    Object.keys(b).forEach(function (k) {
      if (esObj(b[k])) { if (!esObj(a[k])) a[k] = {}; mergeDeep(a[k], b[k]); }
      else a[k] = b[k];
    });
    return a;
  }

  /* ---------- íconos (estilo Lucide, trazo 1,75) ---------- */
  var ICONOS = {
    chip: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
    servidor: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
    contenedor: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    nube: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    rayo: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    memoria: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10v4M10 10v4M14 10v4M18 10v4"/>',
    disco: '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01M10 16h.01"/>',
    red: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8"/>',
    objetivo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    balanza: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    dinero: '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6"/>',
    grafica: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    capas: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pausa: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-2.93 1.41-1.41m11.32-11.32 1.41-1.41M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41"/>',
    luna: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    presentar: '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    pregunta: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>',
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    cruz: '<path d="M18 6 6 18M6 6l12 12"/>',
    flecha: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    casa: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    documento: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>'
  };
  function icono(nombre, tam) {
    tam = tam || 20;
    return '<svg class="ico" xmlns="http://www.w3.org/2000/svg" width="' + tam + '" height="' + tam + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONOS[nombre] || ICONOS.chip) + "</svg>";
  }

  var TB = {
    D: D,
    N: window.NARRATIVA || {},
    E: D.entornos,
    P: D.pendientes,
    css: css,
    icono: icono,
    color: function (id) { return css(SLOT[id] || "--s5"); },
    alfa: function (hex, a) {
      var h = String(hex).trim();
      if (h.charAt(0) !== "#") return h;
      h = h.slice(1); if (h.length === 3) h = h.replace(/./g, "$&$&");
      var n = parseInt(h, 16);
      return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
    },
    nf: function (n, dec) {
      dec = dec || 0;
      return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    },
    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
    },
    llave: function (id) { return '<span class="llave" style="background:' + TB.color(id) + '"></span>'; },
    pill: function (e) {
      return e.aguanta == null ? '<span class="pastilla pend">' + icono("reloj", 12) + "Pendiente</span>" :
        e.aguanta ? '<span class="pastilla ok">' + icono("check", 12) + "Aguanta</span>" : '<span class="pastilla no">' + icono("cruz", 12) + "No aguanta</span>";
    },
    limCores: function (e) { return e.config.nucleos_disponibles || (e.ficha && e.ficha.nucleos_logicos); },
    nombreCorto: function (e) { return CORTOS[e.id] || e.nombre; },
    barra: { borderRadius: 6, borderSkipped: "start", maxBarThickness: 28, categoryPercentage: 0.72, barPercentage: 0.86 },

    opciones: function (extra) {
      var ink2 = css("--ink-2"), grid = css("--grid"), borde = css("--border"), muted = css("--muted");
      var tick = { color: muted, font: { family: FUENTE, size: 14, weight: 500 }, padding: 8 };
      var titulo = { color: ink2, font: { family: FUENTE, size: 14, weight: 500 } };
      var base = {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: css("--surface"), titleColor: css("--ink"), bodyColor: ink2,
            borderColor: borde, borderWidth: 1, padding: 12, cornerRadius: 12, boxPadding: 4, usePointStyle: true,
            titleFont: { size: 14, weight: 600, family: FUENTE }, bodyFont: { size: 14, weight: 400, family: FUENTE }
          }
        },
        scales: {
          x: { grid: { color: grid, lineWidth: 1, drawTicks: false }, border: { color: borde }, ticks: JSON.parse(JSON.stringify(tick)), title: JSON.parse(JSON.stringify(titulo)) },
          y: { grid: { color: grid, lineWidth: 1, drawTicks: false }, border: { display: false }, ticks: JSON.parse(JSON.stringify(tick)), title: JSON.parse(JSON.stringify(titulo)), beginAtZero: true }
        }
      };
      return mergeDeep(base, extra || {});
    },

    grafica: function (canvasId, cfg) {
      var el = document.getElementById(canvasId);
      if (!el || !window.Chart) return null;
      if (charts[canvasId]) { charts[canvasId].destroy(); delete charts[canvasId]; }
      var prev = Chart.getChart(el); if (prev) prev.destroy();
      Chart.defaults.font.family = FUENTE;
      Chart.defaults.font.size = 14;
      Chart.defaults.color = css("--ink-2");
      charts[canvasId] = new Chart(el, cfg);
      return charts[canvasId];
    },

    leyenda: function (selector, lista) {
      var el = typeof selector === "string" ? document.querySelector(selector) : selector;
      if (!el) return;
      el.innerHTML = (lista || []).map(function (e) { return "<span>" + TB.llave(e.id) + TB.esc(e.nombre) + "</span>"; }).join("");
    },

    seccion: function (nombre, fn) { secciones.push({ nombre: nombre, fn: fn }); },
    alCambiarTema: function (fn) { callbacksTema.push(fn); },
    cuerpo: function (id) { return document.querySelector("#" + id + " .cuerpo"); },
    iniciar: function () {
      pintarIconos();
      portada();
      iniciarTema();
      pintarTodo();
      iniciarNav();
      iniciarPresentacion();
    }
  };
  window.TB = TB;

  function pintarIconos() {
    [].slice.call(document.querySelectorAll("[data-icono]")).forEach(function (el) {
      var tam = +el.getAttribute("data-tam") || 16;
      if (el.tagName === "A") el.insertAdjacentHTML("afterbegin", icono(el.getAttribute("data-icono"), 16));
      else el.innerHTML = icono(el.getAttribute("data-icono"), tam);
    });
    iconoTema();
  }
  function iconoTema() {
    var b = document.getElementById("btn-tema"); if (!b) return;
    var t = root.getAttribute("data-theme");
    var osc = t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    b.innerHTML = icono(osc ? "sol" : "luna", 20);
    b.setAttribute("title", osc ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
  }

  function pintarTodo() {
    secciones.forEach(function (s) {
      try { s.fn(); } catch (err) { console.error("[TB] error en la sección " + s.nombre + ":", err); }
    });
  }
  function repintar() {
    iconoTema();
    pintarTodo();
    callbacksTema.forEach(function (fn) { try { fn(); } catch (err) { console.error("[TB] alCambiarTema:", err); } });
  }

  function portada() {
    var E = TB.E, nf = TB.nf;
    var tot = E.reduce(function (a, e) { return a + (e.repeticiones || []).reduce(function (b, r) { return b + (r.peticiones || 0); }, 0); }, 0);
    var meta = document.getElementById("meta");
    if (meta) meta.innerHTML =
      '<div class="dato"><b>' + nf(tot) + "</b><span>peticiones medidas en carga sostenida</span></div>" +
      '<div class="dato"><b>' + E.length + "</b><span>entornos medidos" + (D.pendientes.length ? " · " + D.pendientes.length + " pendiente(s)" : "") + "</span></div>" +
      '<div class="dato"><b>' + nf(D.slo.p95_ms) + " ms</b><span>p95 máximo aceptado (acuerdo de servicio)</span></div>";
    var pie = document.getElementById("pie");
    if (pie) pie.innerHTML = "Spring PetClinic · datos crudos en <code>medicion/resultados/</code> · generado " + TB.esc(String(D.generado || "").replace("T", " ")) + ". Precios on-demand de AWS us-east-1 consultados el 8 de noviembre de 2026.";
  }

  /* ---------- tema ---------- */
  function iniciarTema() {
    var guardado = null;
    try { guardado = localStorage.getItem("tema"); } catch (e) {}
    if (guardado === "light" || guardado === "dark") root.setAttribute("data-theme", guardado);
    iconoTema();
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var btn = document.getElementById("btn-tema");
    if (btn) btn.addEventListener("click", function () {
      var t = root.getAttribute("data-theme");
      var osc = t ? t === "dark" : mq.matches;
      var nuevo = osc ? "light" : "dark";
      root.setAttribute("data-theme", nuevo);
      try { localStorage.setItem("tema", nuevo); } catch (e) {}
      repintar();
    });
    var cambio = function () { if (!root.getAttribute("data-theme")) repintar(); };
    if (mq.addEventListener) mq.addEventListener("change", cambio); else if (mq.addListener) mq.addListener(cambio);
  }

  /* ---------- navegación activa ---------- */
  function iniciarNav() {
    var enlaces = [].slice.call(document.querySelectorAll("nav.secciones .enlaces a"));
    if (enlaces[0]) enlaces[0].classList.add("activo");
    if (!("IntersectionObserver" in window)) return;
    var obs = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        enlaces.forEach(function (a) {
          var on = a.getAttribute("href") === "#" + en.target.id;
          a.classList.toggle("activo", on);
          if (on && !document.body.classList.contains("presentar")) {
            var nav = a.parentNode; var x = a.offsetLeft - nav.clientWidth / 2 + a.clientWidth / 2;
            if (nav.scrollTo) nav.scrollTo({ left: x, behavior: "auto" });
          }
        });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    [].slice.call(document.querySelectorAll("section.bloque")).forEach(function (s) { obs.observe(s); });
    window.addEventListener("scroll", function () {
      if (window.scrollY < 40) enlaces.forEach(function (a, i) { a.classList.toggle("activo", i === 0); });
    }, { passive: true });
  }

  /* ---------- modo presentación ---------- */
  function iniciarPresentacion() {
    var body = document.body;
    var btn = document.getElementById("btn-presentar");
    var pantallas = function () { return [].slice.call(document.querySelectorAll("header.portada, section.bloque")); };
    function actual() {
      var l = pantallas(), mitad = window.innerHeight / 2, mejor = 0, d = 1e9;
      l.forEach(function (el, i) {
        var r = el.getBoundingClientRect(), dist = Math.abs(r.top + Math.min(r.height, window.innerHeight) / 2 - mitad);
        if (r.top < mitad && r.bottom > mitad) { dist = 0; }
        if (dist < d) { d = dist; mejor = i; }
      });
      return mejor;
    }
    function ir(i) {
      var l = pantallas(); i = Math.max(0, Math.min(l.length - 1, i));
      l[i].scrollIntoView({ behavior: "auto", block: "start" });
    }
    function alternar(on) {
      var i = actual();
      body.classList.toggle("presentar", on);
      if (btn) {
        var tx = btn.querySelector(".txt"); if (tx) tx.textContent = on ? "Salir" : "Presentar";
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      }
      setTimeout(function () { ir(i); window.dispatchEvent(new Event("resize")); }, 60);
    }
    if (btn) btn.addEventListener("click", function () { alternar(!body.classList.contains("presentar")); });
    document.addEventListener("keydown", function (ev) {
      var t = ev.target, tag = t && t.tagName;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      var on = body.classList.contains("presentar");
      if (ev.key === "p" || ev.key === "P") { ev.preventDefault(); alternar(!on); return; }
      if (!on) return;
      if (ev.key === "Escape") { alternar(false); return; }
      if (ev.key === "ArrowRight" || ev.key === "PageDown") { ev.preventDefault(); ir(actual() + 1); }
      else if (ev.key === "ArrowLeft" || ev.key === "PageUp") { ev.preventDefault(); ir(actual() - 1); }
    });
  }
})();
