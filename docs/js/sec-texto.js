/* Secciones de texto y tablas: carga, entornos, espera, comparacion (tabla) */
(function () {
  "use strict";
  var nf = TB.nf, esc = TB.esc, llave = TB.llave, D = TB.D, E = TB.E;

  function nombre(e) { return '<span class="nom">' + llave(e.id) + esc(e.nombre) + "</span>"; }
  function dinero(v, d) { return v != null ? "US$ " + nf(v, d) : "—"; }

  /* ---------- carga ---------- */
  TB.seccion("texto-carga", function () {
    var c = TB.cuerpo("carga"); if (!c) return;
    var pasos = [
      ["GET", "/", "Inicio", "Plantilla Thymeleaf"],
      ["GET", "/owners?lastName=", "Listar dueños", "Consulta paginada"],
      ["GET", "/owners?lastName=Davis", "Buscar por apellido", "LIKE sobre la BD"],
      ["GET", "/owners/{id}", "Detalle del dueño", "JOIN dueño + mascotas + visitas"],
      ["GET", "/vets.html", "Veterinarios", "SELECT + especialidades"],
      ["POST", "/owners/{id}/edit", "Editar dueño", "UPDATE en la BD"]
    ];
    var pr = (E[0] && E[0].ficha && E[0].ficha.protocolo) || { vus: 30, reps: 3, duracion_s: 300, escalado: [5, 10, 20, 40, 80, 120], dur_escalado_s: 45, reposo_s: 30, calentamiento_s: 60, pausa_s: 0.05 };
    var tramos = [["Arranque", 20, ""], ["Reposo " + pr.reposo_s + " s", pr.reposo_s, ""], ["Calent. " + pr.calentamiento_s + " s", pr.calentamiento_s, ""]];
    for (var i = 1; i <= pr.reps; i++) tramos.push(["Repetición " + i + " · " + pr.duracion_s / 60 + " min", pr.duracion_s, "med"]);
    tramos.push(["Escalado " + pr.escalado[0] + "→" + pr.escalado[pr.escalado.length - 1] + " VUs", pr.escalado.length * pr.dur_escalado_s, ""]);
    c.innerHTML =
      '<div class="panel protagonista"><h3><span class="icono-chip primario">' + TB.icono("terminal", 20) + '</span>El flujo de cada usuario virtual</h3><p class="sub">Seis pasos que se repiten en bucle, con el mismo orden en todos los entornos.</p>' +
      '<div class="flujo">' + pasos.map(function (p, i) {
        return '<div class="paso"><div class="cab-paso"><span class="num-paso">PASO ' + (i + 1) + '</span><span class="verbo">' + p[0] + "</span></div><b>" + p[2] + '</b><span class="ruta">' + esc(p[1]) + '</span><span class="small">' + p[3] + "</span></div>";
      }).join("") + "</div></div>" +
      '<div class="panel"><h3><span class="icono-chip">' + TB.icono("reloj", 20) + '</span>Protocolo, idéntico en cada entorno</h3><p class="sub">Arranque medido hasta el primer HTTP 200; reposo como línea base; el calentamiento no se cuenta (la JVM compila con JIT en esos segundos); tres repeticiones de cinco minutos y nos quedamos con la mediana; al final, escalones de concurrencia.</p>' +
      '<div class="linea-tiempo" aria-label="Línea de tiempo del protocolo">' + tramos.map(function (t) {
        return '<div class="' + t[2] + '" style="flex:' + Math.max(t[1], 110) + ' 0 auto" title="' + esc(t[0]) + '">' + esc(t[0]) + "</div>";
      }).join("") + "</div>" +
      '<dl class="kv" style="margin-top:32px;max-width:640px"><dt>Usuarios virtuales (carga sostenida)</dt><dd>' + pr.vus + "</dd><dt>Duración por repetición</dt><dd>" + pr.duracion_s + " s</dd>" +
      "<dt>Repeticiones</dt><dd>" + pr.reps + " (se reporta la mediana)</dd><dt>Pausa entre peticiones</dt><dd>" + pr.pausa_s * 1000 + " ms</dd>" +
      "<dt>Escalones de concurrencia</dt><dd>" + pr.escalado.join(", ") + "</dd><dt>Monitor</dt><dd>1 muestra / s</dd></dl></div>" +
      '<div class="panel"><h3><span class="icono-chip">' + TB.icono("grafica", 20) + '</span>Qué medimos</h3><p class="sub">Las mismas métricas, con las mismas herramientas, en los cinco entornos.</p>' +
      '<div class="tabla"><table><thead><tr><th>Métrica</th><th>Qué responde</th><th>Cómo se mide</th></tr></thead><tbody>' +
      [
        ["Throughput (req/s)", "¿Cuántas peticiones atiende por segundo?", "<code>carga.py</code> cuenta las respuestas correctas de cada segundo"],
        ["Latencia p50, p95 y p99", "¿Cuánto tarda en responder, incluidas las peticiones más lentas?", "<code>carga.py</code> guarda el tiempo de cada petición, una fila por petición"],
        ["Errores", "¿Falla alguna petición?", "<code>carga.py</code> registra el código HTTP de cada respuesta"],
        ["CPU de la app", "¿Cuántos núcleos usa frente a su límite?", "<code>monitor.py</code>, 1 vez por segundo (psutil en local, cgroups en Docker)"],
        ["Memoria residente", "¿Cuánta RAM ocupa de verdad?", "<code>monitor.py</code>: RSS del proceso, o memoria anónima del cgroup en Docker"],
        ["Disco y red", "¿Lee, escribe o transmite mucho?", "<code>monitor.py</code> (IOPS y MB/s) y bytes de cada petición"],
        ["Tiempo de arranque", "¿Cuánto tarda en estar lista?", "<code>ejecutar.py</code>: segundos hasta el primer HTTP 200"]
      ].map(function (r) { return "<tr><td><b>" + r[0] + "</b></td><td>" + r[1] + '</td><td class="small">' + r[2] + "</td></tr>"; }).join("") +
      "</tbody></table></div></div>";
  });

  /* ---------- entornos ---------- */
  TB.seccion("texto-entornos", function () {
    var c = TB.cuerpo("entornos"); if (!c) return;
    var todos = E.concat(TB.P.map(function (p) { return Object.assign({}, p, { ficha: p.ficha || {}, pendiente: true, costo_mes_usd: p.config.costo_mes_usd }); }));
    c.innerHTML = '<div class="tabla fichas"><table><thead><tr><th>Entorno</th><th>Procesador</th><th class="n">Núcleos para la app</th><th class="n">RAM para la app</th><th>Sistema</th><th class="n">Arranque</th><th class="n">Costo / mes</th><th>De dónde sale el costo</th></tr></thead><tbody>' +
      todos.map(function (e) {
        var f = e.ficha || {}, cf = e.config || {};
        var so = f.modo === "docker" ? '<span title="' + esc((f.docker_host || "") + " sobre " + (f.so || "")) + '">Contenedor Linux (WSL2)</span>' : esc((f.so || "").split(" (")[0] || "—");
        return "<tr><td>" + nombre(e) + (e.pendiente ? ' <span class="pastilla pend">pendiente</span>' : "") + "</td>" +
          "<td>" + esc(cf.cpu_descripcion || f.cpu || "—") + "</td>" +
          '<td class="n">' + nf(cf.nucleos_disponibles) + (f.modo === "docker" ? " (--cpus)" : "") + '</td><td class="n">' + nf(cf.ram_disponible_gb, cf.ram_disponible_gb < 1 ? 1 : 0) + " GB</td>" +
          "<td>" + so + '</td><td class="n">' + (f.arranque_s != null ? nf(f.arranque_s, 1) + " s" : "—") + "</td>" +
          '<td class="n">' + dinero(e.costo_mes_usd, 2) + '</td><td class="small">' + esc(cf.costo_detalle || "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  });

  /* ---------- espera ---------- */
  function medidor(nom, pct, texto) {
    var p = Math.max(0, Math.min(100, pct || 0));
    var col = p >= 85 ? TB.css("--crit") : p >= 60 ? TB.css("--warn") : TB.css("--good");
    return '<div class="medidor"><div class="fila"><span>' + nom + "</span><span>" + texto + '</span></div><div class="pista"><i style="width:' + Math.max(p, 0.8) + "%;background:" + col + '"></i></div></div>';
  }
  function panelEspera(e) {
    var m = e.mediana, c = e.config, nucl = TB.limCores(e);
    var cpu = 100 * m.app_cpu_prom / nucl, cpuHost = m.cpu_total_prom;
    var mem = 100 * m.app_rss_prom / (c.ram_disponible_gb * 1024);
    var discoMbs = (m.disco_r_mbs || 0) + (m.disco_w_mbs || 0);
    var disco = 100 * discoMbs / c.disco_capacidad_mbs;
    var red = 100 * ((m.red_salida_kbs + m.red_entrada_kbs) * 8 / 1000) / c.red_capacidad_mbps;
    var rec = [["CPU", cpu], ["memoria", mem], ["disco", disco], ["red", red]].sort(function (a, b) { return b[1] - a[1]; });
    var diag = "<b>Espera en " + rec[0][0] + "</b>: usa " + nf(rec[0][1], 0) + " % de lo disponible; el siguiente recurso (" + rec[1][0] + ") va en " + nf(rec[1][1], 0) + " %.";
    if (rec[0][1] >= 85) diag += " Es el cuello de botella.";
    var ic = e.tipo === "fisica" ? "chip" : e.tipo === "contenedor" || e.tipo === "control" ? "contenedor" : "nube";
    return '<div class="panel"><div class="nom"><span class="icono-chip">' + TB.icono(ic, 20) + "</span><h3>" + esc(e.nombre) + "</h3>" + llave(e.id) + "</div><div class=\"medidores\">" +
      medidor("CPU de la app / su límite", cpu, nf(m.app_cpu_prom, 2) + " de " + nf(nucl) + " núcleos") +
      medidor("CPU total del host", cpuHost, nf(cpuHost, 0) + " % (pico " + nf(m.cpu_total_pico, 0) + " %)") +
      medidor("Memoria residente / disponible", mem, nf(m.app_rss_prom) + " de " + nf(c.ram_disponible_gb * 1024) + " MB") +
      medidor("Disco / capacidad", disco, nf(discoMbs, 2) + " MB/s · " + nf((m.disco_r_iops || 0) + (m.disco_w_iops || 0), 0) + " IOPS") +
      medidor("Red / enlace", red, nf((m.red_salida_kbs + m.red_entrada_kbs) * 8 / 1000, 1) + " Mb/s") +
      '<p class="diag">' + diag + "</p></div></div>";
  }
  TB.seccion("texto-espera", function () {
    var c = TB.cuerpo("espera"); if (!c) return;
    c.innerHTML = E.length ? '<div class="espera">' + E.map(panelEspera).join("") + "</div>" : '<p class="aviso-datos">Todavía no hay datos medidos.</p>';
  });

  /* ---------- comparacion (tabla) ---------- */
  function lista(a) { return '<ul class="lista-mini">' + a.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>"; }
  function sobraFalta(e) {
    var m = e.mediana, c = e.config, nucl = TB.limCores(e);
    var cpu = 100 * m.app_cpu_prom / nucl, mem = 100 * m.app_rss_prom / (c.ram_disponible_gb * 1024);
    var sobra = [], falta = [];
    if (cpu < 60) sobra.push("CPU: usa " + nf(cpu, 0) + " % de " + nf(nucl) + " núcleos"); else falta.push("CPU: " + nf(cpu, 0) + " % de su límite");
    if (mem < 60) sobra.push("Memoria: " + nf(m.app_rss_prom) + " de " + nf(c.ram_disponible_gb * 1024) + " MB"); else falta.push("Memoria: " + nf(mem, 0) + " % ocupada");
    sobra.push("Disco y red casi sin uso");
    if (m.p95_ms > D.slo.p95_ms) falta.push("Latencia: p95 de " + nf(m.p95_ms) + " ms");
    var ok = (e.escalado || []).filter(function (s) { return s.p95_ms <= D.slo.p95_ms; });
    return { sobra: sobra, falta: falta, techo: ok.length ? ok[ok.length - 1].vus : null };
  }
  TB.seccion("texto-comparacion", function () {
    var c = TB.cuerpo("comparacion"); if (!c) return;
    c.innerHTML = '<div class="tabla comp"><table><thead><tr><th>Entorno</th><th>¿Aguanta 30 VUs?</th><th class="n">req/s</th><th class="n">p95</th><th>Le sobra</th><th>Le falta</th><th class="n">Techo dentro del SLO</th><th class="n">US$/mes</th><th class="n">US$ por millón</th></tr></thead><tbody>' +
      E.map(function (e) {
        var s = sobraFalta(e);
        return "<tr><td>" + nombre(e) + "</td><td>" + TB.pill(e) + '</td><td class="n">' + nf(e.mediana.rps) + '</td><td class="n">' + nf(e.mediana.p95_ms, 1) + ' ms</td><td class="small">' + lista(s.sobra) + '</td><td class="small">' + (s.falta.length ? lista(s.falta) : "—") + '</td><td class="n">' + (s.techo ? s.techo + " VUs" : "—") + '</td><td class="n">' + (e.costo_mes_usd != null ? nf(e.costo_mes_usd, 2) : "—") + '</td><td class="n">' + (e.costo_por_millon_usd != null ? nf(e.costo_por_millon_usd, 3) : "—") + "</td></tr>";
      }).join("") +
      TB.P.map(function (p) {
        return "<tr><td>" + nombre(p) + '</td><td><span class="pastilla pend">Pendiente</span></td><td class="n">—</td><td class="n">—</td><td class="small" colspan="3">Medir con la guía de AWS</td><td class="n">' + (p.config.costo_mes_usd != null ? nf(p.config.costo_mes_usd, 2) : "—") + '</td><td class="n">—</td></tr>';
      }).join("") + "</tbody></table></div>";
  });

})();
