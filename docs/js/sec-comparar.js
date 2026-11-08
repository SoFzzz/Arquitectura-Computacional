/* #comparar: gráficas comparativas entre entornos */
(function () {
  "use strict";
  var FUENTE = "Fuente: medicion/resultados, mediana de 3 repeticiones de 5 min con 30 usuarios.";

  function etiquetas(fmt, dx, soloMax) {
    /* plugin: valor directo al final de cada barra horizontal */
    return {
      id: "etiquetasBarras",
      afterDatasetsDraw: function (ch) {
        var ctx = ch.ctx;
        ctx.save();
        ctx.font = "600 14px " + TB.css("--font-ui");
        ctx.fillStyle = TB.css("--ink");
        ctx.textBaseline = "middle"; ctx.textAlign = "left";
        ch.data.datasets.forEach(function (ds, di) {
          ch.getDatasetMeta(di).data.forEach(function (bar, i) {
            var v = ds.data[i];
            if (v == null) return;
            if (soloMax) { var mx = Math.max.apply(null, ch.data.datasets.map(function (d) { return d.data[i] == null ? -1 : d.data[i]; })); if (v !== mx) return; }
            ctx.fillText(fmt(v, i, ds), bar.x + (dx || 8), bar.y);
          });
        });
        ctx.restore();
      }
    };
  }

  function panel(cab) {
    return '<div class="panel' + (cab.clase ? " " + cab.clase : "") + '"><h3><span class="icono-chip">' + TB.icono(cab.icono || "grafica", 20) + "</span><span>" + cab.titulo + '</span></h3><p class="sub">' + cab.sub + "</p>" +
      (cab.leyenda ? '<div class="leyenda" id="' + cab.leyenda + '"></div>' : "") +
      '<div class="lienzo' + (cab.prot ? " protagonista" : "") + '"><canvas id="' + cab.canvas + '"></canvas></div>' +
      (cab.nota ? '<p class="nota-excl">' + cab.nota + "</p>" : "") +
      '<p class="lectura">Cómo leerla: ' + cab.lectura + '</p><p class="conclusion">' + cab.conclusion + "</p></div>";
  }
  function caja(c, x, y, txt) {
    /* anotación: caja redondeada radio 8, fondo --surface, borde --border, texto 12/600 */
    c.font = "600 12px " + TB.css("--font-ui");
    var w = c.measureText(txt).width + 16, h = 24;
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, 8); else c.rect(x, y, w, h);
    c.fillStyle = TB.css("--surface"); c.fill();
    c.lineWidth = 1; c.strokeStyle = TB.css("--border"); c.setLineDash([]); c.stroke();
    c.fillStyle = TB.css("--ink"); c.textAlign = "left"; c.textBaseline = "middle";
    c.fillText(txt, x + 8, y + h / 2 + 0.5);
  }
  function veces(n, d) { return TB.nf(n, d == null ? 1 : d) + "×"; }

  var mq = window.matchMedia("(max-width: 759px)"), pintar = null;
  var cambio = function () { if (pintar) { try { pintar(); } catch (e) { console.error(e); } } };
  if (mq.addEventListener) mq.addEventListener("change", cambio); else if (mq.addListener) mq.addListener(cambio);

  TB.seccion("comparar", pintar = function () {
    var cuerpo = TB.cuerpo("comparar");
    if (!cuerpo) return;
    var nf = TB.nf, E = TB.E, P = TB.P, slo = TB.D.slo;
    var movil = window.matchMedia("(max-width: 759px)").matches;
    var fis = E.filter(function (e) { return e.tipo === "fisica"; })[0];
    var otros = E.filter(function (e) { return e !== fis; });
    if (!fis || !otros.length) { cuerpo.innerHTML = '<p class="aviso-datos">Faltan datos de la máquina física para comparar.</p>'; return; }
    var ink = TB.css("--ink"), surface = TB.css("--surface"), muted = TB.css("--muted"), ink2 = TB.css("--ink-2");
    var nombre = TB.nombreCorto;
    var rpsF = fis.mediana.rps, p95F = fis.mediana.p95_ms, effF = fis.eficiencia.rps_por_nucleo, milF = fis.costo_por_millon_usd;
    var html = "";

    /* ---------- 2. protagonista: frente a la física ---------- */
    var con = otros.filter(function (e) { return e.tipo !== "fisica"; });
    var mejorCont = con.filter(function (e) { return e.costo_mes_usd != null; }).sort(function (a, b) { return b.mediana.rps - a.mediana.rps; })[0];
    var cats = movil ? [["Throughput"], ["Latencia p95", "(invertida)"], ["Costo por millón", "(invertido)"]] : ["Throughput", "Latencia p95 (invertida)", "Costo por millón (invertido)"];
    function pcts(e) {
      return [e.mediana.rps / rpsF * 100, p95F / e.mediana.p95_ms * 100,
        e.costo_por_millon_usd ? milF / e.costo_por_millon_usd * 100 : null];
    }
    function crudos(e) {
      return [[nf(e.mediana.rps) + " req/s", nf(rpsF) + " req/s"], [nf(e.mediana.p95_ms, 1) + " ms", nf(p95F, 1) + " ms"],
        [e.costo_por_millon_usd ? "US$ " + nf(e.costo_por_millon_usd, 3) : "n/d", "US$ " + nf(milF, 3)]];
    }
    var cMej = mejorCont && mejorCont.costo_por_millon_usd && milF ? mejorCont.costo_por_millon_usd / milF : null;
    var t2 = mejorCont ? "La física atiende " + veces(rpsF / mejorCont.mediana.rps) + " más peticiones que " + nombre(mejorCont) + (cMej == null ? "" : cMej >= 1 ? " y cada millón le cuesta " + veces(cMej) + " menos" : ", pero cada millón le sale " + veces(1 / cMej) + " más caro") : "Cada entorno frente a la física";
    var METR = ["throughput", "latencia", "costo por millón"];
    var ganan = con.filter(function (e) { return pcts(e).some(function (v) { return v != null && v > 100; }); });
    var contGanan = ganan.filter(function (e) { return e.tipo === "contenedor" || e.tipo === "control"; });
    var concl2 = (contGanan.length ? "" : "Ningún contenedor alcanza a la física en ninguna de las tres métricas. ") +
      ganan.map(function (e) {
        var p = pcts(e), si = [], no = [];
        p.forEach(function (v, i) { if (v != null) (v > 100 ? si : no).push(METR[i]); });
        return nombre(e) + " la supera en " + si.join(" y ") + (no.length ? ", y queda por debajo en " + no.join(" y ") : "") + ".";
      }).join(" ");
    html += panel({
      clase: "protagonista protagonista-panel alto-movil", icono: "balanza", prot: true, nota: "La máquina física es la línea de 100 %: no aparece en la leyenda porque es la referencia.", canvas: "c-frente-fisica", leyenda: "ley-frente",
      titulo: t2, sub: "Cada entorno como porcentaje de la máquina física (= 100). Más largo es mejor en las tres métricas. " + FUENTE,
      lectura: "la línea vertical es la física. Una barra que no llega a la línea rinde menos que la física en esa métrica; latencia y costo están invertidos para que “más largo” siempre signifique “mejor”.",
      conclusion: concl2 || "Ningún entorno alcanza a la física en ninguna de las tres métricas."
    });


    /* ---------- 4. costo vs rendimiento ---------- */
    var conCosto = E.filter(function (e) { return e.costo_mes_usd != null; });
    var sinCosto = E.filter(function (e) { return e.costo_mes_usd == null; });
    var aws = P[0];
    var tBar = (function () {
      var f = conCosto.filter(function (e) { return e.aguanta; }).sort(function (a, b) { return b.mediana.rps / b.costo_mes_usd - a.mediana.rps / a.costo_mes_usd; })[0];
      return f ? nombre(f) + " da más peticiones por dólar al mes (" + nf(f.mediana.rps / f.costo_mes_usd, 1) + " req/s por US$) entre los que cumplen el SLO" : "Costo frente a rendimiento";
    })();
    html += panel({
      canvas: "c-costo-rend", icono: "dinero", leyenda: "ley-costo-rend", prot: true,
      titulo: tBar, sub: "US$ al mes (eje X) frente a req/s sostenidos (eje Y). Punto lleno: cumple el SLO de " + nf(slo.p95_ms) + " ms de p95; anillo: no lo cumple. Costo de la física estimado. " + FUENTE,
      nota: sinCosto.length ? "Excluido por no tener un precio real: " + sinCosto.map(nombre).join(", ") + "." : "",
      lectura: "arriba a la izquierda es lo ideal (más peticiones, menos dinero)." + (aws ? " La línea punteada marca el costo de la opción en la nube que aún no se mide: no sabemos a qué altura caerá." : ""),
      conclusion: aws ? "A igual dinero, la física rinde más que el contenedor; el de 1 CPU es barato pero queda fuera del SLO, así que su ahorro no sirve." : "AWS t3.small da más peticiones por dólar de tarifa base, y la física da más peticiones en total. El contenedor de 1 CPU es barato pero queda fuera del SLO, así que su ahorro no sirve."
    });

    /* ---------- 5. costo por millón y mensual ---------- */
    /* t3 en modo Unlimited: sobre el 20 % de línea base por vCPU se cobran 0,05 US$ por vCPU-hora */
    var nube = E.filter(function (e) { return e.tipo === "nube" && e.costo_mes_usd != null; })[0], extraMil = null;
    if (nube) {
      var vcpu = (nube.ficha && nube.ficha.nucleos_logicos) || 2, uso = nube.mediana.cpu_total_prom / 100;
      var extraMes = Math.max(0, uso - 0.2) * vcpu * 0.05 * 730;
      extraMil = (nube.costo_mes_usd + extraMes) / (nube.mediana.rps * 730 * 3600 / 1e6);
    }
    var mil = E.filter(function (e) { return e.costo_por_millon_usd != null; }).sort(function (a, b) { return a.costo_por_millon_usd - b.costo_por_millon_usd; });
    var mes = conCosto.map(function (e) { return { id: e.id, nom: nombre(e), v: e.costo_mes_usd, pend: false }; });
    P.forEach(function (p) { if (p.config.costo_mes_usd != null) mes.push({ id: p.id, nom: movil ? ["AWS t3.small", "(sin medir)"] : "AWS t3.small (sin medir)", v: p.config.costo_mes_usd, pend: true }); });
    mes.sort(function (a, b) { return a.v - b.v; });
    var tMil = mil.length > 1 ? nombre(mil[0]) + " es la opción más barata por petición: " + veces(mil[mil.length - 1].costo_por_millon_usd / mil[0].costo_por_millon_usd, 0) + " menos que " + nombre(mil[mil.length - 1]) : "Costo por millón de peticiones";
    var medidos = mes.filter(function (m) { return !m.pend; });
    var tMes = "Pagar menos al mes no es pagar menos por petición: " + (medidos.length ? "el más barato cuesta US$ " + nf(medidos[0].v, 1) + " y el más caro US$ " + nf(medidos[medidos.length - 1].v, 1) : "costo mensual");
    html += '<div class="rejilla-2">' +
      panel({ canvas: "c-costo-millon", icono: "dinero", nota: "«Sin límites» no aparece porque no tiene precio.", titulo: tMil, sub: "US$ por millón de peticiones atendidas (costo mensual ÷ peticiones al mes a la tasa medida). El valor de la física es una estimación.",
        lectura: "la barra más corta es la más barata; se calcula con lo que el entorno realmente rindió.", conclusion: "Lo barato por petición es lo que escala bien." }) +
      panel({ canvas: "c-costo-mes", icono: "dinero", titulo: tMes, sub: "US$ al mes: precio on-demand de AWS us-east-1 (8 de noviembre de 2026) para la nube y estimación para la física.",
        lectura: "el costo mensual sin el rendimiento engaña: compáralo con la gráfica de al lado.", conclusion: "La opción de 1 CPU ahorra dinero a costa de incumplir el SLO." }) +
      "</div>";

    var okMil = milF != null && mejorCont && mejorCont.costo_por_millon_usd != null;
    if (aws) html += '<p class="conclusion">La física gana en las cuatro lecturas: ' + (mejorCont ? veces(rpsF / mejorCont.mediana.rps) + " más throughput que el mejor contenedor" : "") +
      (okMil ? ", " + veces(mejorCont.costo_por_millon_usd / milF) + " menos costo por millón de peticiones" : "") +
      ", y más trabajo por núcleo. La nube (AWS t3.small) queda por medir antes de cerrar el veredicto.</p>";
    else if (nube) html += '<p class="conclusion">La física gana en throughput (' + veces(rpsF / nube.mediana.rps) + " el de " + nombre(nube) + ") y en latencia (p95 de " + nf(p95F, 0) + " frente a " + nf(nube.mediana.p95_ms, 0) + " ms). " + nombre(nube) + " cumple el SLO y es la más barata por petición, pero con su CPU al " + nf(nube.mediana.cpu_total_prom, 0) + " %: no le queda margen para más usuarios.</p>";

    cuerpo.innerHTML = html;

    /* ---------- pintar gráficas ---------- */
    var dsF = con.length ? con : otros;
    TB.leyenda("#ley-frente", dsF);
    TB.leyenda("#ley-costo-rend", conCosto);
    var refCien = {
      id: "refCien",
      afterDatasetsDraw: function (ch) {
        var xs = ch.scales.x, ya = ch.chartArea, px = xs.getPixelForValue(100), c = ch.ctx;
        c.save(); c.strokeStyle = ink2; c.lineWidth = 2; c.setLineDash([6, 5]);
        c.beginPath(); c.moveTo(px, ya.top); c.lineTo(px, ya.bottom); c.stroke(); c.setLineDash([]);
        caja(c, px + 6, ya.top + 2, "Física = 100");
        c.restore();
      }
    };
    TB.grafica("c-frente-fisica", {
      type: "bar",
      data: { labels: cats, datasets: dsF.map(function (e) {
        return Object.assign({ label: nombre(e), data: pcts(e), backgroundColor: TB.color(e.id), _e: e }, TB.barra);
      }) },
      options: TB.opciones({
        indexAxis: "y", layout: { padding: { right: movil ? 40 : 56 } },
        scales: { x: { beginAtZero: true, suggestedMax: 120, title: { display: true, text: "% de la máquina física (física = 100)", color: ink2, font: { size: 14 } }, ticks: { callback: function (v) { return v + " %"; } } },
          y: { grid: { display: false }, ticks: { font: { size: 14 }, color: ink } } },
        plugins: { tooltip: { callbacks: {
          label: function (c) { var r = crudos(c.dataset._e)[c.dataIndex]; return nombre(c.dataset._e) + ": " + (c.raw == null ? "n/d" : nf(c.raw) + " %") + "  (" + r[0] + " vs física " + r[1] + ")"; } } } }
      }),
      plugins: [refCien, etiquetas(function (v) { return nf(v) + " %"; }, 8, movil)]
    });


    /* dispersión */
    var pts = conCosto.map(function (e) { return { x: e.costo_mes_usd, y: e.mediana.rps, e: e }; });
    var maxX0 = Math.max.apply(null, pts.map(function (p) { return p.x; }).concat(aws ? [aws.config.costo_mes_usd] : [])) * 1.3;
    var maxX = Math.ceil(maxX0 / 10) * 10;
    var maxY = Math.ceil(Math.max.apply(null, pts.map(function (p) { return p.y; })) * 1.15 / 100) * 100;
    var plugCosto = {
      id: "costoRend",
      afterDatasetsDraw: function (ch) {
        var c = ch.ctx, xs = ch.scales.x, a = ch.chartArea;
        c.save();
        if (aws && aws.config.costo_mes_usd != null) {
          var px = xs.getPixelForValue(aws.config.costo_mes_usd);
          c.strokeStyle = muted; c.lineWidth = 2; c.setLineDash([6, 5]);
          c.beginPath(); c.moveTo(px, a.top); c.lineTo(px, a.bottom); c.stroke(); c.setLineDash([]);
          caja(c, px + 6, a.top + 6, "AWS t3.small · sin medir");
        }
        c.font = "600 14px " + TB.css("--font-ui"); c.fillStyle = ink; c.textBaseline = "middle";
        ch.getDatasetMeta(0).data.forEach(function (el, i) {
          var izq = el.x > a.right - 150;
          c.textAlign = izq ? "right" : "left";
          c.fillText(nombre(pts[i].e), el.x + (izq ? -16 : 16), el.y);
        });
        c.restore();
      }
    };
    TB.grafica("c-costo-rend", {
      type: "scatter",
      data: { datasets: [{
        data: pts,
        pointRadius: 10, pointHoverRadius: 12, pointBorderWidth: 3,
        backgroundColor: pts.map(function (p) { return p.e.aguanta ? TB.color(p.e.id) : surface; }),
        borderColor: pts.map(function (p) { return p.e.aguanta ? surface : TB.color(p.e.id); })
      }] },
      options: TB.opciones({
        interaction: { mode: "nearest", intersect: true },
        scales: {
          x: { type: "linear", beginAtZero: true, min: 0, max: maxX, title: { display: true, text: "Costo mensual (US$ al mes)", color: ink2, font: { size: 14 } }, ticks: { callback: function (v) { return "$" + v; } } },
          y: { beginAtZero: true, min: 0, max: maxY, title: { display: true, text: "Throughput sostenido (req/s)", color: ink2, font: { size: 14 } } }
        },
        plugins: { tooltip: { callbacks: {
          title: function (it) { return nombre(it[0].raw.e); },
          label: function (c) { var e = c.raw.e; return [nf(e.mediana.rps) + " req/s · p95 " + nf(e.mediana.p95_ms, 0) + " ms", "US$ " + nf(e.costo_mes_usd, 1) + " al mes · " + (e.aguanta ? "✓ cumple el SLO" : "✕ no cumple el SLO")]; } } } }
      }),
      plugins: [plugCosto]
    });

    function barrasCosto(canvas, items, fmtEtq, tipTxt) {
      TB.grafica(canvas, {
        type: "bar",
        data: { labels: items.map(function (m) { return m.nom; }), datasets: [Object.assign({
          data: items.map(function (m) { return m.v; }),
          backgroundColor: items.map(function (m) { return m.pend ? TB.alfa(TB.color(m.id), 0.35) : TB.color(m.id); })
        }, TB.barra)] },
        options: TB.opciones({
          indexAxis: "y", layout: { padding: { right: 84 } },
          scales: { x: { beginAtZero: true, title: { display: true, text: tipTxt, color: ink2, font: { size: 14 } } }, y: { grid: { display: false }, ticks: { color: ink, font: { size: 14 } } } },
          plugins: { tooltip: { callbacks: { label: function (c) { return fmtEtq(c.raw); } } } }
        }),
        plugins: [etiquetas(fmtEtq)]
      });
    }
    barrasCosto("c-costo-millon", mil.map(function (e) { return { id: e.id, nom: nombre(e), v: e.costo_por_millon_usd, pend: false }; }),
      function (v) { return "US$ " + nf(v, 3); }, "US$ por millón de peticiones");
    barrasCosto("c-costo-mes", mes, function (v) { return "US$ " + nf(v, 1); }, "US$ al mes");
  });
})();
