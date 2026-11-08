# Preguntas de la sustentación: Dimensionar Spring PetClinic

Respuestas a las cuatro preguntas del proyecto, con los datos que medimos. Cada respuesta tiene tres partes:
- **Respuesta corta:** lo que se dice en 30 segundos.
- **Explicación:** para entender de dónde sale.
- **Qué mostrar:** la gráfica del tablero que la respalda.

---

## Antes de empezar: lo que hay que saber

**La aplicación.** Spring PetClinic es la aplicación de ejemplo de Spring Boot: una clínica veterinaria (dueños, mascotas, veterinarios). Su base de datos (H2) vive **en la memoria RAM**, no en el disco.

**Los entornos que medimos:**

| Entorno | Qué es |
|---|---|
| **Física** | Nuestro portátil: Intel i5-8300H (4 núcleos), 24 GB de RAM, Windows 10 |
| **Contenedor 2 CPU / 1 GB** | Docker en el mismo portátil, limitado a 2 CPU y 1 GB |
| **Contenedor 1 CPU / 512 MB** | Docker en el mismo portátil, limitado a 1 CPU y 512 MB |
| **Contenedor sin límites** | Docker sin límites, en el mismo portátil. Sirve solo para comparar: muestra cuánto cuesta usar Docker |
| **AWS t3.small** | Máquina virtual en la nube de Amazon: 2 vCPU, 2 GB, Linux |

**Palabras clave:**
- **Usuarios virtuales:** programas que hacen de usuarios y navegan la aplicación sin parar. Usamos 30 a la vez.
- **req/s (throughput):** cuántas peticiones atiende la aplicación por segundo. Más es mejor.
- **p95:** el 95 % de las peticiones tardó eso o menos. Si el p95 es 24 ms, solo 1 de cada 20 peticiones tardó más de 24 ms. Menos es mejor.
- **Meta (SLO):** p95 de 300 ms o menos, y menos del 1 % de errores. Si un entorno cumple, "aguanta".

**Los resultados (30 usuarios, 0 errores en todos):**

| Entorno | req/s | p95 | CPU usada | Memoria usada | ¿Aguanta? | US$/mes |
|---|---|---|---|---|---|---|
| Física | 514 | 24 ms | 2,7 núcleos | 714 MB | Sí | ~31 (estimado) |
| AWS t3.small | 397 | 79 ms | 96 % de su CPU | 527 MB | Sí | 15,8 |
| Contenedor 2 CPU / 1 GB | 251 | 194 ms | 100 % (2 de 2) | 364 MB | Sí, justo | 62,3 |
| Contenedor 1 CPU / 512 MB | 134 | 543 ms | 100 % (1 de 1) | 345 MB | **No** | 31,2 |

---

## 1. ¿Por qué ese número y no otro? ¿Cómo lo midieron?

> **Respuesta corta:** "Cada número es la **mediana de tres pruebas de 5 minutos** con 30 usuarios. Antes de medir dejamos 1 minuto de calentamiento que no contamos. Usamos el mismo programa de carga y el mismo monitor en todos los entornos, así que la comparación es justa. Guardamos cada petición, más de 150.000 por prueba, y de ahí calculamos el p95."

**Cómo se midió:**
1. **Generador de carga** (`carga.py`): 30 usuarios virtuales repiten este recorrido:
   - entrar al inicio
   - listar dueños
   - buscar un dueño por apellido
   - ver su detalle
   - ver los veterinarios
   - editar el dueño

   Entre clic y clic hacen una pausa de 50 ms. Por cada petición se guarda una fila: qué se pidió, cuánto tardó y si dio error.
2. **Monitor** (`monitor.py`): cada segundo anota cuánta CPU, memoria, disco y red usa la aplicación.
3. **Protocolo, igual en todos los entornos:**
   - arrancar la aplicación
   - 30 s en reposo
   - 1 minuto de calentamiento (no se cuenta)
   - 3 pruebas de 5 minutos
   - una prueba subiendo los usuarios (5, 10, 20, 40, 80 y 120)

**Por qué estos números y no otros:**
- **Por qué tres pruebas y la mediana.** Una sola prueba puede salir alta o baja por casualidad. La mediana es el valor del medio: no la arrastra una prueba rara. En la física las tres pruebas dieron 514, 520 y 498 req/s, así que la medición es **repetible** (varía un 4 %).
- **Por qué descartamos el calentamiento.** Java se acelera solo en los primeros segundos, porque optimiza el código mientras corre. Si contáramos ese minuto, mediríamos el arranque y no la capacidad real.
- **Por qué el p95 y no el promedio.** El promedio esconde las peticiones lentas, y son las que el usuario siente. En la física, el promedio es 8 ms, pero 1 de cada 20 peticiones tarda más de 24 ms.

