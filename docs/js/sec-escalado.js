/* #escalado: simulador de usuarios + curvas de escalado (Agente E) */
(function () {
  "use strict";
  var IDX = null; /* índice del slider; se conserva entre repintados */
  var graf = {};

  function protocolo() { var e = TB.E[0]; return (e && e.ficha && e.ficha.protocolo) || { vus: 30, pausa_s: 0.05 }; }
  function pasos() {
    var s = {}; TB.E.forEach(function (e) { (e.escalado || []).forEach(function (p) { s[p.vus] = 1; }); });
    return Object.keys(s).map(Number).sort(function (a, b) { return a - b; });
  }
  function dentro(s) { return s.p95_ms <= TB.D.slo.p95_ms && s.tasa_error_pct <= TB.D.slo.error_pct; }
  function rodilla(e) { var u = null; (e.escalado || []).forEach(function (s) { if (dentro(s)) u = s; }); return u; }
  function xMax(e) { return Math.max.apply(null, (e.escalado || []).map(function (s) { return s.rps; })); }
  function fis(e) { return (e.tipo === "fisica" || e.tipo === "control") && e.ficha && e.ficha.nucleos_fisicos ? e.ficha.nucleos_fisicos : null; }
  function cpuPct(e, s) { var f = fis(e); return f ? 100 * s.app_cpu_prom / f : s.app_cpu_uso_limite_pct; }
  function cpuTxt(e, s) {
    var f = fis(e), p = cpuPct(e, s);
    if (f && p > 100) return TB.nf(s.app_cpu_prom, 1) + " núcleos sobre " + f + " físicos";
    return TB.nf(p) + " %";
  }
  function fuente() { return TB.css("--font-ui") || "Inter, sans-serif"; }
  function caja(c, txt, x, y, alinea) {
    c.save(); c.font = "600 12px " + fuente(); c.textBaseline = "middle";
    var w = c.measureText(txt).width + 16, h = 24, x0 = alinea === "right" ? x - w : x;
    c.beginPath(); if (c.roundRect) c.roundRect(x0, y - h / 2, w, h, 8); else c.rect(x0, y - h / 2, w, h);
    c.fillStyle = TB.css("--surface"); c.fill(); c.lineWidth = 1; c.strokeStyle = TB.css("--border"); c.stroke();
    c.fillStyle = TB.css("--ink"); c.textAlign = "left"; c.fillText(txt, x0 + 8, y + 1); c.restore();
    return w;
  }
  function pill(ok, txt) { return '<span class="pastilla ' + ok + '">' + TB.icono(ok === "ok" ? "check" : ok === "no" ? "cruz" : "alerta", 14) + txt + "</span>"; }
  function siguiente(e) { var r = rodilla(e); return r ? e.escalado[e.escalado.indexOf(r) + 1] : e.escalado[0]; }

  function rompe(e, s) {
    var ps = e.escalado, i = ps.indexOf(s), prev = i > 0 ? ps[i - 1] : null;
    var cpu = cpuPct(e, s);
    if (s.tasa_error_pct > TB.D.slo.error_pct) return "Errores: " + TB.nf(s.tasa_error_pct, 1) + " % de las peticiones falla";
    if (cpu >= 85) return (fis(e) ? (e.tipo === "control" ? "Topa con los mismos " + fis(e) + " núcleos físicos, a través de la VM de WSL2 (" + cpuTxt(e, s) + ")" : "Satura sus " + fis(e) + " núcleos físicos (" + cpuTxt(e, s) + (cpuPct(e, s) > 100 ? ": Hyper-Threading aporta un poco" : "; los hilos de Hyper-Threading aportan poco") + ")") + ": las peticiones hacen cola" : "CPU saturada (" + TB.nf(cpu) + " % del límite): las peticiones hacen cola");
    var crece = prev ? (s.rps - prev.rps) / prev.rps * 100 : null;
    if (crece != null && crece < 10 && s.vus > prev.vus * 1.5) return "El throughput ya no crece (" + (crece >= 0 ? "+" : "") + TB.nf(crece) + " %) con la CPU en " + TB.nf(cpu) + " %: la cola está en otra parte (red de Docker o generador en el mismo host)";
    if (!dentro(s)) return "La latencia supera el acuerdo de servicio";
    return "Tiene margen";
  }

  function render() {
    var cu = TB.cuerpo("escalado"); if (!cu) return;
    var E = TB.E.filter(function (e) { return e.escalado && e.escalado.length; });
    var lead = document.querySelector("#escalado .cab .lead");
    if (lead) lead.textContent = "Después de la carga sostenida subimos los usuarios concurrentes en escalones de 45 s. Todos los escalones son medidos.";
    if (!E.length) { cu.innerHTML = '<p class="aviso-datos">Todavía no hay datos de escalado.</p>'; return; }

    var P = protocolo(), pausa = P.pausa_s != null ? P.pausa_s : 0.05, slo = TB.D.slo.p95_ms;
    var VUS = pasos(), N_EXT = 300, total = VUS.length;
    if (IDX == null || IDX >= total) { var d = VUS.indexOf(40); IDX = d >= 0 ? d : 0; }
    var Xmax = Math.max.apply(null, E.map(xMax));
    var W = (N_EXT / Xmax - pausa) * 1000; /* ms, latencia media por Little */

    var etiquetas = VUS.map(function (v) { return "<span data-i='" + VUS.indexOf(v) + "'>" + v + "</span>"; }).join("");
    cu.innerHTML =
      '<div class="panel"><h3><span class="icono-chip primario">' + TB.icono("rayo", 20) + '</span><span id="e-t-thr"></span></h3><p class="sub">Peticiones por segundo según los usuarios concurrentes (eje horizontal logarítmico) · fuente: escalado de cada entorno</p><div class="leyenda" id="e-ley-thr"></div><div class="lienzo protagonista"><canvas id="e-esc-thr"></canvas></div><p class="lectura">Cómo leerla: el punto grande es la rodilla, el último escalón que cumple el SLO. Cuando la curva se aplana, el entorno llegó a su techo.</p></div>' +
      '<div class="panel"><h3><span class="icono-chip primario">' + TB.icono("reloj", 20) + '</span><span id="e-t-escp95"></span></h3><p class="sub">Latencia p95 en ms según los usuarios concurrentes (ambos ejes logarítmicos) · fuente: escalado de cada entorno</p><div class="leyenda" id="e-ley-p95"></div><div class="lienzo protagonista"><canvas id="e-esc-p95"></canvas></div><p class="lectura">Cómo leerla: más abajo es mejor. La zona rosada es lo que supera el acuerdo de ' + slo + ' ms.</p></div>' +
      '<div id="e-concl"></div>';

    /* títulos y conclusiones calculados */
    var rod = E.map(function (e) { return { e: e, r: rodilla(e) }; });
    var mejor = rod.slice().sort(function (a, b) { return (b.r ? b.r.vus : 0) - (a.r ? a.r.vus : 0) || xMax(b.e) - xMax(a.e); })[0];
    var peor = rod.slice().sort(function (a, b) { return (a.r ? a.r.vus : 0) - (b.r ? b.r.vus : 0) || xMax(a.e) - xMax(b.e); })[0];
    var mx = E.slice().sort(function (a, b) { return xMax(b) - xMax(a); })[0], mn = E.slice().sort(function (a, b) { return xMax(a) - xMax(b); })[0];
    document.getElementById("e-t-thr").textContent = TB.nombreCorto(mx) + " llega a " + TB.nf(xMax(mx)) + " req/s antes de aplanarse; " + TB.nombreCorto(mn) + " se queda en " + TB.nf(xMax(mn));
    document.getElementById("e-t-escp95").textContent = mejor.r ? TB.nombreCorto(mejor.e) + " mantiene el p95 dentro del SLO hasta " + mejor.r.vus + " usuarios" + (peor !== mejor ? "; " + TB.nombreCorto(peor.e) + " solo hasta " + (peor.r ? peor.r.vus : "ninguno") : "") : "Ningún entorno mantiene el SLO";
    TB.leyenda("#e-ley-thr", E); TB.leyenda("#e-ley-p95", E);

    var maxErr = Math.max.apply(null, E.map(function (e) { return Math.max.apply(null, e.escalado.map(function (s) { return s.tasa_error_pct || 0; })); }));
    var sat = [], plano = [];
    E.forEach(function (e) {
      var sig = siguiente(e); if (!sig) return;
      (cpuPct(e, sig) >= 85 ? sat : plano).push({ e: e, s: sig });
    });
    var partes = [];
    var lim = sat.filter(function (x) { return x.e.tipo === "contenedor"; }), nu = sat.filter(function (x) { return x.e.tipo === "nube"; }), fi = sat.filter(function (x) { return x.e.tipo === "fisica"; }), co = sat.filter(function (x) { return x.e.tipo === "control"; });
    if (lim.length) partes.push("en los contenedores con límite la CPU llega a su tope (" + lim.map(function (x) { return TB.nombreCorto(x.e) + " " + TB.nf(cpuPct(x.e, x.s)) + " % con " + x.s.vus + " usuarios"; }).join(", ") + ") y las peticiones hacen cola");
    if (nu.length) partes.push(nu.map(function (x) { return TB.nombreCorto(x.e) + " llega al " + TB.nf(x.s.cpu_total_prom, 0) + " % de sus 2 vCPU con " + x.s.vus + " usuarios (la app ocupa " + TB.nf(cpuPct(x.e, x.s)) + " % y el generador el resto)"; }).join(", "));
    if (fi.length) partes.push(fi.map(function (x) { return TB.nombreCorto(x.e); }).join(" y ") + " satura sus " + fis(fi[0].e) + " núcleos físicos (" + cpuTxt(fi[0].e, fi[0].s) + " con " + fi[0].s.vus + " usuarios); los hilos de Hyper-Threading aportan poco");
    if (co.length) {
      var ec = co[0].e, ef = E.filter(function (e) { return e.tipo === "fisica"; })[0], p5 = function (e) { return e.escalado.filter(function (x) { return x.vus === 5; })[0]; };
      var cola = "";
      if (ef && p5(ec) && p5(ef)) cola = ". Costo medido de la capa de Docker Desktop (VM de WSL2 y reenvío de puertos; los datos no separan cuál pesa más): con 5 usuarios su p95 mínimo es ≈ " + TB.nf(p5(ec).p95_ms) + " ms frente a ≈ " + TB.nf(p5(ef).p95_ms) + " ms en la física, y su techo es " + TB.nf(xMax(ec)) + " req/s frente a " + TB.nf(xMax(ef)) + " req/s";
      partes.push(TB.nombreCorto(ec) + " topa con los mismos " + fis(ec) + " núcleos físicos, a través de la VM de WSL2 (" + cpuTxt(ec, co[0].s) + " con " + co[0].s.vus + " usuarios)" + cola);
    }
    plano.forEach(function (x) { partes.push(TB.nombreCorto(x.e) + " se aplana con la CPU al " + TB.nf(cpuPct(x.e, x.s)) + " %"); });
    var txtSat = partes.join("; "), txtPlano = "";
    document.getElementById("e-concl").innerHTML =
      '<p class="conclusion">' + TB.esc(TB.nombreCorto(mejor.e)) + " sostiene más usuarios dentro del SLO (" + (mejor.r ? mejor.r.vus : 0) + ") con " + TB.nf(xMax(mejor.e)) + " req/s de techo; " + TB.esc(TB.nombreCorto(peor.e)) + " tiene su rodilla en " + (peor.r ? peor.r.vus : "—") + " usuarios; desde " + (siguiente(peor.e) ? siguiente(peor.e).vus : "—") + " supera el SLO.</p>" +
      '<p class="conclusion">Lo primero que se rompe es la CPU: cada entorno deja de crecer cuando su CPU llega al tope, y desde ahí más usuarios solo hacen más lenta la respuesta. ' + (maxErr > 0 ? "Se observaron errores de hasta " + TB.nf(maxErr, 1) + " %." : "No se observaron errores: la degradación es solo de latencia, no de fallos.") + "</p>";

    /* tabla */
    function tabla() {
      var i = IDX, ex = i === VUS.length, v = ex ? N_EXT : VUS[i];
      document.getElementById("e-vus").innerHTML = TB.nf(v) + ' <small>usuarios' + (ex ? " · extrapolado" : "") + "</small>";
      document.getElementById("e-vus-x").textContent = "×" + TB.nf(v / P.vus, v < P.vus ? 2 : 1) + " la carga de la prueba sostenida (" + P.vus + " usuarios)";
      document.getElementById("e-aviso").innerHTML = ex ? '<div class="e-aviso-extra"><b>Extrapolado, no medido.</b> Ley de Little: con N = ' + N_EXT + ' usuarios y el throughput máximo observado (' + TB.nf(Xmax) + ' req/s), la latencia media es W ≈ N / X − pausa = ' + N_EXT + " / " + TB.nf(Xmax) + " − " + TB.nf(pausa, 2) + " s ≈ " + TB.nf(W) + " ms. El p95 no se puede deducir de aquí.</div>" : "";
      [].slice.call(document.querySelectorAll("#e-pasos span")).forEach(function (sp) { sp.classList.toggle("sel", +sp.getAttribute("data-i") === i); });
      var filas = E.map(function (e) {
        var nom = '<span class="nom">' + TB.llave(e.id) + TB.esc(e.nombre) + "</span>";
        if (ex) {
          var x = xMax(e), w = (N_EXT / x - pausa) * 1000, ult = e.escalado[e.escalado.length - 1], ok = w <= slo;
          return "<tr><td>" + nom + '</td><td class="n">≈ ' + TB.nf(x) + ' <span class="extra">(techo)</span></td><td class="n">—</td><td class="n">—</td><td class="n">≈ ' + TB.nf(cpuPct(e, ult)) + ' %</td><td>' +
            (ok ? pill("aviso", "Sin confirmar") : pill("no", "No cumple")) +
            '</td><td class="rompe">≈ ' + TB.nf(w) + " ms de latencia media <span class='extra'>(extrapolado)</span>" + (ok ? ": cabe en el SLO, pero el p95 real sería mayor" : ": la media ya supera el SLO de " + slo + " ms, el p95 sería peor") + "</td></tr>";
        }
        var s = e.escalado.filter(function (p) { return p.vus === v; })[0];
        if (!s) return "<tr><td>" + nom + '</td><td colspan="6" class="muted">Sin escalón de ' + v + " usuarios</td></tr>";
        return "<tr><td>" + nom + '</td><td class="n">' + TB.nf(s.rps) + '</td><td class="n">' + TB.nf(s.p95_ms, 1) + ' ms</td><td class="n">' + TB.nf(s.p99_ms, 1) + ' ms</td><td class="n">' + cpuTxt(e, s) + '</td><td>' +
          (dentro(s) ? pill("ok", "Cumple") : pill("no", "No cumple")) + '</td><td class="rompe">' + TB.esc(rompe(e, s)) + "</td></tr>";
      }).join("");
      document.getElementById("e-tabla").innerHTML = "<thead><tr><th>Entorno</th><th class='n'>req/s</th><th class='n'>p95</th><th class='n'>p99</th><th class='n'>CPU app / límite</th><th>Estado</th><th>Qué se rompe primero</th></tr></thead><tbody>" + filas + "</tbody>";
      ["thr", "p95"].forEach(function (k) { if (graf[k]) graf[k].draw(); });
    }

    /* gráficas */
    var ink = TB.css("--ink"), surf = TB.css("--surface");
    function datos(e, k) { return e.escalado.map(function (s) { return { x: s.vus, y: s[k] }; }); }
    function ds(e, k) {
      var c = TB.color(e.id), r = rodilla(e);
      return { label: e.nombre, data: datos(e, k), borderColor: c, backgroundColor: c, borderWidth: 2, tension: 0, parsing: false,
        pointRadius: e.escalado.map(function (s) { return r && s === r ? 8 : 4; }),
        pointHoverRadius: 9, pointBackgroundColor: c, pointBorderColor: surf, pointBorderWidth: 2, pointHoverBorderWidth: 2 };
    }
    var plugVus = {
      id: "eVus",
      afterDatasetsDraw: function (ch) {
        if (IDX >= VUS.length) return;
        var a = ch.chartArea, c = ch.ctx, x = ch.scales.x.getPixelForValue(VUS[IDX]);
        c.save(); c.strokeStyle = ink; c.lineWidth = 2; c.setLineDash([5, 4]);
        c.beginPath(); c.moveTo(x, a.top); c.lineTo(x, a.bottom); c.stroke(); c.setLineDash([]); c.restore();
        caja(c, VUS[IDX] + " usuarios", x + 6, a.bottom - 16, "left");
      }
    };
    var plugRod = {
      id: "eRodilla",
      afterDatasetsDraw: function (ch) {
        var c = ch.ctx, a = ch.chartArea, items = [];
        c.save(); c.font = "600 12px " + fuente();
        ch.data.datasets.forEach(function (d, i) {
          var e = E[i], r = rodilla(e); if (!r) return;
          var p = ch.getDatasetMeta(i).data[e.escalado.indexOf(r)]; if (!p) return;
          var txt = "rodilla: " + r.vus + " VUs", w = c.measureText(txt).width + 16;
          items.push({ px: p.x, py: p.y, y: p.y, txt: txt, w: w, dcha: p.x + 24 + w < a.right });
        });
        c.restore();
        [true, false].forEach(function (lado) {
          var g = items.filter(function (it) { return it.dcha === lado; }).sort(function (u, v) { return u.py - v.py; });
          for (var k = 1; k < g.length; k++) if (g[k].y - g[k - 1].y < 28) g[k].y = g[k - 1].y + 28;
          g.forEach(function (it) {
            var x0 = it.px + (lado ? 24 : -24 - it.w);
            c.save(); c.strokeStyle = TB.css("--ink-2"); c.lineWidth = 1;
            c.beginPath(); c.moveTo(it.px + (lado ? 9 : -9), it.py); c.lineTo(x0 + (lado ? 0 : it.w), it.y); c.stroke(); c.restore();
            caja(c, it.txt, x0, it.y, "left");
          });
        });
      }
    };
    var plugSLO = {
      id: "eSLOesc",
      beforeDatasetsDraw: function (ch) {
        var a = ch.chartArea, c = ch.ctx, y = ch.scales.y.getPixelForValue(slo);
        if (y > a.top) { c.save(); c.fillStyle = TB.alfa(TB.css("--crit"), 0.06); c.fillRect(a.left, a.top, a.right - a.left, Math.min(y, a.bottom) - a.top); c.restore(); }
      },
      afterDatasetsDraw: function (ch) {
        var a = ch.chartArea, c = ch.ctx, y = ch.scales.y.getPixelForValue(slo);
        c.save(); c.strokeStyle = TB.css("--crit"); c.lineWidth = 2; c.setLineDash([8, 5]);
        c.beginPath(); c.moveTo(a.left, y); c.lineTo(a.right, y); c.stroke(); c.setLineDash([]); c.restore();
        caja(c, "SLO " + slo + " ms", a.right - 6, y - 16, "right");
      }
    };
    var tit = function (t) { return { display: true, text: t, color: TB.css("--ink-2"), font: { size: 14 } }; };
    var ejeX = {
      type: "logarithmic", min: VUS[0] * 0.8, max: VUS[VUS.length - 1] * 1.25, title: tit("Usuarios concurrentes (VUs)"),
      afterBuildTicks: function (ax) { ax.ticks = VUS.map(function (v) { return { value: v }; }); },
      ticks: { callback: function (v) { return TB.nf(v); }, maxRotation: 0 }
    };
    var allP = []; E.forEach(function (e) { e.escalado.forEach(function (s) { allP.push(s.p95_ms); }); });
    var cand = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000];
    var yMin = cand.filter(function (c) { return c <= Math.min.apply(null, allP.concat([slo])); }).pop() || 1;
    var yMax = cand.filter(function (c) { return c >= Math.max.apply(null, allP.concat([slo])); })[0] || 10000;
    var maxT = Math.max.apply(null, E.map(xMax));

    var optBase = function (extra) { return TB.opciones(extra); };
    graf.thr = TB.grafica("e-esc-thr", { type: "line", data: { datasets: E.map(function (e) { return ds(e, "rps"); }) }, plugins: [plugRod],
      options: optBase({ parsing: false,
        layout: { padding: { right: 8 } },
        plugins: { tooltip: { callbacks: { title: function (c) { return TB.nf(c[0].parsed.x) + " usuarios"; }, label: function (c) { return " " + c.dataset.label + ": " + TB.nf(c.parsed.y) + " req/s"; } } } },
        scales: { x: ejeX, y: { min: 0, max: Math.ceil(maxT * 1.1 / 100) * 100, title: tit("Peticiones por segundo"), ticks: { callback: function (v) { return TB.nf(v); } } } } }) });
    var ejeY = { type: "logarithmic", min: yMin, max: yMax, beginAtZero: false, title: tit("p95 (ms, escala log)"),
      afterBuildTicks: function (ax) { ax.ticks = cand.filter(function (c) { return c >= yMin && c <= yMax; }).map(function (v) { return { value: v }; }); },
      ticks: { callback: function (v) { return TB.nf(v); } } };
    graf.p95 = TB.grafica("e-esc-p95", { type: "line", data: { datasets: E.map(function (e) { return ds(e, "p95_ms"); }) }, plugins: [plugSLO, plugRod],
      options: optBase({ parsing: false,
        plugins: { tooltip: { callbacks: { title: function (c) { return TB.nf(c[0].parsed.x) + " usuarios"; }, label: function (c) { return " " + c.dataset.label + ": " + TB.nf(c.parsed.y, 1) + " ms"; } } } },
        scales: { x: ejeX, y: ejeY } }) });

  }

  TB.seccion("escalado", render);
})();
