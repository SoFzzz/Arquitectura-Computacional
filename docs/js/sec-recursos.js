/* #recursos: CPU del host apilada, núcleos usados, memoria, mapas de calor por núcleo, disco y red */
(function () {
  "use strict";
  var TB = window.TB;
  var RAMPA = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
  var yaEscucha = false, tReajuste = null;

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
  function rgb(hex) { var h = hex.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mezcla(a, b, t) { var A = rgb(a), B = rgb(b); return "rgb(" + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(",") + ")"; }
  function hex(a, b, t) { var A = rgb(a), B = rgb(b); return "#" + A.map(function (v, i) { var x = Math.round(v + (B[i] - v) * t); return (x < 16 ? "0" : "") + x.toString(16); }).join(""); }
  function lumHex(h) { var c = rgb(h); return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }
  function oscuro() { return lumHex(TB.css("--bg")) < 90; }
  function rampaTema() {
    var base = TB.css("--surface-2");
    var pasos = oscuro() ? RAMPA.slice().reverse() : RAMPA;
    return [base].concat(pasos);
  }
  function colorCalor(pct, pasos) {
    var t = Math.max(0, Math.min(1, pct / 100)) * (pasos.length - 1), i = Math.min(pasos.length - 2, Math.floor(t));
    return hex(pasos[i], pasos[i + 1], t - i);
  }

  function dibujarCalor(cv) {
    var e = TB.E.filter(function (x) { return x.id === cv.getAttribute("data-id"); })[0];
    if (!e || !e.calor_cpu) return;
    var filas = e.calor_cpu.filas, paso = e.calor_cpu.paso_s || 5, nB = filas.length, nC = filas[0].length;
    var dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var L = 34, B = 24, T = 2, R = 2, cw = (W - L - R) / nB, ch = (H - T - B) / nC, pasos = rampaTema();
    ctx.font = "500 14px " + FUENTE; ctx.fillStyle = TB.css("--ink-2");
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (var c = 0; c < nC; c++) ctx.fillText("N" + c, L - 6, T + c * ch + ch / 2);
    for (var b = 0; b < nB; b++) for (c = 0; c < nC; c++) {
      ctx.fillStyle = colorCalor(filas[b][c], pasos);
      ctx.fillRect(L + b * cw, T + c * ch, Math.max(1, cw - 0.8), Math.max(1, ch - 1));
    }
    ctx.fillStyle = TB.css("--ink-2"); ctx.textBaseline = "top";
    var cada = Math.max(1, Math.round(60 / paso)), ancho = ctx.measureText("000").width;
    var saltar = (cw * cada) < ancho + 16 ? 2 : 1;
    for (b = 0; b < nB; b += cada * saltar) {
      ctx.textAlign = b === 0 ? "left" : "center";
      ctx.fillText(String(b * paso), L + b * cw, H - B + 5);
    }
    ctx.textAlign = "right"; ctx.fillText(nB * paso + " s", W - R, H - B + 5);
  }
  function redibujar() { [].forEach.call(document.querySelectorAll("canvas[data-calor]"), dibujarCalor); }

  function pintar() {
    var cuerpo = TB.cuerpo("recursos"); if (!cuerpo) return;
    var E = TB.E.filter(function (e) { return e.mediana; });
    var lead = document.querySelector("#recursos .cab .lead");
    if (!E.length) { cuerpo.innerHTML = '<p class="aviso-datos">Sin datos de recursos.</p>'; return; }
    var surf = TB.css("--surface"), ink = TB.css("--ink"), ink2 = TB.css("--ink-2"), crit = TB.css("--crit"), s2 = TB.css("--surface-2");
    if (lead) lead.textContent = "Tres preguntas: ¿cuántos núcleos usa la aplicación frente a su límite?, ¿cuánta memoria real necesita? y ¿dónde queda el disco y la red? Cada gráfica compara los entornos con la misma escala.";

    /* ---- 10 CPU del host apilada ---- */
    var filasCpu = E.map(function (e) {
      var m = e.mediana, u = m.cpu_user_prom, k = m.cpu_sys_prom;
      return { e: e, u: u, k: k, i: Math.max(0, 100 - u - k), kshare: k / Math.max(0.1, u + k) };
    }).sort(function (a, b) { return b.k - a.k; });
    var fis = filasCpu.filter(function (r) { return r.e.id === "fisica-local"; })[0];
    var conts = filasCpu.filter(function (r) { return r.e.tipo === "contenedor" || r.e.tipo === "control"; });
    var nubeK = filasCpu.filter(function (r) { return r.e.tipo === "nube"; })[0];
    var contK = conts.filter(function (r) { return r.k > r.u; });
    var t10;
    if (fis && conts.length) {
      var kmin = Math.min.apply(null, conts.map(function (r) { return r.k; })), kmax = Math.max.apply(null, conts.map(function (r) { return r.k; }));
      t10 = "En Docker Desktop, Windows ve la app como tiempo de kernel (" + TB.nf(kmin, 0) + " a " + TB.nf(kmax, 0) + " %, contra " + TB.nf(fis.k, 0) + " % en la física" + (nubeK ? " y " + TB.nf(nubeK.k, 0) + " % en AWS" : "") + "): corre dentro de la VM de WSL2";
    } else t10 = "Reparto del CPU del anfitrión entre usuario, kernel y ocioso";
    var ctl = TB.E.filter(function (e) { return e.id === "contenedor-sin-limite"; })[0];
    var fe = TB.E.filter(function (e) { return e.id === "fisica-local"; })[0];
    function p5(e) { var q = (e.escalado || []).filter(function (x) { return x.vus === 5; })[0]; return q ? q.p95_ms : null; }
    var c10 = "";
    if (ctl && fe) {
      c10 = "El costo medido de la capa Docker Desktop no es este reparto: con el mismo hardware, el contenedor sin límites rinde " + TB.nf(ctl.mediana.rps, 0) + " frente a " + TB.nf(fe.mediana.rps, 0) + " req/s (" + TB.nf((ctl.mediana.rps / fe.mediana.rps - 1) * 100, 0) + " %) y su p95 es " + TB.nf(ctl.mediana.p95_ms, 0) + " ms frente a " + TB.nf(fe.mediana.p95_ms, 0) + " ms";
      var pf = p5(fe), pc = conts.map(function (r) { return p5(r.e); }).filter(function (v) { return v != null; });
      if (pf != null && pc.length) c10 += "; con 5 usuarios el p95 ya es de " + (TB.nf(Math.min.apply(null, pc), 0) === TB.nf(Math.max.apply(null, pc), 0) ? "~" + TB.nf(Math.min.apply(null, pc), 0) : TB.nf(Math.min.apply(null, pc), 0) + " a " + TB.nf(Math.max.apply(null, pc), 0)) + " ms en los contenedores y de " + TB.nf(pf, 0) + " ms en la física";
      c10 += ".";
    }
    var cUser = hex(ink2, surf, 0.35), cKer = crit, cIdle = s2;
    var ley10 = '<div class="leyenda"><span><i class="llave" style="background:' + cUser + '"></i>Usuario (procesos de Windows)</span><span><i class="llave" style="background:' + cKer + '"></i>Kernel (tiempo de sistema que ve Windows)</span><span><i class="llave" style="background:' + cIdle + ';box-shadow:inset 0 0 0 1px ' + TB.css("--grid") + '"></i>Ocioso</span></div>';
    var h10 = panelI("cpu", true, t10, "CPU de toda la máquina anfitriona durante la carga sostenida · % del tiempo, promedio de la repetición mediana · ordenado por tiempo de kernel",
      ley10 + '<div class="lienzo protagonista"><canvas id="d-cpu" role="img" aria-label="CPU del anfitrión apilada al cien por ciento"></canvas></div>',
      "cada barra suma 100 % del procesador. En Docker Desktop la JVM corre dentro de una máquina virtual (WSL2 sobre Hyper-V) y Windows contabiliza todo el tiempo de CPU de esa VM como tiempo de sistema; por eso el rojo en los contenedores es en buena parte la propia aplicación, no un gasto aparte.",
      c10);

    /* ---- 11 núcleos usados ---- */
    var nuc = E.map(function (e) { return { e: e, app: e.mediana.app_cpu_prom, gen: e.mediana.gen_cpu_prom || 0, lim: TB.limCores(e) }; })
      .sort(function (a, b) { return b.app - a.app; });
    var sat = nuc.filter(function (r) { return r.app / r.lim >= 0.9; });
    var t11 = sat.length ? sat.map(function (r) { return TB.nombreCorto(r.e); }).join(" y ") + " usa" + (sat.length > 1 ? "n" : "") + " casi todo su límite de núcleos"
      : "Ningún entorno agota su límite de núcleos: el más exigido usa " + TB.nf(Math.max.apply(null, nuc.map(function (r) { return r.app / r.lim * 100; })), 0) + " % de lo que tiene";
    var ley11 = '<div class="leyenda"><span><i class="llave" style="background:' + ink2 + '"></i>Aplicación (color pleno)</span><span><i class="llave" style="background:' + TB.alfa(ink2, 0.35) + '"></i>Generador de carga (más claro)</span><span><i class="barra-lim"></i>Límite de núcleos</span></div>';
    var h11 = panelI("cpu", false, t11, "Núcleos de CPU usados en promedio · unidad: núcleos (1,0 = un núcleo completo) · mediana de las repeticiones",
      ley11 + '<div class="lienzo alto"><canvas id="d-nuc" role="img" aria-label="Núcleos usados frente al límite"></canvas></div>',
      "la barra es lo que usa la aplicación; la línea negra vertical es el límite que le dimos. Si la barra llega a la línea, el CPU es el cuello de botella.");

    /* ---- 12 memoria (bullet) ---- */
    var mem = E.map(function (e) {
      var lim = (e.config.ram_disponible_gb || 0) * 1024, m = e.mediana;
      return { e: e, lim: lim, repo: e.reposo && e.reposo.app_rss_prom, carga: m.app_rss_prom, max: m.app_rss_max, pct: lim ? m.app_rss_max / lim * 100 : null };
    }).sort(function (a, b) { return b.pct - a.pct; });
    var mx = mem[0];
    var t12 = "La memoria no es el cuello de botella: el máximo es " + TB.nf(mx.pct, 0) + " % del límite (" + TB.nombreCorto(mx.e) + ")";
    var bullets = mem.map(function (r) {
      var c = TB.color(r.e.id), w = function (v) { return Math.max(0, Math.min(100, v / r.lim * 100)).toFixed(2) + "%"; };
      var rp = Math.min(r.repo || 0, r.carga);
      return '<div class="medidor bala"><div class="fila"><span class="nom">' + TB.llave(r.e.id) + TB.esc(TB.nombreCorto(r.e)) + '</span><span>límite ' + TB.nf(r.lim) + ' MB</span></div>' +
        '<div class="pista bala-pista" title="Reposo ' + TB.nf(r.repo) + ' MB · bajo carga ' + TB.nf(r.carga) + ' MB · máximo ' + TB.nf(r.max) + ' MB"><i class="repo" style="left:0;width:' + w(rp) + ';background:' + TB.alfa(c, 0.4) + '"></i><i class="carga" style="left:' + w(rp) + ';width:' + w(r.carga - rp) + ';background:' + c + '"></i><b class="lim"></b></div>' +
        '<div class="bala-val">reposo ' + TB.nf(r.repo) + ' → carga ' + TB.nf(r.carga) + ' MB · ' + TB.nf(r.carga / r.lim * 100, 0) + ' % del límite</div></div>';
    }).join("");
    var h12 = panelI("memoria", false, t12, "Memoria residente de la aplicación (RSS) · MB · cada fila a su propia escala: el final de la pista es el límite del entorno",
      '<div class="leyenda"><span><i class="llave" style="background:' + TB.alfa(ink2, 0.35) + '"></i>En reposo</span><span><i class="llave" style="background:' + ink2 + '"></i>Añadido bajo carga</span><span><i class="barra-lim"></i>Límite de memoria</span></div><div class="balas">' + bullets + '</div>',
      "la parte clara es la memoria en reposo; la sólida es lo que se suma bajo carga; el borde derecho es el máximo disponible. La JVM calcula su heap como 25 % de lo que ve, por eso un contenedor de 1 GB usa menos que la física.");

    /* ---- 13 mapas de calor por núcleo ---- */
    var conCalor = E.filter(function (e) { return e.calor_cpu && e.calor_cpu.filas && e.calor_cpu.filas.length; });
    var medios = conCalor.map(function (e) { return { e: e, m: e.mediana.cpu_total_prom }; });
    var ult = medios.slice().sort(function (a, b) { return b.m - a.m; })[0];
    var t13 = ult ? "Ningún núcleo se satura solo, la carga se reparte pareja. " + TB.nombreCorto(ult.e) + " tiene sus " + ult.e.calor_cpu.filas[0].length + " núcleos lógicos al " + TB.nf(ult.m, 0) + " % en toda la prueba" : "CPU por núcleo en el tiempo";
    var pasosLeg = rampaTema(), grad = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(function (p) { return colorCalor(p, pasosLeg) + " " + p + "%"; }).join(",");
    var celdas = conCalor.map(function (e) {
      return '<div class="calor-celda"><div class="calor-nom"><span class="nom">' + TB.llave(e.id) + TB.esc(TB.nombreCorto(e)) + '</span><span class="mut">media ' + TB.nf(e.mediana.cpu_total_prom, 0) + ' %</span></div><canvas class="calor" data-calor="1" data-id="' + e.id + '" role="img" aria-label="CPU por núcleo en el tiempo, ' + TB.esc(TB.nombreCorto(e)) + '"></canvas></div>';
    }).join("");
    var h13 = panelI("capas", false, t13, "Uso de cada núcleo lógico (N0, N1…) en bloques de 5 s · eje horizontal: segundos de la repetición mediana · % de CPU",
      '<div class="calor-ley"><span>0 %</span><i style="background:linear-gradient(90deg,' + grad + ')"></i><span>100 %</span><em>Mismo color en todos los recuadros</em></div><div class="calor-rejilla">' + celdas + '</div>',
      "cada fila es un núcleo y cada columna 5 segundos; cuanto más intenso el azul, más ocupado estuvo. Una banda uniforme significa que la carga se reparte por igual y no hay un núcleo saturado.");

    /* ---- 14 disco y red ---- */
    var maxIops = Math.max.apply(null, E.map(function (e) { return e.mediana.disco_iops_pico || 0; }));
    var fm = function (v, d) { return TB.nf(v, d); };
    var filasT = E.map(function (e) {
      var m = e.mediana, cap = e.config.disco_capacidad_iops;
      return '<tr><td><span class="nom">' + TB.llave(e.id) + TB.esc(TB.nombreCorto(e)) + '</span></td><td class="n">' + fm(m.disco_r_iops, 1) + '</td><td class="n">' + fm(m.disco_w_iops, 1) + '</td><td class="n">' + fm((m.disco_r_mbs || 0) + (m.disco_w_mbs || 0), 2) + '</td><td class="n">' + fm(m.disco_iops_pico, 0) + (cap ? ' <span class="muted">de ' + fm(cap) + '</span>' : '') + '</td><td class="n">' + fm(m.red_entrada_kbs, 0) + '</td><td class="n">' + fm(m.red_salida_kbs, 0) + '</td></tr>';
    }).join("");
    var h14 = panelI("disco", false, "Disco y red están casi en cero: el cuello de botella no está ahí",
      "Promedio durante la carga sostenida · IOPS = operaciones de disco por segundo · MB/s · kB/s",
      '<div class="tabla"><table style="min-width:0"><thead><tr><th>Entorno</th><th class="n">Lecturas (IOPS)</th><th class="n">Escrituras (IOPS)</th><th class="n">Disco (MB/s)</th><th class="n">Pico (IOPS)</th><th class="n">Red entra (kB/s)</th><th class="n">Red sale (kB/s)</th></tr></thead><tbody>' + filasT + '</tbody></table></div>',
      "las lecturas y escrituras de disco son decenas de operaciones por segundo y la red mueve unos pocos MB/s. La base de datos H2 vive en memoria, por eso casi no toca el disco.",
      "El disco y la red no limitan a ninguno de los entornos.");

    cuerpo.innerHTML = '<div class="rejilla-2">' + h11 + h12 + '</div>' + h13 + h14;

    /* gráfica 10 */
    var lbls10 = filasCpu.map(function (r) { return TB.nombreCorto(r.e); });
    var colores = [cUser, cKer, cIdle], nombres = ["Usuario", "Kernel", "Ocioso"];
    var etiquetas = {
      id: "etq",
      afterDatasetsDraw: function (c) {
        var ctx = c.ctx; ctx.save(); ctx.font = "600 14px " + FUENTE; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        c.data.datasets.forEach(function (d, i) {
          c.getDatasetMeta(i).data.forEach(function (el, j) {
            var w = Math.abs(el.x - el.base);
            if (w < 46) return;
            ctx.fillStyle = lumHex(colores[i].charAt(0) === "#" ? colores[i] : "#ffffff") > 140 ? "#12161d" : "#ffffff";
            ctx.fillText(TB.nf(d.data[j], 0) + " %", (el.x + el.base) / 2, el.y);
          });
        });
        ctx.restore();
      }
    };
    TB.grafica("d-cpu", {
      type: "bar",
      data: { labels: lbls10, datasets: [
        { label: "Usuario", data: filasCpu.map(function (r) { return r.u; }), backgroundColor: cUser },
        { label: "Kernel", data: filasCpu.map(function (r) { return r.k; }), backgroundColor: cKer },
        { label: "Ocioso", data: filasCpu.map(function (r) { return r.i; }), backgroundColor: cIdle }
      ].map(function (d) { return Object.assign(d, { borderWidth: 0, maxBarThickness: 28, categoryPercentage: 0.72, barPercentage: 0.9 }); }) },
      options: opc({
        indexAxis: "y", interaction: { mode: "index", axis: "y", intersect: false },
        scales: { x: { stacked: true, min: 0, max: 100, beginAtZero: true, title: titulo("% del tiempo de CPU de la máquina anfitriona"), ticks: { callback: function (v) { return v + " %"; } } }, y: { stacked: true, grid: { display: false } } },
        plugins: { tooltip: { callbacks: { label: function (it) { return it.dataset.label + ": " + TB.nf(it.parsed.x, 1) + " %"; } } } }
      }),
      plugins: [etiquetas]
    });

    /* gráfica 11 */
    var limites = {
      id: "limites",
      afterDatasetsDraw: function (c) {
        var x = c.scales.x, y = c.scales.y, ctx = c.ctx;
        var mitad = Math.abs(y.getPixelForValue(1) - y.getPixelForValue(0)) * 0.42;
        ctx.save(); ctx.font = "600 14px " + FUENTE; ctx.textBaseline = "middle";
        nuc.forEach(function (r, i) {
          var yc = y.getPixelForValue(i), px = x.getPixelForValue(r.lim);
          ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, yc - mitad); ctx.lineTo(px, yc + mitad); ctx.stroke();
          caja(ctx, "límite " + TB.nf(r.lim), px + 8, yc - mitad + 10, "left");
          var fis4 = r.e.ficha && r.e.ficha.nucleos_fisicos;
          if (r.e.id === "fisica-local" && fis4 && fis4 < r.lim) {
            var p4 = x.getPixelForValue(fis4);
            ctx.setLineDash([5, 4]); ctx.strokeStyle = TB.css("--muted"); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p4, yc - mitad); ctx.lineTo(p4, yc + mitad); ctx.stroke(); ctx.setLineDash([]);
            caja(ctx, fis4 + " físicos", p4 + 8, yc + mitad - 10, "left");
          }
        });
        ctx.restore();
      }
    };
    var xmax11 = Math.ceil(Math.max.apply(null, nuc.map(function (r) { return r.lim; })) * 1.25 / 2) * 2;
    TB.grafica("d-nuc", {
      type: "bar",
      data: { labels: nuc.map(function (r) { return TB.nombreCorto(r.e); }), datasets: [
        { label: "Aplicación", data: nuc.map(function (r) { return r.app; }), backgroundColor: nuc.map(function (r) { return TB.color(r.e.id); }) },
        { label: "Generador de carga", data: nuc.map(function (r) { return r.gen; }), backgroundColor: nuc.map(function (r) { return TB.alfa(TB.color(r.e.id), 0.35); }) }
      ].map(function (d) { return Object.assign(d, { borderRadius: 4, borderSkipped: "start", maxBarThickness: 18, categoryPercentage: 0.8, barPercentage: 0.9 }); }) },
      options: opc({
        indexAxis: "y", interaction: { mode: "index", axis: "y", intersect: false },
        scales: { x: { min: 0, max: xmax11, beginAtZero: true, title: titulo("Núcleos de CPU usados (promedio)"), ticks: { stepSize: 2, callback: function (v) { return TB.nf(v, v % 1 ? 1 : 0); } } }, y: { grid: { display: false } } },
        plugins: { tooltip: { callbacks: { label: function (it) { return it.dataset.label + ": " + TB.nf(it.parsed.x, 2) + " núcleos"; }, afterBody: function (it) { var r = nuc[it[0].dataIndex]; return "Límite: " + TB.nf(r.lim) + " núcleos (" + TB.nf(r.app / r.lim * 100, 0) + " % usado por la aplicación)"; } } } }
      }),
      plugins: [limites]
    });

    redibujar();
    if (!yaEscucha) {
      yaEscucha = true;
      window.addEventListener("resize", function () { clearTimeout(tReajuste); tReajuste = setTimeout(redibujar, 120); });
      TB.alCambiarTema(function () { setTimeout(redibujar, 0); });
    }
  }

  TB.seccion("recursos", pintar);
})();
