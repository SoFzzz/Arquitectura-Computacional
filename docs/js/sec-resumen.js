/* #resumen: recomendación, SLO y marcador comparativo */
(function () {
  "use strict";
  TB.seccion("resumen", function () {
    var cuerpo = TB.cuerpo("resumen");
    if (!cuerpo) return;
    var nf = TB.nf, esc = TB.esc, E = TB.E, P = TB.P, slo = TB.D.slo;
    var R = TB.N.recomendacion || {};

    /* ---- recomendación + SLO ---- */
    var cumplen = E.filter(function (e) { return e.aguanta; });
    var puntos = (R.puntos || []).map(function (p) { return "<li>" + p + "</li>"; }).join("");
    var recom = '<article class="recom"><div class="recom-cab"><span class="icono-chip">' + TB.icono("objetivo", 20) + '</span><span class="pastilla ok">' + TB.icono("check", 14) + " Recomendación</span></div>" +
      "<h3>" + (R.titulo ? R.titulo : "Elegir el entorno que cumple el acuerdo de servicio al menor costo por petición") + "</h3>" +
      (R.texto ? '<p class="texto">' + R.texto + "</p>" : "") +
      (puntos ? '<ul class="puntos">' + puntos + "</ul>" : "") + "</article>";

    var lista = E.map(function (e) {
      var ok = e.aguanta;
      return '<div><span class="nom">' + TB.llave(e.id) + esc(TB.nombreCorto(e)) + "</span>" +
        '<span class="v">p95 ' + nf(e.mediana.p95_ms) + " ms</span>" + TB.pill(e) + "</div>";
    }).join("");
    var sloCard = '<aside class="slo-card"><div><h3><span class="icono-chip">' + TB.icono("reloj", 20) + '</span>Acuerdo de servicio</h3><p class="sub">Lo que tiene que cumplir cada entorno (SLO)</p></div>' +
      '<div class="slo-pares"><div class="grande">≤ ' + nf(slo.p95_ms) + ' ms<small>latencia p95</small></div>' +
      '<div class="grande">≤ ' + nf(slo.error_pct, 0) + ' %<small>peticiones con error</small></div></div>' +
      '<p class="small">Cumplen ' + cumplen.length + " de " + E.length + " entornos medidos" + (P.length ? "; " + P.length + " sigue pendiente de medir" : "") + ".</p>" +
      '<div class="slo-lista">' + lista + "</div></aside>";

    /* ---- marcador ---- */
    var filas = E.slice().sort(function (a, b) { return b.mediana.rps - a.mediana.rps; }).map(function (e) {
      return { e: e, id: e.id, pend: false, rps: e.mediana.rps, p95: e.mediana.p95_ms, cpu: e.mediana.app_cpu_prom, lim: TB.limCores(e),
        cpuPct: e.mediana.app_cpu_uso_limite_pct, rss: e.mediana.app_rss_prom, mes: e.costo_mes_usd, mil: e.costo_por_millon_usd };
    });
    P.forEach(function (p) {
      filas.push({ e: { aguanta: null }, id: p.id, pend: true, nombre: p.nombre, tipo: p.tipo, lim: p.config.nucleos_disponibles, mes: p.config.costo_mes_usd });
    });
    function mejor(clave, menor) {
      var v = filas.filter(function (f) { return !f.pend; }).map(function (f) { return f[clave]; }).filter(function (x) { return x != null && x > 0; });
      return v.length ? (menor ? Math.min.apply(null, v) : Math.max.apply(null, v)) : null;
    }
    var best = { rps: mejor("rps", false), p95: mejor("p95", true), rss: mejor("rss", true), mes: mejor("mes", true), mil: mejor("mil", true) };
    function celda(f, valor, txt, unidad, ref, menor, extra) {
      if (valor == null) return '<td><div class="mb sin"><span class="v">' + (f.pend ? "sin medir" : "n/d") + "</span></div></td>";
      var frac = ref ? (menor ? ref / valor : valor / ref) : 0;
      frac = Math.max(0, Math.min(1, frac));
      var esMejor = !f.pend && ref && Math.abs(frac - 1) < 1e-9;
      return '<td><div class="mb' + (esMejor ? " mejor" : "") + '"><span class="v">' + txt + (unidad ? "<small>" + unidad + "</small>" : "") + "</span>" +
        '<span class="pista"><i style="width:' + (frac * 100).toFixed(1) + "%;background:" + TB.alfa(TB.color(f.id), esMejor ? 1 : 0.55) + '"></i></span></div></td>';
    }
    var cuerpoTabla = filas.map(function (f) {
      var nom = f.pend ? "AWS t3.small" : TB.nombreCorto(f.e);
      var tipo = f.pend ? "nube · sin medir" : (f.e.tipo || "");
      var cpu;
      if (f.pend || f.cpu == null) cpu = '<td><div class="mb sin"><span class="v">' + (f.pend ? "sin medir" : "n/d") + "</span>" + (f.lim ? '<span class="small">límite ' + nf(f.lim) + "</span>" : "") + "</div></td>";
      else {
        var pct = Math.min(100, f.cpuPct != null ? f.cpuPct : f.cpu / f.lim * 100);
        var calor = pct >= 90 ? "var(--crit)" : pct >= 70 ? "var(--warn)" : TB.color(f.id);
        cpu = '<td><div class="mb"><span class="v">' + nf(f.cpu, 1) + " / " + nf(f.lim) + "<small>núcleos</small></span>" +
          '<span class="pista"><i style="width:' + pct.toFixed(1) + "%;background:" + calor + '"></i></span><span class="small">' + nf(pct) + ' % del límite</span></div></td>';
      }
      return '<tr class="' + (f.pend ? "pendiente" : "") + '"><td class="ent"><span class="nom">' + TB.llave(f.id) + esc(nom) + '</span><span class="tipo">' + esc(tipo) + "</span></td>" +
        celda(f, f.rps, nf(f.rps), "req/s", best.rps, false) +
        celda(f, f.p95, nf(f.p95, 0), "ms", best.p95, true) + cpu +
        celda(f, f.rss, nf(f.rss), "MB", best.rss, true) +
        celda(f, f.mes, "US$ " + nf(f.mes, 1), "", best.mes, true) +
        celda(f, f.mil, f.mil == null ? "" : "US$ " + nf(f.mil, 3), "", best.mil, true) +
        "<td>" + TB.pill(f.e) + "</td></tr>";
    }).join("");
    var tabla = '<div class="marcador"><h3><span class="icono-chip">' + TB.icono("balanza", 20) + '</span>Marcador: los entornos, lado a lado</h3>' +
      '<p class="sub">Cada barra es proporcional al mejor valor de su columna (★): más larga es mejor. En CPU la barra es el porcentaje del límite usado. Fuente: mediana de 3 repeticiones de 5 min, 30 usuarios.</p>' +
      '<table><thead><tr><th>Entorno</th><th>Throughput</th><th>Latencia p95</th><th>CPU usada / límite</th><th>RAM residente</th><th>Costo al mes</th><th>Costo por millón</th><th>Veredicto</th></tr></thead><tbody>' +
      cuerpoTabla + "</tbody></table>" +
      '<p class="nota">' + (P.length ? "Las filas rayadas aún no se miden. " : "") + 'El costo de la física es una estimación (equipo amortizado más energía); el del contenedor sin límites no se calcula porque no representa una máquina que se pueda contratar.</p></div>';

    cuerpo.innerHTML = '<div class="recom-fila">' + recom + sloCard + "</div>" + tabla;
  });
})();