**Qué mostrar:** *Veredicto* (el marcador con todos los números) y *Latencia* (las curvas del p95 y la gráfica de las tres repeticiones).

**Si preguntan...**
- *"¿Por qué en los contenedores las tres pruebas dieron tan distinto?"* (172, 251 y 291 req/s en el de 2 CPU) Con poca CPU, Java tarda más en terminar de optimizarse, así que cada prueba sale mejor que la anterior. Por eso usamos la mediana y no la primera ni la mejor.
- *"¿Por qué editar dueños y no crearlos?"* Probamos creando dueños, y el listado se fue volviendo lento (de 14 ms a 2,6 s en un minuto) porque la tabla no paraba de crecer. Así las pruebas no se podían comparar entre sí. Editar también escribe en la base de datos, pero sin hacerla crecer.

**Qué mejorar en la medición:**
- **Correr el generador en otra máquina.** Hoy comparte la CPU con la aplicación: en AWS le quitó 0,18 de sus 2 vCPU, cerca del 9 %. En una máquina aparte, la aplicación tendría toda su CPU y los números serían un poco más altos y más limpios.
- **Medir el portátil "en silencio".** En reposo, Windows ya usaba el 14 % de la CPU (antivirus, actualizaciones, otros programas). Cerrar todo, o desactivar las actualizaciones durante la prueba, quita ese ruido.
- **Más repeticiones en los contenedores.** Sus tres pruebas variaron mucho (172 a 291 req/s). Con 5 repeticiones, o con un calentamiento más largo, el resultado sería más firme.
- **Comprobar con una herramienta conocida.** Repetir una prueba con k6 o JMeter y ver que da números parecidos respalda que nuestro generador mide bien.

---

## 2. ¿Qué componente del computador está causando ese comportamiento?

> **Respuesta corta:** "**El procesador (la CPU).** Es el único recurso que llega cerca del 100 %. Los contenedores usan exactamente la CPU que les dimos, 2 de 2 y 1 de 1, y AWS tiene su CPU al 96 %. Mientras tanto, la memoria se queda entre el 26 % y el 67 % de lo disponible. El disco y la red casi no se usan: la base de datos está en RAM."

**La evidencia:**

| Entorno | CPU | Memoria | Disco | Red |
|---|---|---|---|---|
| Contenedor 1 CPU | **100 %** | 67 % | ~0 | ~0 |
| Contenedor 2 CPU | **100 %** | 36 % | ~0 | ~0 |
| AWS t3.small | **96 %** | 26 % | ~0 | ~1 % |
| Física | 2,7 de 4 núcleos | 3 % | ~0 | ~1 % |

Tres pruebas de que es la CPU:
1. **Los contenedores tocan su límite exacto de CPU.** Cuando una aplicación agota la CPU que tiene, las peticiones hacen fila. Por eso el contenedor de 1 CPU tarda 543 ms (p95), y la física, con la misma carga, 24 ms.
2. **Con el doble de CPU atiende casi el doble.** Pasar de 1 CPU a 2 CPU sube de 134 a 251 req/s. La memoria no era el problema: al de 1 CPU le sobraba (usaba 345 de 512 MB).
3. **Disco y red están casi en cero.** La base de datos vive en la RAM, y la red mueve ~1,5 MB/s, que es muy poco.

**Un dato curioso sobre la memoria:** la misma aplicación usa 714 MB en la física y 345 MB en el contenedor de 512 MB. Java reserva memoria según la que ve disponible: si tiene más, usa más. Eso no significa que la necesite. Con 512 MB funciona sin errores.

**La operación más pesada es "listar dueños":** 42 ms de p95 en la física, frente a 3 ms de "editar dueño". Recorre todos los dueños con sus mascotas y arma una página grande, y todo eso es trabajo de CPU.

**Qué mostrar:** *¿Dónde espera?* (barras de cada recurso por entorno) y *Recursos* (núcleos usados frente al límite y memoria frente al límite).

