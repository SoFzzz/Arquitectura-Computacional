// Texto del veredicto. Los números salen de medicion/resultados (mediana de 3 repeticiones).
// Las respuestas a las preguntas de la sustentación están en PREGUNTAS_SUSTENTACION.md.
window.NARRATIVA = {
  recomendacion: {
    titulo: "AWS t3.small (2 vCPU, 2 GB) cumple con 30 usuarios al menor costo. Si la carga crece, hay que darle más CPU, no más memoria",
    texto: "PetClinic está <b>limitada por CPU</b>: es el único recurso que llega cerca del 100 %. La memoria, el disco y la red quedan lejos de su límite. Por eso el tamaño de la máquina se decide por núcleos.",
    puntos: [
      "<b>AWS t3.small:</b> 397 req/s, p95 de 79 ms y 0 errores. Cumple el acuerdo de servicio y es la más barata por petición (US$ 15,8/mes). Su CPU queda al 96 %, así que no le sobra para muchos más usuarios.",
      "<b>Física (portátil, 4 núcleos):</b> la que más rinde, con 514 req/s y p95 de 24 ms. Es la referencia, pero un portátil no es un servidor.",
      "<b>Contenedor de 2 CPU / 1 GB:</b> cumple (p95 de 194 ms), pero usa todas sus CPU y es el más caro por petición.",
      "<b>Contenedor de 1 CPU / 512 MB:</b> no cumple (p95 de 543 ms). Le falta CPU y le sobra memoria: es la opción descartada.",
    ],
  },
};
