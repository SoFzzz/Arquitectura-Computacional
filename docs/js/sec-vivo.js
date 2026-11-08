/* #vivo: reproductor segundo a segundo de la repetición mediana (Agente E) */
(function () {
  "use strict";
  var ESTADO = { sel: null, t: 60, jugando: false, vel: 10, raf: null, ultimo: 0 };
  var ctx = null; /* {sel, dur, series, acum, graf} del último render */

  function envs() { return TB.E.filter(function (e) { return e.en_vivo && e.en_vivo.t && e.en_vivo.t.length; }); }
  function elegidos() { return envs().filter(function (e) { return ESTADO.sel[e.id]; }); }
  function durDe(lista) { return Math.max.apply(null, lista.map(function (e) { return e.en_vivo.t.length - 1; })); }
  function media(a, desde) { var s = 0, n = 0; for (var i = desde; i < a.length; i++) if (a[i] != null) { s += a[i]; n++; } return n ? s / n : null; }
  function maxDe(a) { return Math.max.apply(null, a.filter(function (x) { return x != null; })); }

  var FUENTE = function () { return TB.css("--font-ui") || "Inter, sans-serif"; };
  function caja(c, txt, x, y, alinea, ink, surf, borde) {
    c.save(); c.font = "600 12px " + FUENTE(); c.textBaseline = "middle";
    var w = c.measureText(txt).width + 16, h = 24, x0 = alinea === "right" ? x - w : x, y0 = y - h / 2;
    c.beginPath(); if (c.roundRect) c.roundRect(x0, y0, w, h, 8); else c.rect(x0, y0, w, h);
    c.fillStyle = surf; c.fill(); c.lineWidth = 1; c.strokeStyle = borde; c.stroke();
    c.fillStyle = ink; c.textAlign = "left"; c.fillText(txt, x0 + 8, y + 1); c.restore();
  }
  function btnPlay(juega) {
    var b = document.getElementById("e-play"); if (!b) return;
    b.innerHTML = TB.icono(juega ? "pausa" : "play", 20) + "<span>" + (juega ? "Pausar" : "Reproducir") + "</span>";
    b.setAttribute("aria-label", juega ? "Pausar" : "Reproducir");
  }
  function parar() {
    ESTADO.jugando = false;
    if (ESTADO.raf) cancelAnimationFrame(ESTADO.raf);
    ESTADO.raf = null;
    btnPlay(false);
  }
  function arrancar() {
    if (!ctx) return;
    if (ESTADO.t >= ctx.dur) ESTADO.t = 0;
    ESTADO.jugando = true; ESTADO.ultimo = 0;
    btnPlay(true);
    if (ESTADO.raf) cancelAnimationFrame(ESTADO.raf);
    ESTADO.raf = requestAnimationFrame(bucle);
  }
  function bucle(ts) {
    if (!ESTADO.jugando) return;
    if (!ESTADO.ultimo) ESTADO.ultimo = ts;
    var paso = 1000 / ESTADO.vel;
    if (ts - ESTADO.ultimo >= paso) {
      var n = Math.max(1, Math.floor((ts - ESTADO.ultimo) / paso));
      ESTADO.ultimo += n * paso;
      ESTADO.t = Math.min(ctx.dur, ESTADO.t + n);
      pintar();
      if (ESTADO.t >= ctx.dur) { parar(); return; }
    }
    ESTADO.raf = requestAnimationFrame(bucle);
  }

  function pluginAhora() {
    return {
      id: "eAhora",
      afterDatasetsDraw: function (ch) {
        var x = ch.scales.x.getPixelForValue(ESTADO.t), a = ch.chartArea, c = ch.ctx;
        c.save(); c.strokeStyle = TB.css("--ink"); c.lineWidth = 2; c.setLineDash([5, 4]);
        c.beginPath(); c.moveTo(x, a.top); c.lineTo(x, a.bottom); c.stroke(); c.setLineDash([]); c.restore();
        var txt = "ahora · " + ESTADO.t + " s";
        c.save(); c.font = "600 12px " + FUENTE(); var w = c.measureText(txt).width + 16; c.restore();
        var izq = x + w + 12 > a.right;
        caja(c, txt, x + (izq ? -6 : 6), a.top + 16, izq ? "right" : "left", TB.css("--ink"), TB.css("--surface"), TB.css("--border"));
      }
    };
  }
  function pluginSLO(slo) {
    return {
      id: "eSLO",
      afterDatasetsDraw: function (ch) {
        var y = ch.scales.y.getPixelForValue(slo), a = ch.chartArea, c = ch.ctx;
        if (y < a.top || y > a.bottom) return;
        c.save(); c.strokeStyle = TB.css("--crit"); c.lineWidth = 2; c.setLineDash([8, 5]);
        c.beginPath(); c.moveTo(a.left, y); c.lineTo(a.right, y); c.stroke(); c.setLineDash([]); c.restore();
        caja(c, "SLO " + slo + " ms", a.right - 6, y - 16, "right", TB.css("--crit"), TB.css("--surface"), TB.css("--border"));
      }
    };
  }

  function tituloRps(sel) {
    var m = sel.map(function (e) { return { e: e, v: e.mediana.rps }; }).sort(function (a, b) { return b.v - a.v; });
    if (m.length < 2) return TB.nombreCorto(m[0].e) + " sostiene " + TB.nf(m[0].v) + " req/s (mediana de 3 repeticiones) con 30 usuarios";
    var a = m[0], z = m[m.length - 1];
    return TB.nombreCorto(a.e) + " atiende " + TB.nf(a.v / z.v, 1) + "× más req/s que " + TB.nombreCorto(z.e) + " con los mismos 30 usuarios";
  }
  function tituloP95(sel) {
    var slo = TB.D.slo.p95_ms;
    var m = sel.map(function (e) { return { e: e, v: e.mediana.p95_ms, c: media(e.en_vivo.p95, 60) }; }).sort(function (a, b) { return b.v - a.v; });
    var peor = m[0], fuera = m.filter(function (x) { return x.v > slo; });
    if (!fuera.length) return "Todos mantienen el p95 por debajo de " + slo + " ms (el peor: " + TB.nombreCorto(peor.e) + ", " + TB.nf(peor.v) + " ms de mediana)";
    return fuera.map(function (x) { return TB.nombreCorto(x.e); }).join(" y ") + (fuera.length > 1 ? " superan" : " supera") + " el acuerdo de " + slo + " ms: " + TB.nf(peor.v) + " ms de mediana (≈ " + TB.nf(peor.c) + " ms tras el calentamiento)";
  }

  function tarjeta(e) {
    var n = (e.en_vivo.cores[0] || []).length || 8, c = TB.color(e.id), nuc = "", et = "";
    for (var i = 0; i < n; i++) { nuc += '<div><i style="background:' + c + '"></i></div>'; et += "<span>" + i + "</span>"; }
    var ic = e.tipo === "contenedor" || e.tipo === "control" ? "contenedor" : (e.tipo === "nube" ? "nube" : "servidor");
    return '<div class="panel e-maq" data-id="' + e.id + '">' +
      '<h3><span class="icono-chip">' + TB.icono(ic, 20) + "</span>" + TB.llave(e.id) + "<span>" + TB.esc(e.nombre) + "</span></h3>" +
      '<div><div class="rotulo" style="margin-bottom:8px">CPU por núcleo lógico del host</div><div class="e-nuc" style="--n:' + n + '">' + nuc + '</div><div class="e-nuc-et" style="--n:' + n + '">' + et + "</div></div>" +
      '<div class="e-cifras"><div class="e-cifra"><b data-k="rps">0</b><span>req/s ahora</span></div><div class="e-cifra"><b data-k="p95">—</b><span>p95 ahora (ms)</span></div><div class="e-cifra"><b data-k="total">0</b><span>peticiones atendidas</span></div></div>' +
      '<div class="medidor"><div class="fila"><span>CPU de la app / límite</span><span data-k="cpu">—</span></div><div class="pista"><i data-b="cpu" style="width:0;background:' + c + '"></i></div></div>' +
      '<div class="medidor"><div class="fila"><span>Memoria residente / disponible</span><span data-k="rss">—</span></div><div class="pista"><i data-b="rss" style="width:0;background:' + c + '"></i></div></div>' +
      '<div class="e-cifras chicas"><div class="e-cifra"><b data-k="red">0</b><span>KB/s salen de la app</span></div><div class="e-cifra"><b data-k="disco">0</b><span>IOPS de disco</span></div><div class="e-cifra"><b data-k="gen">0</b><span>núcleos del generador</span></div></div>' +
      "</div>";
  }

  function pintar() {
    if (!ctx) return;
    var cu = TB.cuerpo("vivo"); if (!cu) return;
    var t = ESTADO.t;
    var rel = cu.querySelector("#e-reloj"); if (rel) rel.textContent = t + " s / " + ctx.dur + " s";
    var sl = cu.querySelector("#e-tiempo"); if (sl) { sl.value = t; sl.setAttribute("aria-valuetext", t + " segundos"); }
    ["rps", "p95"].forEach(function (k) {
      var ch = ctx.graf[k]; if (!ch) return;
      ch.data.datasets.forEach(function (ds, i) { ds.data = ctx.series[k][i].slice(0, t + 1); });
      ch.update("none");
    });
    ctx.sel.forEach(function (e, i) {
      var box = cu.querySelector('.e-maq[data-id="' + e.id + '"]'); if (!box) return;
      var v = e.en_vivo, k = Math.min(t, v.t.length - 1);
      var barras = box.querySelectorAll(".e-nuc i");
      (v.cores[k] || []).forEach(function (cv, j) { if (barras[j]) barras[j].style.height = Math.max(0, Math.min(100, cv || 0)) + "%"; });
      var set = function (n, s) { var el = box.querySelector('[data-k="' + n + '"]'); if (el) el.textContent = s; };
      var lim = TB.limCores(e), ram = e.config.ram_disponible_gb * 1024;
      set("rps", TB.nf(v.rps[k])); set("p95", TB.nf(v.p95[k], 1)); set("total", TB.nf(ctx.acum[i][k]));
      set("cpu", TB.nf(v.app_cpu[k], 2) + " / " + TB.nf(lim) + " núcleos");
      set("rss", TB.nf(v.rss[k]) + " / " + TB.nf(ram) + " MB");
      set("red", TB.nf(v.red_in_kbs[k])); set("disco", TB.nf(v.disco_iops[k])); set("gen", TB.nf(v.gen_cpu[k], 2));
      box.querySelector('[data-b="cpu"]').style.width = Math.min(100, 100 * (v.app_cpu[k] || 0) / lim) + "%";
      box.querySelector('[data-b="rss"]').style.width = Math.min(100, 100 * (v.rss[k] || 0) / ram) + "%";
    });
  }

  function render() {
    var cu = TB.cuerpo("vivo"); if (!cu) return;
    var estabaJugando = ESTADO.jugando;
    parar();
    var todos = envs();
    var lead = document.querySelector("#vivo .cab .lead");
    if (lead) lead.textContent = "Reproduce la repetición mediana de la carga sostenida (30 usuarios) de los entornos que elijas, a la vez. Cada barra es un núcleo lógico del procesador del host. Pulsa Espacio para reproducir o pausar.";
    if (!todos.length) { cu.innerHTML = '<p class="aviso-datos">Todavía no hay datos de la prueba en vivo.</p>'; ctx = null; return; }
    if (!ESTADO.sel) { ESTADO.sel = {}; todos.forEach(function (e) { ESTADO.sel[e.id] = true; }); }
    var sel = elegidos();
    if (!sel.length) { ESTADO.sel[todos[0].id] = true; sel = elegidos(); }
    var dur = durDe(sel);
    ESTADO.t = Math.min(ESTADO.t, dur);

    var chips = todos.map(function (e) {
      return '<label class="chip e-chip"><input type="checkbox" data-id="' + e.id + '"' + (ESTADO.sel[e.id] ? " checked" : "") + ">" + TB.llave(e.id) + "<span>" + TB.esc(e.nombre) + '</span><span class="e-check">' + TB.icono("check", 16) + "</span></label>";
    }).join("");
    var vels = [5, 10, 30, 60].map(function (v) { return '<button type="button" data-v="' + v + '" aria-pressed="' + (v === ESTADO.vel) + '">' + v + "×</button>"; }).join("");
    cu.innerHTML =
      '<div class="panel e-controles">' +
        '<h3><span class="icono-chip">' + TB.icono("play", 20) + "</span>Controles de la reproducción</h3>" +
        '<div><div class="rotulo" style="margin-bottom:12px">Entornos en pantalla</div><div class="e-chips" role="group" aria-label="Entornos">' + chips + "</div></div>" +
        '<div class="e-reproductor"><button class="btn e-play" id="e-play" type="button"></button>' +
        '<div class="e-seg" id="e-vel" role="group" aria-label="Velocidad">' + vels + "</div>" +
        '<input type="range" id="e-tiempo" min="0" max="' + dur + '" step="1" value="' + ESTADO.t + '" aria-label="Segundo de la prueba">' +
        '<div class="e-reloj" id="e-reloj">' + ESTADO.t + " s / " + dur + " s</div></div>" +
        '<div class="e-nota-tecla">Datos de la repetición mediana. Los primeros 60 s son calentamiento de la JVM. Tecla Espacio: reproducir / pausar.</div>' +
      "</div>" +
      '<div class="panel"><h3><span class="icono-chip primario">' + TB.icono("rayo", 20) + '</span><span id="e-t-rps"></span></h3><p class="sub">Peticiones atendidas por segundo (solo respuestas correctas) · fuente: peticiones.csv de la repetición mediana</p><div class="leyenda" id="e-ley-1"></div><div class="lienzo protagonista"><canvas id="e-vivo-rps"></canvas></div><p class="lectura">Cómo leerla: cada línea es un entorno; la línea punteada vertical marca el segundo que se está reproduciendo.</p></div>' +
      '<div class="panel"><h3><span class="icono-chip primario">' + TB.icono("reloj", 20) + '</span><span id="e-t-p95"></span></h3><p class="sub">Latencia p95 de cada segundo, en ms · fuente: peticiones.csv de la repetición mediana</p><div class="leyenda" id="e-ley-2"></div><div class="lienzo protagonista"><canvas id="e-vivo-p95"></canvas></div><p class="lectura">Cómo leerla: más abajo es mejor; la línea roja discontinua es el máximo aceptado (SLO).</p></div>' +
      '<div class="e-maquinas">' + sel.map(tarjeta).join("") + "</div>";

    document.getElementById("e-t-rps").textContent = tituloRps(sel);
    document.getElementById("e-t-p95").textContent = tituloP95(sel);
    TB.leyenda("#e-ley-1", sel); TB.leyenda("#e-ley-2", sel);

    var area = sel.length <= 2, series = { rps: [], p95: [] }, acum = [];
    sel.forEach(function (e) {
      ["rps", "p95"].forEach(function (k) { series[k].push(e.en_vivo[k].map(function (y, x) { return { x: x, y: y }; })); });
      var s = 0; acum.push(e.en_vivo.rps.map(function (r) { s += r || 0; return s; }));
    });
    var slo = TB.D.slo.p95_ms;
    var maxR = Math.max.apply(null, sel.map(function (e) { return maxDe(e.en_vivo.rps); }));
    var maxP = Math.max(slo * 1.25, Math.max.apply(null, sel.map(function (e) { return maxDe(e.en_vivo.p95); })) * 1.1);
    function ds(e) {
      var c = TB.color(e.id);
      return { label: e.nombre, data: [], borderColor: c, backgroundColor: TB.alfa(c, 0.12), fill: area, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: c, pointHoverBorderColor: TB.css("--surface"), pointHoverBorderWidth: 2, tension: 0.2, parsing: false };
    }
    function ops(unidad, ymax, yTitulo) {
      var tit = function (t) { return { display: true, text: t, color: TB.css("--ink-2"), font: { size: 14 } }; };
      return TB.opciones({
        parsing: false,
        plugins: { tooltip: { callbacks: {
          title: function (c) { return "Segundo " + c[0].parsed.x; },
          label: function (c) { return " " + c.dataset.label + ": " + TB.nf(c.parsed.y, unidad === "ms" ? 1 : 0) + " " + unidad; } } } },
        scales: {
          x: { type: "linear", min: 0, max: dur, title: tit("Tiempo de la prueba"),
            afterBuildTicks: function (ax) { var tk = []; for (var v = 0; v <= dur; v += 60) tk.push({ value: v }); ax.ticks = tk; },
            ticks: { callback: function (v) { return v + " s"; }, maxRotation: 0 } },
          y: { min: 0, max: ymax, title: tit(yTitulo), ticks: { callback: function (v) { return TB.nf(v); } } }
        }
      });
    }
    ctx = { sel: sel, dur: dur, series: series, acum: acum, graf: {} };
    ctx.graf.rps = TB.grafica("e-vivo-rps", { type: "line", data: { datasets: sel.map(ds) }, options: ops("req/s", Math.ceil(maxR * 1.1 / 50) * 50, "Peticiones por segundo"), plugins: [pluginAhora()] });
    ctx.graf.p95 = TB.grafica("e-vivo-p95", { type: "line", data: { datasets: sel.map(ds) }, options: ops("ms", Math.ceil(maxP / 100) * 100, "p95 (ms)"), plugins: [pluginAhora(), pluginSLO(slo)] });

    cu.querySelectorAll(".e-chip input").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var id = inp.getAttribute("data-id");
        ESTADO.sel[id] = inp.checked;
        if (!elegidos().length) ESTADO.sel[id] = true; /* mínimo uno */
        var j = ESTADO.jugando; render(); if (j) arrancar();
      });
    });
    document.getElementById("e-play").addEventListener("click", function () { if (ESTADO.jugando) parar(); else arrancar(); });
    [].slice.call(cu.querySelectorAll("#e-vel button")).forEach(function (bt) {
      bt.addEventListener("click", function () {
        ESTADO.vel = +bt.getAttribute("data-v");
        [].slice.call(cu.querySelectorAll("#e-vel button")).forEach(function (o) { o.setAttribute("aria-pressed", o === bt ? "true" : "false"); });
      });
    });
    document.getElementById("e-tiempo").addEventListener("input", function (ev) { ESTADO.t = +ev.target.value; pintar(); });
    btnPlay(false);
    pintar();
    if (estabaJugando) { var t0 = ESTADO.t; arrancar(); ESTADO.t = t0; }
  }

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== " " && ev.code !== "Space") return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var t = ev.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || (t && t.isContentEditable)) return;
    var s = document.getElementById("vivo"); if (!s || !ctx) return;
    var r = s.getBoundingClientRect(), h = window.innerHeight;
    if (Math.min(r.bottom, h) - Math.max(r.top, 0) < h * 0.4) return;
    ev.preventDefault();
    if (ESTADO.jugando) parar(); else arrancar();
  });

  TB.seccion("vivo", render);
})();