**Si preguntan...**
- *"¿No será la memoria?"* No: ningún entorno pasó del 67 % de su memoria, y el que menos tenía (512 MB) no dio errores.
- *"¿Por qué la física tiene la CPU al 54 % si la CPU es el cuello?"* Con 30 usuarios a la física todavía le sobra CPU. Se ve en la gráfica de *×10 la carga*: a partir de 40 usuarios ya no puede atender más.

**Qué mejorar, sabiendo que el cuello es la CPU:**
- **Gastar en CPU, no en memoria.** Al elegir una máquina, lo que hay que mirar primero es cuántos núcleos tiene. Pagar más RAM no acelera esta aplicación.
- **Hacer que "listar dueños" gaste menos CPU.** Hoy trae todos los dueños y los pagina en memoria. Si la base de datos devolviera solo la página que se muestra, esa operación sería mucho más liviana y toda la aplicación aguantaría más usuarios con la misma máquina.
- **Ajustar la memoria de Java.** Como Java toma memoria según la que ve, se le puede fijar un tope (por ejemplo, `-Xmx256m`) y elegir una máquina con menos RAM, que es más barata.
- **Usar un perfilador** (VisualVM o Java Flight Recorder, que vienen con Java) para ver qué partes del código consumen más CPU y optimizarlas.

---

## 3. Si la carga se multiplicara por diez, ¿qué se rompería primero?

> **Respuesta corta:** "**Se rompería la CPU, y con ella el tiempo de respuesta.** Subimos los usuarios hasta 120, 4 veces la carga normal. Ningún entorno dio errores, pero todos llegaron a un techo: a partir de ahí no atienden más peticiones y la respuesta se vuelve cada vez más lenta. Con 10 veces la carga, todos quedarían muy por encima de la meta de 300 ms. La memoria, el disco y la red no serían el problema."

**Lo que medimos** (p95 según la cantidad de usuarios; ✗ = no cumple la meta de 300 ms):

| Usuarios | Física | AWS t3.small | 2 CPU | 1 CPU |
|---|---|---|---|---|
| 20 | 14 ms | 47 ms | 50 ms | 246 ms |
| 40 | 77 ms | 186 ms | 258 ms | 750 ms ✗ |
| 80 | 301 ms ✗ | 600 ms ✗ | 732 ms ✗ | 1.745 ms ✗ |
| 120 | 584 ms ✗ | 1.090 ms ✗ | 1.250 ms ✗ | 2.665 ms ✗ |

**Cómo se explica:**
- Mientras sobra CPU, más usuarios significan más peticiones atendidas y el tiempo de respuesta casi no cambia.
- Cuando la CPU llega a su tope, el entorno **deja de atender más** (la física se queda en ~540 req/s, AWS en ~370 y el de 1 CPU en ~150). Cada usuario extra solo se suma a la fila. Es como una caja de supermercado: si el cajero ya va a su máxima velocidad, más clientes solo alargan la fila.
- Si con 4 veces la carga (120 usuarios) ya están todos entre 0,6 y 2,7 s, **con 10 veces sería aún peor**. Esa parte no la medimos, se deduce de la tendencia.

**El orden en que se rompen las cosas:**
1. **La CPU.** Se satura y el tiempo de respuesta sube por encima de la meta. Lo medimos.
2. **La operación de listar dueños.** Es la más pesada, así que es la primera en ponerse lenta. Y si con más usuarios también se crearan más registros, empeoraría todavía más, como vimos en la prueba de crear dueños.
3. **Lo que no se rompería:**
   - **Memoria:** se mantuvo estable durante toda la prueba.
   - **Disco:** la base de datos está en RAM.
   - **Red:** ×10 serían unos 15 MB/s, que cualquier red aguanta.

**Qué mostrar:** *×10 la carga* (las curvas de throughput y p95 según los usuarios).

**Si preguntan...**
- *"¿Por qué no hubo errores?"* Nuestros usuarios virtuales esperan cada respuesta antes de pedir la siguiente: si la aplicación se pone lenta, piden más despacio. Con usuarios reales que siguen llegando, con 10 veces la carga sí empezarían los errores. Eso no lo medimos.
- *"¿Qué harían para aguantar ×10?"* Darle más CPU, con una máquina más grande o varias máquinas. Más memoria no ayudaría, porque no es lo que falta.

