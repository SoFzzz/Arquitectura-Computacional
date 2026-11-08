/* #latencia: CDF, escalera de percentiles, mapa de calor por endpoint, repeticiones */
(function () {
  "use strict";
  var TB = window.TB;
  var TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  var RAMPA = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
  var OPS = [
    ["inicio", "GET /", "inicio"],
    ["listar_duenos", "GET /owners", "listar dueños"],
    ["buscar_apellido", "GET /owners?lastName=", "buscar por apellido"],
    ["detalle_dueno", "GET /owners/{id}", "detalle del dueño"],
    ["veterinarios", "GET /vets", "veterinarios"],
    ["editar_dueno", "POST /owners/{id}/edit", "editar dueño"]
  ];

  function ms(v) { return TB.nf(v, v < 10 ? 1 : 0) + " ms"; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  var FUENTE = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
  function caja(ctx, txt, x, y, align) {
    ctx.save(); ctx.font = "600 12px " + FUENTE;
    var w = ctx.measureText(txt).width + 16, h = 22, x0 = align === "right" ? x - w : x, y0 = y - h / 2, r = 8;
    ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r); ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r); ctx.arcTo(x0, y0 + h, x0, y0, r); ctx.arcTo(x0, y0, x0 + w, y0, r); ctx.closePath();
    ctx.fillStyle = TB.css("--surface"); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = TB.css("--border"); ctx.stroke();
    ctx.fillStyle = TB.css("--ink"); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(txt, x0 + 8, y + 0.5); ctx.restore();
  }
  function panelI(ic, prot, h, sub, cuerpo, lectura, concl) {
    return '<div class="panel' + (prot ? ' protagonista' : '') + '"><h3><span class="icono-chip' + (prot ? ' primario' : '') + '">' + TB.icono(ic, 20) + '</span>' + TB.esc(h) + '</h3><p class="sub">' + sub + '</p>' + cuerpo +
      (lectura ? '<p class="lectura">Cómo leerla: ' + lectura + '</p>' : '') +
      (concl ? '<p class="conclusion">' + concl + '</p>' : '') + '</div>';
  }
  function opc(extra) {
    var o = TB.opciones(extra || {});
    ["x", "y"].forEach(function (k) { o.scales[k].ticks.font = Object.assign({}, o.scales[k].ticks.font, { size: 14 }); });
    return o;
  }
  function titulo(txt) { return { display: true, text: txt, color: TB.css("--ink-2"), font: { size: 14, family: FUENTE }, padding: { top: 6 } }; }
  function maxTick(v) { for (var i = 0; i < TICKS.length; i++) if (TICKS[i] >= v) return TICKS[i]; return TICKS[TICKS.length - 1]; }
  function logX(max, extra) {
    return Object.assign({
      type: "logarithmic", min: 1, max: max, beginAtZero: false,
      afterBuildTicks: function (ax) { ax.ticks = TICKS.filter(function (t) { return t <= max; }).map(function (t) { return { value: t }; }); },
      ticks: { font: { size: 14 }, maxRotation: 0, minRotation: 0, callback: function (v) { return TB.nf(v); } }
    }, extra || {});
  }
  function vertical(valor, texto, color) {
    return {
      id: "vert" + texto,
      afterDatasetsDraw: function (c) {
        var x = c.scales.x, a = c.chartArea, ctx = c.ctx, px = x.getPixelForValue(valor);
        if (px < a.left || px > a.right) return;
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
        ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore(); caja(ctx, texto, px - 6, a.bottom - 18, "right");
      }
    };
  }
  function lum(hex) { var n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255); }

  function pintar() {
    var cuerpo = TB.cuerpo("latencia"); if (!cuerpo) return;
    var estrecho = window.innerWidth < 760; estaEstrecho = estrecho;
    var E = TB.E.filter(function (e) { return e.percentiles; });
    var lead = document.querySelector("#latencia .cab .lead");
    if (!E.length) { cuerpo.innerHTML = '<p class="aviso-datos">Sin datos de latencia.</p>'; return; }
    var slo = TB.D.slo.p95_ms, crit = TB.css("--crit"), muted = TB.css("--muted"), surf = TB.css("--surface"), ink = TB.css("--ink");
    var ord = E.slice().sort(function (a, b) { return a.percentiles.p95 - b.percentiles.p95; });
    var mejor = ord[0], peor = ord[ord.length - 1];
    var fuera = ord.filter(function (e) { return e.percentiles.p95 > slo; });
    if (lead) lead.textContent = "El promedio esconde la cola: unas pocas peticiones lentas son las que siente el usuario. Mostramos la mediana de tres repeticiones para cada percentil, con el límite del acuerdo de servicio (p95 de " + slo + " ms) como referencia.";

    /* ---- 6 CDF ---- */
    var maxMs = Math.max.apply(null, E.map(function (e) { return (e.cdf && e.cdf.length ? e.cdf[e.cdf.length - 1].ms : e.percentiles.max); }));
    var xmax = maxTick(Math.max(maxMs * 1.1, slo * 1.7));
    var t6 = "El 95 % de las peticiones termina en " + ms(mejor.percentiles.p95) + " en " + TB.nombreCorto(mejor) + " y en " + ms(peor.percentiles.p95) + " en " + TB.nombreCorto(peor);
    var c6 = !fuera.length ? "Los " + ord.length + " entornos cumplen el límite de " + slo + " ms en p95."
      : fuera.length + " de " + ord.length + " entornos pasan el límite de " + slo + " ms en p95: " + fuera.map(TB.nombreCorto).join(", ") + ".";
    var h6 = panelI("reloj", true, t6, "Distribución acumulada de la latencia por entorno · repetición mediana, solo respuestas correctas · eje horizontal en escala logarítmica",
      '<div class="leyenda" id="d-ley-cdf"></div><div class="lienzo protagonista"><canvas id="d-cdf" role="img" aria-label="Curva acumulada de latencia por entorno"></canvas></div>',
      "cuanto más a la izquierda y más arriba esté la curva, más rápido responde. Donde la curva cruza 95 % está el p95; la línea roja punteada es el límite del acuerdo de servicio.", c6);
    var h7 = panelI("grafica", false, "La cola (p99) es " + TB.nf(peor.percentiles.p99 / peor.percentiles.p50, 0) + " veces la mediana en " + TB.nombreCorto(peor),
      "Rango p50 a p99 por entorno, de mejor a peor · ms, escala logarítmica",
      '<div class="lienzo alto"><canvas id="d-esc" role="img" aria-label="Escalera de percentiles"></canvas></div>',
      "la barra va de la mediana (p50) a la cola (p99); los círculos marcan p50, p90, p95 (con borde oscuro) y p99, de izquierda a derecha. Cuanto más larga la barra, más impredecible es el tiempo de respuesta.");

    /* ---- 9 repeticiones ---- */
    var maxRep = Math.max.apply(null, E.map(function (e) { return (e.repeticiones_serie || []).length; }));
    var gan = E.map(function (e) {
      var s = e.repeticiones_serie || [];
      return { e: e, g: s.length > 1 ? (s[s.length - 1].rps / s[0].rps - 1) * 100 : null };
    }).filter(function (x) { return x.g != null; });
    var lim = gan.filter(function (x) { return x.e.id !== "fisica-local"; });
    var fis = gan.filter(function (x) { return x.e.id === "fisica-local"; })[0];
    var gmax = lim.length ? lim.reduce(function (a, b) { return b.g > a.g ? b : a; }) : null;
    var t9 = gmax ? TB.nombreCorto(gmax.e) + " gana " + TB.nf(gmax.g, 0) + " % de throughput entre la repetición 1 y la " + gmax.e.repeticiones_serie.length : "Las repeticiones se estabilizan";
    var c9 = gmax ? "En los contenedores limitados la primera repetición es la más lenta: el compilador JIT de Java necesita CPU para calentarse y el límite se la quita a la aplicación. " +
      (fis ? "La máquina física varía solo " + TB.nf(Math.abs(fis.g), 0) + " % porque le sobran núcleos." : "") : "";
    var h9 = panelI("grafica", false, t9, "Peticiones por segundo en cada repetición de la prueba · req/s" + (E.some(function (e) { return (e.repeticiones_serie || []).length < maxRep; }) ? " · algún entorno tiene menos repeticiones" : ""),
      '<div class="leyenda" id="d-ley-rep"></div><div class="lienzo rep"><canvas id="d-rep" role="img" aria-label="Throughput por repetición"></canvas></div>',
      "cada línea es un entorno; si sube de la repetición 1 a la 3, el sistema todavía se estaba calentando al principio.", c9);

    /* ---- 8 mapa de calor ---- */
    var vals = [];
    ord.forEach(function (e) { (e.endpoints || []).forEach(function (x) { vals.push(x.p95); }); });
    var vmin = Math.min.apply(null, vals), vmax = Math.max.apply(null, vals);
    function paso(v) { var t = (Math.log(v) - Math.log(vmin)) / ((Math.log(vmax) - Math.log(vmin)) || 1); return Math.max(0, Math.min(6, Math.floor(t * 7))); }
    var th = '<tr><th>Operación</th>' + ord.map(function (e) { return '<th class="n"><span class="nom">' + TB.llave(e.id) + TB.esc(TB.nombreCorto(e)) + '</span></th>'; }).join("") + '</tr>';
    var filas = OPS.map(function (o) {
      var c = ord.map(function (e) {
        var x = (e.endpoints || []).filter(function (q) { return q.endpoint === o[0]; })[0];
        if (!x) return '<td class="n hm">—</td>';
        var col = RAMPA[paso(x.p95)];
        return '<td class="n hm" style="background:' + col + ';color:' + (lum(col) > 150 ? "#12161d" : "#ffffff") + '" title="p50 ' + ms(x.p50) + ' · p95 ' + ms(x.p95) + ' · p99 ' + ms(x.p99) + '">' + ms(x.p95) + (x.p95 > slo ? " ✕" : "") + '</td>';
      }).join("");
      return '<tr><th scope="row" class="op"><b>' + cap(o[2]) + '</b><code>' + TB.esc(o[1]) + '</code></th>' + c + '</tr>';
    }).join("");
    var peores = {};
    ord.forEach(function (e) {
      var m = (e.endpoints || []).slice().sort(function (a, b) { return b.p95 - a.p95; })[0]; if (m) peores[m.endpoint] = (peores[m.endpoint] || 0) + 1;
    });
    var pk = Object.keys(peores).sort(function (a, b) { return peores[b] - peores[a]; })[0];
    var nom = OPS.filter(function (o) { return o[0] === pk; })[0];
    var t8 = nom ? "“" + cap(nom[2]) + "” es la operación más lenta en " + (peores[pk] === ord.length ? "los " + ord.length + " entornos" : peores[pk] + " de " + ord.length + " entornos") : "Latencia p95 por operación";
    var ramp = '<div class="rampa-leyenda"><span>' + ms(vmin) + '</span><span class="rampa">' + RAMPA.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + '</span><span>' + ms(vmax) + '</span><em>p95 por operación, escala logarítmica</em></div>';
    var h8 = panelI("capas", false, t8, "Latencia p95 por operación y entorno · ms · columnas de mejor a peor entorno",
      ramp + '<div class="tabla"><table class="mapa" style="min-width:0"><thead>' + th + '</thead><tbody>' + filas + '</tbody></table></div>',
      "cada celda es el p95 de una operación en un entorno; más oscuro significa más lento. ✕ marca lo que pasa el límite de " + slo + " ms.",
      "Las operaciones que recorren listas completas pesan más que las que tocan un solo registro.");

    cuerpo.innerHTML = h6 + '<div class="rejilla-2">' + h7 + h9 + '</div>' + h8;
    TB.leyenda("#d-ley-cdf", ord); TB.leyenda("#d-ley-rep", E);

    /* CDF */
    var guias = {
      id: "guias",
      afterDatasetsDraw: function (c) {
        var y = c.scales.y, a = c.chartArea, ctx = c.ctx;
        ctx.save(); ctx.font = "600 14px " + FUENTE; ctx.textBaseline = "bottom";
        [[50, "p50"], [95, "p95"], [99, "p99"]].forEach(function (g) {
          var py = y.getPixelForValue(g[0]);
          ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
          ctx.setLineDash([]); caja(ctx, g[1], a.left + 8, g[0] === 95 ? py + 14 : py - 14, "left");
        });
        ctx.restore();
      }
    };
    TB.grafica("d-cdf", {
      type: "line",
      data: {
        datasets: ord.map(function (e) {
          return { label: TB.nombreCorto(e), borderColor: TB.color(e.id), backgroundColor: TB.color(e.id), borderWidth: 2, pointRadius: 0, pointHoverRadius: 6, tension: 0,
            data: (e.cdf || []).filter(function (q) { return q.ms > 0; }).map(function (q) { return { x: q.ms, y: q.p }; }) };
        })
      },
      options: opc({
        interaction: { mode: "nearest", axis: "x", intersect: false },
        layout: { padding: { right: 12 } },
        scales: { x: logX(xmax, { title: titulo("Latencia de la petición (ms, escala logarítmica)") }), y: { min: 0, max: 100, title: titulo("% de peticiones atendidas"), ticks: { stepSize: 25, callback: function (v) { return v + " %"; } } } },
        plugins: { tooltip: { callbacks: { title: function (it) { return it.length ? "≤ " + ms(it[0].parsed.x) : ""; }, label: function (it) { return it.dataset.label + ": " + TB.nf(it.parsed.y, 1) + " % de las peticiones"; } } } }
      }),
      plugins: [guias, vertical(slo, "SLO " + slo + " ms", crit)]
    });

    /* escalera */
    var xe = maxTick(Math.max.apply(null, ord.map(function (e) { return e.percentiles.p99; })) * 1.3);
    var marcas = {
      id: "marcas",
      afterDatasetsDraw: function (c) {
        var x = c.scales.x, y = c.scales.y, ctx = c.ctx;
        ctx.save(); ctx.font = "600 14px " + FUENTE; ctx.textBaseline = "middle";
        ord.forEach(function (e, i) {
          var py = y.getPixelForValue(i), p = e.percentiles;
          [["p50", p.p50, 6], ["p90", p.p90, 6], ["p95", p.p95, 8], ["p99", p.p99, 6]].forEach(function (m) {
            var px = x.getPixelForValue(m[1]);
            ctx.beginPath(); ctx.arc(px, py, m[2], 0, 6.2832); ctx.fillStyle = TB.color(e.id); ctx.fill();
            ctx.lineWidth = 2.5; ctx.strokeStyle = m[0] === "p95" ? ink : surf; ctx.stroke();
          });
          ctx.fillStyle = ink;
          ctx.textAlign = "right"; ctx.fillText(ms(p.p50), x.getPixelForValue(p.p50) - 12, py - 15);
          ctx.textAlign = "left"; ctx.fillText(ms(p.p99), x.getPixelForValue(p.p99) + 12, py);
        });
        ctx.restore();
      }
    };
    TB.grafica("d-esc", {
      type: "bar",
      data: { labels: ord.map(TB.nombreCorto), datasets: [{ label: "p50 a p99", data: ord.map(function (e) { return [e.percentiles.p50, e.percentiles.p99]; }), backgroundColor: ord.map(function (e) { return TB.alfa(TB.color(e.id), 0.45); }), borderRadius: 4, borderSkipped: false, barThickness: 12 }] },
      options: opc({
        indexAxis: "y", interaction: { mode: "index", axis: "y", intersect: false }, layout: { padding: { right: 62 } },
        scales: { x: logX(xe, { title: titulo("Latencia (ms, escala logarítmica)") }), y: { grid: { display: false }, ticks: { font: { size: 14 } } } },
        plugins: { tooltip: { callbacks: { title: function (it) { return it[0].label; }, label: function (it) { var p = ord[it.dataIndex].percentiles; return ["p50: " + ms(p.p50), "p90: " + ms(p.p90), "p95: " + ms(p.p95), "p99: " + ms(p.p99)]; } } } }
      }),
      plugins: [marcas, vertical(slo, "SLO " + slo + " ms", crit)]
    });

    /* pendiente */
    var fin = {
      id: "fin",
      afterDatasetsDraw: function (c) {
        var ctx = c.ctx, L = [];
        c.data.datasets.forEach(function (d, i) {
          var k = -1; d.data.forEach(function (v, j) { if (v != null) k = j; });
          if (k < 0) return;
          var pt = c.getDatasetMeta(i).data[k]; L.push({ y: pt.y, x: pt.x, d: d, v: d.data[k] });
        });
        L.sort(function (a, b) { return a.y - b.y; });
        for (var i = 1; i < L.length; i++) if (L[i].y - L[i - 1].y < 20) L[i].y = L[i - 1].y + 20;
        ctx.save(); ctx.font = "600 14px " + FUENTE; ctx.textBaseline = "middle"; ctx.textAlign = "left";
        L.forEach(function (l) {
          ctx.fillStyle = l.d.borderColor; ctx.fillRect(l.x + 14, l.y - 5, 10, 10);
          ctx.fillStyle = ink; ctx.fillText(estrecho ? TB.nf(l.v, 0) : l.d.label + " · " + TB.nf(l.v, 0), l.x + 30, l.y);
        });
        ctx.restore();
      }
    };
    var labs = []; for (var r = 1; r <= Math.max(maxRep, 2); r++) labs.push("Rep " + r);
    TB.grafica("d-rep", {
      type: "line",
      data: {
        labels: labs,
        datasets: E.map(function (e) {
          var s = e.repeticiones_serie || [];
          return { label: TB.nombreCorto(e), borderColor: TB.color(e.id), backgroundColor: TB.color(e.id), borderWidth: 2, tension: 0, pointRadius: 8, pointHoverRadius: 10, pointBorderColor: surf, pointBorderWidth: 3,
            data: labs.map(function (_, i) { return s[i] ? s[i].rps : null; }) };
        })
      },
      options: opc({
        layout: { padding: { right: estrecho ? 62 : 190, top: 10 } },
        scales: { x: { offset: true, grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, minRotation: 0, font: { size: 14 } } }, y: { title: titulo("Peticiones por segundo (req/s)"), ticks: { callback: function (v) { return TB.nf(v); } } } },
        plugins: { tooltip: { callbacks: { label: function (it) { return it.dataset.label + ": " + TB.nf(it.parsed.y, 0) + " req/s"; } } } }
      }),
      plugins: [fin]
    });
  }

  var estaEstrecho = null, tR = null;
  window.addEventListener("resize", function () {
    clearTimeout(tR);
    tR = setTimeout(function () { if (estaEstrecho !== null && (window.innerWidth < 760) !== estaEstrecho) { try { pintar(); } catch (e) { console.error(e); } } }, 150);
  });
  TB.seccion("latencia", pintar);
})();