**Qué mejorar para aguantar más carga:**
- **Varias copias de la aplicación detrás de un balanceador.** En lugar de una sola máquina enorme, se usan varias pequeñas y un balanceador reparte los usuarios entre ellas. En AWS, además, se pueden agregar copias automáticamente cuando sube la carga (*auto scaling*).
- **Sacar la base de datos de la memoria.** Hoy cada copia de la aplicación tendría su propia base H2, con datos distintos. Para tener varias copias hay que usar una base de datos compartida, como MySQL o PostgreSQL. PetClinic ya viene preparada para las dos.
- **Arreglar "listar dueños" primero.** Es lo primero que se pone lento, y empeora a medida que crece la cantidad de dueños.
- **Fallar de forma ordenada.** Poner un tiempo máximo de espera y un límite de peticiones a la vez. Así, ante una avalancha, la aplicación responde "intente más tarde" a unos pocos en lugar de volverse lenta para todos.
- **Medir con llegadas reales.** Una prueba en la que las peticiones llegan a un ritmo fijo, sin esperar la respuesta anterior, mostraría en qué punto aparecen los errores.

---

## 4. ¿Qué opción descartaron y por qué?

> **Respuesta corta:** "Descartamos el **contenedor de 1 CPU y 512 MB**: no cumple la meta. Su p95 es de 543 ms con 30 usuarios, casi el doble de lo permitido. Está al 100 % de su CPU y le sobra memoria. Es decir, le dimos de más lo que no necesita (memoria) y de menos lo que sí necesita (CPU)."

**Por qué se descarta:**
- p95 de **543 ms** (la meta es 300 ms). Con 20 usuarios cumple, con 40 ya no.
- CPU al **100 %**, memoria al 67 %: el problema es la CPU.
- Cuesta lo mismo al mes que la física (US$ 31,2), pero atiende **4 veces menos** peticiones. Barato al mes no significa barato por petición.

**Lo que elegimos: AWS t3.small**
- **Cumple la meta:** p95 de 79 ms, 0 errores, 397 req/s.
- **Es la más barata:** US$ 15,8 al mes, y también la más barata por cada petición atendida.
- **Su límite:** con 30 usuarios ya tiene la CPU al 96 %. Si los usuarios crecieran, habría que pasar a una máquina con más CPU, no con más memoria.

**Las otras dos opciones:**
- **Física:** es la que más rinde (514 req/s, p95 de 24 ms), pero es un portátil. Sirve de referencia, no como servidor.
- **Contenedor de 2 CPU:** cumple, pero justo (p95 de 194 ms con el 100 % de su CPU), y es el más caro por petición (US$ 62,3 al mes).

**Un aprendizaje que vale la pena contar.** Antes de medir pensábamos que AWS iba a rendir menos que el contenedor de 2 CPU, porque los dos tienen "2 CPU". Pero AWS rindió más: 397 frente a 251 req/s. El contenedor corre dentro de Docker en Windows, y esa capa extra le cuesta rendimiento. Lo comprobamos con el contenedor sin límites: en el mismo portátil, solo por usar Docker, rindió un 16 % menos que la física (434 frente a 514 req/s).

**Qué mostrar:** *Costo* (la tabla de qué le sobra y qué le falta a cada uno) y *Cara a cara* (todos frente a la física).

**Si preguntan...**
- *"¿Por qué no eligieron la física si fue la mejor?"* Porque es un portátil con Windows: no está pensado para estar encendido atendiendo usuarios todo el tiempo. Lo que nos dice es cuánta CPU necesita la aplicación.
- *"¿El costo de la física de dónde sale?"* Es una estimación: un equipo de unos US$ 800 pagado en 3 años, más la electricidad, da unos US$ 31 al mes.

**Qué mejorar en la elección:**
- **Si los usuarios crecen, subir de CPU, no de RAM.** Por ejemplo, una t3.medium tiene las mismas 2 vCPU que la t3.small con el doble de memoria: no ayudaría. Habría que ir a una de 4 vCPU, como una t3.xlarge o una de la familia "c", que está pensada para cómputo.
- **El contenedor de 1 CPU no es inútil.** Sirve para cargas pequeñas: con 20 usuarios todavía cumple (p95 de 246 ms). Sería una opción barata para un entorno de pruebas.
- **Probar Docker en Linux.** Medir el mismo contenedor dentro de la instancia de AWS mostraría si la pérdida venía de Docker o de Docker Desktop en Windows. Lo esperado es que en Linux casi no pierda rendimiento.
- **Apagar la instancia cuando no se usa.** En AWS se paga por hora encendida. Para una aplicación que solo se usa en horario de oficina, apagarla de noche reduce el costo a menos de la mitad.
