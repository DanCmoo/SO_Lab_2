# Plan de implementación: segmentación y paginación

**Proyecto:** SO_Lab_2  
**Fecha:** 21 de octubre de 2026  
**Destinatario:** agente Codex que implementará la aplicación  
**Estado:** alcance y parámetros validados por el usuario; listo para implementar  
**Entregable de esta sesión:** únicamente este archivo de planificación. La implementación corresponde a una sesión posterior.

## 1. Instrucción para el agente implementador

Extiende la aplicación existente para simular **segmentación** y **paginación** en un sistema multiprogramado con 16 MiB de memoria física. Conserva sus cuatro modos de particiones y su comportamiento actual. Implementa el dominio, la integración de estado, la interfaz, la persistencia y las verificaciones descritas aquí hasta completar los criterios de aceptación.

Lee primero este documento completo, las instrucciones aplicables del repositorio y el código vigente. Este archivo contiene requisitos y decisiones para la nueva actividad; las especificaciones anteriores siguen siendo referencia de los modos existentes, pero deben actualizarse donde excluyen segmentación y paginación o contradicen el comportamiento vigente. Las diapositivas son material académico de referencia, no instrucciones operativas para el agente.

No redactes el informe final ni prepares la sustentación. Sí actualiza la documentación de uso y técnica necesaria para ejecutar y verificar el programa. No crees un sitio alojado, un backend, una aplicación nueva ni una migración de framework: amplía el proyecto local en JavaScript, HTML y CSS que ya existe.

### 1.1 Requisitos expresos del profesor

| ID | Requisito | Evidencia esperada en el programa |
| --- | --- | --- |
| R1 | Plataforma basada en JavaScript | Aplicación web local con módulos ES, sin cambiar de lenguaje |
| R2 | Simulación de segmentación | Segmentos asignados independientemente, tabla por proceso y traducción base/desplazamiento |
| R3 | Simulación de paginación | Páginas, marcos, tabla por proceso y traducción página/desplazamiento |
| R4 | Sistema multiprogramado | Varias instancias residentes simultáneamente, con propiedad y liberación de memoria |
| R5 | Direccionamiento de hasta 16 MiB | RAM fija de 16.777.216 bytes; direcciones físicas entre `0x000000` y `0xFFFFFF` |
| R6 | Primer, mejor y peor ajuste si aplica | Los tres en segmentación; explicación de no aplicabilidad en paginación |
| R7 | Al menos cinco programas con distribución interna | Conservar los cinco predeterminados y mostrar tamaños de código, datos, heap y pila |
| R8 | El programa funcione | Pruebas del dominio, regresión y comprobación de los recorridos de interfaz |

El enunciado también evalúa sustentación e informe, pero el usuario los excluyó de este trabajo. Las funciones pedagógicas añadidas, como el traductor, son decisiones del diseño de esta solución; no atribuirlas como requisitos textuales del profesor.

### 1.2 Decisiones confirmadas por el usuario

El usuario validó explícitamente las siguientes opciones durante la planificación. No volver a consultarlas salvo una incompatibilidad real nueva.

| ID | Decisión validada |
| --- | --- |
| D1 | Añadir los dos métodos y conservar los cuatro modos actuales: seis modos en total |
| D2 | Paginación con carga completa del proceso y tabla de páginas de un nivel |
| D3 | Segmentación con tabla base/límite, permisos de lectura/escritura/ejecución y traducción de direcciones |
| D4 | Excluir TLB, demanda, reemplazo de páginas, segmentos compartidos, crecimiento durante la ejecución y compactación de segmentos |
| D5 | RAM fija de 16 MiB y reserva inicial del SO de 1 MiB, configurable antes de iniciar |
| D6 | Tamaño de página inicial de 4 KiB; opciones de 1, 2, 4, 8, 16 y 64 KiB antes de iniciar |
| D7 | En paginación, la reserva del SO debe ser múltiplo del tamaño de página |
| D8 | Conservar los cinco programas y representar código, datos, heap y pila como regiones del proceso |

Las convenciones de implementación que siguen concretan ese modelo. Si necesitas modificar D1-D8, consulta al usuario y explica qué incompatibilidad impide cumplirlas. Resuelve por criterio técnico nombres internos, distribución de funciones y detalles visuales que no alteren el modelo. No amplíes el alcance por el solo hecho de que un tema aparezca en las diapositivas.

## 2. Estado real del repositorio al preparar este plan

La revisión inicial se realizó sobre los archivos de trabajo del 21 de octubre de 2026, incluyendo cambios locales sin confirmar. La revisión posterior de los comentarios se contrastó contra el commit `b8da5e4`, con el árbol de trabajo limpio antes de editar este plan. Se volvió a ejecutar `node --test "tests/*.test.js"`: **60 pruebas aprobadas, 0 fallidas**. Esto verifica la base actual; no significa que los métodos nuevos estén implementados ni que la interfaz haya sido validada en navegador en esta sesión.

### 2.1 Base reutilizable

- Aplicación estática con JavaScript nativo, módulos ES, HTML y CSS; `package.json` no declara dependencias de aplicación.
- RAM de 16 MiB, reserva del SO de 1 MiB y conversión de unidades/direcciones.
- `MemoryMode`: `STATIC_EQUAL`, `STATIC_UNEQUAL`, `DYNAMIC_NO_COMPACTION`, `DYNAMIC_COMPACTION`.
- Separación entre dominio, motores, estado, datos y presentación.
- Catálogo de programas e instancias independientes, como `P1~1`, con numeración persistente.
- Reserva fija por ejecución de heap y stack, separada de la imagen y cargada a la memoria de usuario.
- Almacén con comandos, comprobación de invariantes, deshacer hasta 50 operaciones y almacenamiento local.
- Primer, mejor y peor ajuste en `src/engine/allocators.js`, con trazas y desempate por dirección menor.
- Mapa de memoria, vista tabular, inspector, comparación de algoritmos y mensajes principalmente en español.

### 2.2 Brechas y riesgos identificados

1. Hoy los segmentos son subdivisiones de **un bloque contiguo de proceso**. Añadir etiquetas a ese bloque no implementa segmentación.
2. No existen marcos, tabla de páginas ni motor de paginación.
3. `Program.start/end`, `containerId`, las invariantes y los renderizadores presuponen un único intervalo físico por residente. Esa premisa no sirve para los nuevos modos.
4. `simulator.js`, `metrics.js` e `invariants.js` tratan «no estático» como sinónimo de «dinámico» en **cuatro puntos de tres archivos**: `allocate()` y `terminate()` en `simulator.js`, la clasificación `isStatic` de `deriveMetrics()` en `metrics.js`, y la condición de invariantes específicas del modo en `assertState()` de `invariants.js`. Sus `return`/`else` implícitos absorberían silenciosamente `SEGMENTATION` y `PAGING` con el motor, la contabilidad o las invariantes de particiones dinámicas. Sustituir los cuatro por un `switch` exhaustivo o ramas explícitas con rechazo final para cualquier modo sin implementación es **condición de entrada a la Fase 1**, no un detalle de estilo. No basta validar que el valor pertenece a `MemoryMode`: cada operación debe decidir explícitamente qué implementación corresponde a cada modo. Mantener el contrato actual de compactación: solo al terminar un proceso en `DYNAMIC_COMPACTION`; asignar nunca compacta.
5. El mismo supuesto aparece en `createInitialState()` de `models.js` y `extractCandidates()` de `candidates.js`; además, `createSimulationConfig()` no rechaza modos desconocidos. Incluir estos puntos en la revisión de despacho y validación inicial para que añadir una constante no active una representación o un asignador contiguo por defecto. Las métricas e invariantes de los dos modos nuevos necesitan ramas propias, no reutilizar sin adaptación las reglas dinámicas existentes.
6. `layoutSegments` de `compaction.js` se usa desde la interfaz y calcula posiciones contiguas. No reutilizarlo para inventar las posiciones de los nuevos modos.
7. `compareAlgorithms` utiliza asignación de bajo nivel y puede reutilizar registros del catálogo; sus inspecciones fallidas pueden quedar mal contadas. Para segmentación debe invocar la misma semántica de creación de instancias y capturar la traza del intento actual.
8. La versión vigente de estado es **2**, aunque partes de `specs/technical-spec.md` todavía muestran 1. La clave de almacenamiento sigue siendo `mms:simulation:v1`: el sufijo de la clave no es el número de esquema.
9. Las especificaciones antiguas declaran los métodos nuevos fuera de alcance, muestran inglés como idioma e incluyen reglas de particiones iguales desactualizadas. El código actual permite remanente no particionado; no convertir esa regla en una prohibición.
10. Las especificaciones mencionan un historial de eventos y `history.js` que no existen como tales en la aplicación revisada. No dar por implementada una bitácora; para este alcance basta la traza visible del último intento y el deshacer existente.

La revisión inicial encontró numerosos archivos modificados y archivos nuevos sin seguimiento; ese trabajo ya figura en el commit contrastado. Al implementar, vuelve a inspeccionar el estado real y **preserva cualquier trabajo local que encuentres**. No restaures archivos, limpies el repositorio ni reviertas cambios ajenos. Registra el estado inicial y vuelve a ejecutar la base de pruebas antes de editar. Un cambio de rama o un commit no es condición para implementar.

## 3. Modelo académico y convenciones

### 3.1 Memoria y unidades

- `1 KiB = 1024 B`; `1 MiB = 1.048.576 B`.
- `TOTAL_MEMORY_BYTES = 2 ** 24 = 16.777.216`; `MAX_ADDRESS = TOTAL_MEMORY_BYTES - 1`.
- El SO ocupa el intervalo inicial `[0, osBytes)`. Si `osBytes = 0`, no crear un bloque de tamaño cero.
- La memoria de usuario comienza en `osBytes` y termina en `0xFFFFFF`.
- Un intervalo no vacío tiene final inclusivo `end = start + sizeBytes - 1`.
- Direcciones físicas visibles: prefijo `0x`, seis dígitos hexadecimales mayúsculos.
- Tamaños y direcciones internos: enteros seguros de JavaScript. Validar valores completos; rechazar `12abc`, `NaN`, infinito, negativos y bytes fraccionarios. No truncar entradas con `parseInt` o `parseFloat` sin validar su formato completo.
- Cero es válido para heap, pila, reserva del SO y desplazamientos; no para un segmento de imagen ni el tamaño de página.
- Los 24 bits impuestos corresponden al **espacio físico**. No deducir de ello una arquitectura de CPU ni fijar arbitrariamente bits de selector de segmento. En paginación se usa un espacio lógico lineal desde 0 hasta `L - 1` por proceso; conserva el límite de tamaño de programa de la aplicación, `L <= 16 MiB`.

### 3.2 Simplificaciones explícitas de la simulación

Estas convenciones deben aparecer en una ayuda breve de los nuevos modos y en la documentación técnica:

- Las estructuras del gestor (tablas, listas libres, descriptores) son metadatos del simulador. No se les asignan bytes adicionales dentro de los 16 MiB ni se inventa un tamaño de entrada de tabla.
- Toda la memoria solicitada del proceso, incluidas sus reservas de heap y pila, se carga al ejecutar. Los tamaños permanecen fijos hasta terminar.
- No se ejecutan instrucciones reales ni se simula CPU, disco, concurrencia de accesos o contenidos byte a byte. El traductor comprueba una referencia de un byte y devuelve dirección o error.
- Una referencia inválida muestra el error y conserva la simulación para permitir experimentar. No termina automáticamente el proceso.
- No hay memoria compartida: cada segmento o marco pertenece a una sola instancia.
- En segmentación, la pila se modela como región de capacidad fija con base física inferior y desplazamientos crecientes dentro de ella. No reutilizar una flecha de crecimiento descendente como regla de traducción; no se simulan punteros ni crecimiento de pila.
- En paginación se comprueban límites y propiedad del mapeo. Los permisos R/W/X son función del modo segmentado en esta entrega; no inventar permisos por byte o por región dentro de una página.

### 3.3 Precisiones respecto a las diapositivas

Usar las diapositivas como base conceptual y adaptar sus ejemplos a este laboratorio:

- PDF, páginas 28-29: unidades segmentadas y tabla por proceso; el límite de esta implementación es **cantidad de bytes**. Por tanto, `offset === limitBytes` es inválido; el último válido es `limitBytes - 1`. El gráfico `offset > límite` no debe causar un error de uno al usar esta convención.
- PDF, páginas 31-32: distinguir página lógica y marco físico; no exigir continuidad de marcos.
- PDF, página 34: con páginas de 4 KiB, el desplazamiento tiene 12 bits. En **16 MiB físicos** hay `2 ** (24 - 12) = 4096` marcos: 12 bits de número de marco y 12 de desplazamiento. Los 4 bits del ejemplo de la diapositiva no describen esta RAM.
- No trasladar al programa una regla universal de “tamaño de página idóneo por arquitectura”. Aquí se ofrecen los tamaños acordados como parámetro didáctico.
- No confundir una dirección fuera del tamaño lógico del proceso con un fallo de página por demanda. Este último no se simula.

## 4. Programas predeterminados y regiones

Conservar `src/data/default-programs.js`, sus IDs, nombres y tamaños:

| Programa | Código (KiB) | Datos (KiB) | Heap (KiB) | Pila (KiB) | Total (KiB) |
| --- | ---: | ---: | ---: | ---: | ---: |
| P1 Compilador | 768 | 512 | 512 | 256 | 2048 |
| P2 Navegador | 1024 | 768 | 1024 | 256 | 3072 |
| P3 Editor | 512 | 256 | 256 | 256 | 1280 |
| P4 Base de datos | 1024 | 1536 | 1024 | 512 | 4096 |
| P5 Reproductor multimedia | 768 | 512 | 1024 | 256 | 2560 |

Definir un adaptador puro, por ejemplo `getProcessRegions(program)`, para obtener en orden:

1. Los segmentos de imagen en el orden del catálogo (`Code`, `Data` o nombres personalizados).
2. Heap, si su tamaño es mayor que cero.
3. Stack, si su tamaño es mayor que cero.

Cada región tendrá ID estable dentro de la instancia, nombre, tipo, tamaño y permisos propuestos. Usar la identidad de instancia y la de región conjuntamente; las ejecuciones del mismo programa no deben compartir accidentalmente IDs físicos. El catálogo conserva su representación actual: no convertir heap/stack en segmentos de imagen, que `createProgram` actualmente prohíbe.

Para segmentación, todas estas regiones se convierten en unidades físicas asignables independientes. Código: `r-x`; datos, heap, pila y regiones personalizadas: `rw-` por defecto. Permitir elegir R/W/X para los segmentos de imagen al crear un programa personalizado; heap y pila conservan `rw-`. Guardar los permisos por región y en su descriptor, sin cambiar la política de asignación de los modos antiguos.

Para paginación, concatenar las regiones **lógicamente**, en ese mismo orden, sin huecos ni alineación individual. Una página puede contener el final de una región y el inicio de otra. No redondear cada región por separado: eso introduciría una variante distinta y alteraría la fragmentación acordada. Las reservas runtime son memoria de usuario de cada instancia, no memoria del bloque del núcleo.

## 5. Segmentación

### 5.1 Configuración y asignación

- Añadir `MemoryMode.SEGMENTATION`, etiqueta **Segmentación**.
- Estado inicial: SO y un hueco con toda la memoria de usuario; sin particiones estáticas ni marcos.
- Permitir primer, mejor y peor ajuste. Cambiar el algoritmo afecta solo a futuras cargas.
- Al ejecutar, crear una instancia y asignar **cada región por separado**, en el orden de la sección 4.
- Un segmento ocupa exactamente su tamaño solicitado en un intervalo contiguo; los segmentos de una misma instancia pueden quedar separados. También es válido que queden juntos si esos son los huecos elegidos.
- Construir candidatos desde los huecos de la copia de trabajo actual, ordenados por dirección física ascendente, antes de colocar cada segmento.
- Primer ajuste: primer hueco suficiente. Mejor ajuste: menor hueco suficiente. Peor ajuste: mayor hueco suficiente. Empates: menor dirección.
- Asignar desde el inicio del hueco seleccionado; conservar el remanente solo si tiene tamaño positivo.
- Registrar por segmento candidatos inspeccionados, tamaños, elección, dirección y número de inspecciones. La traza total suma las inspecciones de todos los segmentos intentados.
- No reordenar segmentos por tamaño, no buscar combinaciones alternativas y no compactar.

### 5.2 Transacción y errores

La carga del proceso completo es atómica. Trabajar sobre una copia y publicar el nuevo estado solo si **todas** sus regiones quedaron asignadas y se cumplen las invariantes.

Si la memoria libre inicial es menor que `L`, rechazar por memoria total insuficiente. En caso contrario, si un segmento no encuentra hueco durante la colocación, rechazar indicando fragmentación o distribución de huecos bajo la estrategia actual, segmento que falló, tamaño solicitado, total libre y mayor hueco **en ese paso**. Los datos de la copia ayudan a explicar el fallo, pero no se publican como memoria asignada.

Después de un rechazo deben permanecer intactos bloques, tablas, instancias, contadores de ejecución, selección persistida y pila de deshacer. Devolver la traza fallida en `result.details` para mostrarla sin convertir el intento en una asignación parcial ni sobrescribir una traza anterior como si fuera nueva.

La asignación es voraz: puede fallar una política cuando otra sí logra cargar el mismo proceso. No afirmar que el rechazo demuestra imposibilidad de toda distribución imaginable.

### 5.3 Tabla y traducción

Cada instancia residente dispone de una tabla ordenada de descriptores con:

`segmentNumber`, `regionId`, `name`, `kind`, `base`, `limitBytes`, `permissions`.

Numeración desde 0 según el orden de regiones. `limitBytes` expresa tamaño, no dirección final. La dirección final se deriva para mostrarla. Para una referencia `(instanceId, segmentNumber, offset, operation)`:

1. Exigir instancia residente y selector entero existente en **su propia tabla**.
2. Validar operación en `READ`, `WRITE`, `EXECUTE`.
3. Exigir desplazamiento entero con `0 <= offset < limitBytes`.
4. Comprobar el permiso correspondiente.
5. Calcular `physicalAddress = base + offset` y validar rango físico y propiedad del segmento.

El traductor devuelve el descriptor usado, base, desplazamiento, fórmula y resultado; o un error específico. Nunca busca el segmento de otro proceso para completar una traducción.

### 5.4 Liberación

Terminar una instancia libera todos sus segmentos en una sola transacción, elimina sus descriptores y reservas runtime y fusiona huecos físicamente adyacentes, incluso si se forman por liberaciones bilaterales. No mueve segmentos de otros procesos. Mantener la numeración de ejecuciones consumidas. Una sola operación de deshacer restaura la instancia, sus tablas y todos sus intervalos.

### 5.5 Métricas

- Memoria útil residente: suma de tamaños de regiones de todas las instancias residentes.
- Memoria física asignada a usuarios: igual a la útil en este modelo de asignación exacta.
- Fragmentación interna: **0 B**.
- Memoria libre, cantidad de huecos, hueco mayor, cantidad de segmentos residentes, cantidad de procesos residentes e inspecciones del último intento.
- La memoria libre no es por sí misma “bytes de fragmentación externa”. Mostrar los huecos y explicar el rechazo respecto a una solicitud concreta.
- No reutilizar la regla antigua `mayorHueco < tamañoTotalDelPrograma`: un proceso segmentado puede cargarse sin un hueco para su total. Si se ofrece un indicador de rechazo por fragmentación, derivarlo del intento del motor sobre una copia, con la política y el orden reales.

## 6. Paginación

### 6.1 Configuración

- Añadir `MemoryMode.PAGING`, etiqueta **Paginación**.
- Tamaños permitidos en bytes: `1024`, `2048`, `4096`, `8192`, `16384`, `65536`. Predeterminado: `4096`.
- `frameCount = TOTAL_MEMORY_BYTES / pageSizeBytes` debe ser entero.
- Exigir `osBytes % pageSizeBytes === 0`; rechazar una configuración no alineada con mensaje comprensible, sin redondearla silenciosamente.
- Marcos numerados desde 0 sobre **toda la RAM**, incluidos los reservados al SO. No reiniciar la numeración al comenzar memoria de usuario.
- `osFrameCount = osBytes / pageSizeBytes`; marcos del SO: `[0, osFrameCount)`.
- Configuración inicial acordada: 4096 marcos totales, 256 del SO, 3840 disponibles para usuarios.
- Cambiar página, reserva del SO o modo durante una simulación usa el flujo existente de confirmar reinicio. Cancelar conserva controles y estado anteriores. No migrar procesos residentes entre modos.

### 6.2 Carga y asignación de marcos

Sea `L` la suma de tamaños de todas las regiones de la instancia y `Q` el tamaño de página:

```text
pageCount = Math.ceil(L / Q)
allocatedPhysicalBytes = pageCount * Q
internalFragmentationBytes = allocatedPhysicalBytes - L
```

Crear páginas lógicas `0..pageCount-1`. Asignar a cada una el marco libre de menor número, sucesivamente. La política se denomina **Marcos libres en orden ascendente**; no presentarla como comparación entre primer, mejor y peor ajuste.

No requerir una secuencia de marcos contiguos. Si hay menos marcos libres que páginas requeridas, rechazar sin efectos parciales y explicar páginas necesarias, marcos disponibles, bytes útiles y bytes físicos requeridos. No cargar páginas parcialmente ni expulsar páginas de otros procesos.

Deshabilitar el selector de ajuste y el botón de comparar los tres ajustes en paginación; acompañarlos con una explicación visible: todos los marcos tienen igual capacidad. La selección previa de ajuste de los otros modos puede conservarse, pero no influye en el motor paginado. El comando y la API de comparación también deben rechazar su aplicación al modo paginado.

### 6.3 Tabla y traducción

Cada entrada de tabla contiene `pageNumber`, `frameNumber` y `usedBytes`. El resto del marco es relleno no utilizable por otra instancia. Todas las páginas de un proceso residente están presentes; no hace falta modelar estados de disco.

Para dirección lógica lineal `v`:

```text
Exigir entero y 0 <= v < L
pageNumber = Math.floor(v / Q)
offset = v % Q
frameNumber = pageTable[pageNumber].frameNumber
physicalAddress = frameNumber * Q + offset
```

Ofrecer además entrada equivalente `(pageNumber, offset)`, validando enteros, `0 <= offset < Q` y `pageNumber * Q + offset < L`. Un selector de formato evita tratar ambos formularios como entradas contradictorias.

Verificar que la tabla y el marco corresponden a la instancia y que el marco no es del SO. La interfaz muestra página, desplazamiento, marco, base del marco y resultado. Puede mostrar `log2(Q)` bits de desplazamiento y `24 - log2(Q)` bits de marco físico; no confundir estos con una anchura lógica de CPU no definida.

El relleno final del proceso se contabiliza como fragmentación interna y se visualiza, pero el traductor lo rechaza como dirección lógica fuera del proceso. No simular un fallo por demanda para ese caso.

### 6.4 Liberación y métricas

Al terminar, liberar todos los marcos de la instancia y retirar su tabla y sus reservas. Las tablas y marcos de otras instancias no cambian; no compactar. Deshacer restaura exactamente los mismos números de marco y entradas.

Mostrar procesos residentes, páginas asignadas, marcos totales/del SO/libres/ocupados por usuario, memoria útil, memoria física asignada, relleno interno y utilización. En este modelo no hay fragmentación externa: marcar **No aplica** o **0 B**, sin usar el tamaño del mayor intervalo libre para decidir si cabe un proceso.

```text
RAM = bytesSO + bytesFisicosAsignadosAUsuarios + bytesLibres
bytesFisicosAsignadosAUsuarios = bytesUtilesResidentes + fragmentacionInterna
bytesLibres = marcosLibres * Q
```

Si se conserva el porcentaje actual de utilización útil: `bytesUtilesResidentes / bytesUsuario * 100`. Si se añade ocupación física: `bytesFisicosAsignadosAUsuarios / bytesUsuario * 100`. Etiquetarlos de forma distinta; no sustituir uno por otro sin cambiar el texto.

## 7. Arquitectura y contratos de integración

### 7.1 Representación del estado

Conservar el catálogo y las instancias en `state.programs` para limitar la refactorización. Para los nuevos modos, una instancia residente tiene `start = null`, `end = null`, `containerId = null`: no existe un único intervalo físico que represente su asignación. Las invariantes deberán interpretar esos campos según el modo.

Añadir campos serializables con estos contratos, documentados mediante JSDoc:

```js
// En config:
pageSizeBytes: number | null; // Solo significativo en PAGING.

// En cada instancia y, vacíos, en cada registro del catálogo:
segmentTable: SegmentDescriptor[];
pageTable: PageEntry[];

// En estado:
frames: Frame[]; // Vacío fuera de PAGING.

// Contratos mínimos:
// SegmentDescriptor: { segmentNumber, regionId, name, kind,
//                      base, limitBytes, permissions: { read, write, execute } }
// PageEntry: { pageNumber, frameNumber, usedBytes }
// Frame: { frameNumber, ownerKind: 'OS' | 'FREE' | 'PAGE',
//          programId: string | null, pageNumber: number | null }
```

`programId` en una asignación identifica la **instancia**, no la plantilla del catálogo. Tamaños y direcciones de marcos se derivan de número y `Q`; no persistir copias innecesarias que puedan divergir.

- En segmentación, los bloques físicos `SEGMENT` con `programId` y `regionId` son el mapa asignable; cada descriptor debe corresponder exactamente a uno. Crear y eliminar ambos dentro de la misma transacción y comprobar correspondencia bidireccional.
- En paginación, `frames` es el registro canónico de ocupación física; las tablas aportan el mapeo lógico de cada instancia. Proyectar `state.blocks` determinísticamente para mantener el contrato visual de cobertura de RAM, sin editar bloques y marcos por caminos independientes.
- La proyección paginada puede agrupar marcos libres consecutivos y todos los del SO. Los marcos de usuario deben ser inspeccionables individualmente como `PAGE` con página y propietario; no mostrarlos como un único bloque contiguo de proceso.
- `partitions` queda vacío en los modos nuevos. Añadir `BlockKind.SEGMENT` y `BlockKind.PAGE`; conservar los anteriores.
- Los modos actuales conservan su representación y semántica. Evitar que añadir tablas vacías active lógica de los modos nuevos por accidente.

### 7.2 Funciones sugeridas

Se pueden ajustar nombres y organización, respetando las responsabilidades:

| Archivo | Responsabilidad |
| --- | --- |
| `src/domain/process-regions.js` (nuevo) | Adaptar imagen y reservas a regiones ordenadas, sin DOM ni asignación física |
| `src/engine/segmentation.js` (nuevo) | Carga atómica por segmentos, tablas, trazas y liberación |
| `src/engine/paging.js` (nuevo) | Marcos, carga completa, tablas y liberación |
| `src/domain/translation.js` (nuevo) | Traducción pura segmentada y paginada, validaciones y resultados explicables |
| `src/domain/constants.js`, `models.js`, `errors.js` | Nuevos modos, tipos, configuración, permisos y códigos de error |
| `src/domain/invariants.js` | Despacho de invariantes por modo y validación cruzada de tablas/propiedad |
| `src/domain/metrics.js` | Contabilidad y etiquetas diferenciadas por método |
| `src/engine/simulator.js` | Despacho explícito de carga/terminación entre los seis modos |
| `src/engine/allocators.js`, `candidates.js` | Reutilizar selección por huecos; validar enum de algoritmo |
| `src/engine/comparison.js` | Comparación aislada de segmentación mediante instancias y trazas actuales |
| `src/state/commands.js`, `store.js` | Nuevos campos, comandos existentes, atomicidad y deshacer |
| `src/state/persistence.js` | Migración y validación del esquema ampliado |
| `src/ui/translation.js` (nuevo) | Formulario y presentación de la traducción, sin cálculo físico propio |
| `src/ui/memory-map.js`, `render.js`, `program-list.js` | Mapas, tablas y resúmenes sin presunción de un único intervalo por instancia |
| `src/ui/forms.js`, `events.js`, `elements.js`, `error-messages.js`, `dialogs.js` | Configuración, permisos, controles, errores y comparación |
| `index.html`, `styles/` | Estructura y presentación de nuevos controles, mapas y paneles |
| `tests/` | Casos de aceptación y regresión |
| `README.md`, `specs/functional-spec.md`, `specs/technical-spec.md` | Uso y especificaciones coherentes con la solución final |

El dominio y los motores no deben importar `document`, `window` ni componentes de interfaz. No reutilizar `allocateDynamic` por proceso completo como sustituto de un motor segmentado.

### 7.3 Comandos y resultados

Conservar `ALLOCATE_PROGRAM` como operación sobre una plantilla: crea una instancia, invoca el motor adecuado y avanza su contador solo tras el éxito. Conservar `TERMINATE_PROGRAM`, `RESET`, `START_SIMULATION`, `SELECT_BLOCK`, `SET_ALGORITHM`, restauración de programas y `UNDO`.

El resultado sigue el patrón existente `{ ok, state, code, details }`. Mantener `allocate(state, instanceId, algorithmOverride)` como fachada, con `trace` del intento. Para un fallo, propagar `trace` por `DomainError.details` hasta el resultado de comando. No contar inspecciones usando `lastTrace` de un intento anterior.

El traductor se invoca como consulta pura desde la interfaz; no crea una asignación, no consume números de ejecución y no ocupa una entrada de deshacer por cada consulta. Limpiar su selección o resultado si la instancia deja de existir o cambia el modo. Mostrar la nueva traza de un intento rechazado en el banner/panel a partir del resultado, conservando la atomicidad del estado de simulación.

La comparación de segmentación debe clonar el estado actual y ejecutar una nueva instancia de cada plantilla elegida, en orden de catálogo, para cada algoritmo. Usa el mismo flujo puro de comando que la aplicación. Etiquetar **Comparación desde el estado actual** y explicar que los residentes iniciales se mantienen en cada copia. No modificar la sesión activa, sus contadores ni su almacenamiento. Contar éxitos, rechazos e inspecciones reales de los intentos de esa copia. No afirmar que un algoritmo siempre es superior.

## 8. Invariantes obligatorias

Comprobarlas tras cada comando exitoso, al importar/reanudar y en pruebas. Validar los enums de modo, algoritmo, propietario y permisos; un valor desconocido no puede caer en una rama predeterminada de asignación.

### 8.1 Comunes

- Cobertura exacta de RAM por la proyección de bloques físicos, sin huecos no representados, solapamientos ni bloques de tamaño cero.
- Tamaños y límites enteros seguros en el rango permitido; SO al principio con tamaño configurado.
- IDs de plantillas e instancias únicos; ninguna asignación huérfana ni perteneciente a una instancia no residente.
- Tamaño de proceso igual a imagen más heap más pila; reservas runtime coherentes con instancia y configuración.
- Cada catálogo conserva tablas vacías y ninguna propiedad física nueva. Mantener compatibilidad explícita para residentes antiguos guardados directamente sobre un registro del catálogo.
- Los fallos de carga/terminación no publican cambios parciales y no consumen un paso de deshacer.
- Las instancias activas del mismo programa tienen asignaciones privadas; terminar una no libera la de otra.

### 8.2 Segmentación

- Cantidad de descriptores igual a regiones de tamaño positivo; numeración contigua desde 0 y `regionId` únicos por instancia.
- Correspondencia exacta entre descriptor y bloque físico: propietario, región, base, tamaño y rango.
- Suma de límites por instancia igual a `sizeBytes`; límites estrictamente positivos.
- Los bloques segmentados no tocan el SO ni se solapan entre instancias.
- Huecos adyacentes siempre fusionados.
- No hay `PAGE`, marcos ni tablas paginadas en ese estado.

### 8.3 Paginación

- Longitud de `frames` igual a `TOTAL_MEMORY_BYTES / Q`; números completos `0..frameCount-1`, sin repetidos ni faltantes.
- Los primeros `osFrameCount` marcos pertenecen al SO y solo ellos tienen `ownerKind = OS`.
- Un marco libre no tiene propietario ni página; un marco de usuario tiene ambos válidos.
- Cada página de cada residente tiene exactamente un marco y cada marco ocupado por usuario corresponde exactamente a una página de una instancia residente.
- Ninguna página duplicada, marco duplicado en tablas ni referencia a marco fuera del rango.
- `pageTable.length === ceil(sizeBytes / Q)`; páginas completas salvo la última; suma de `usedBytes` igual a `sizeBytes`.
- Proyección de bloques y registro de marcos coinciden; relleno interno no figura como memoria libre.
- No hay bloques `SEGMENT`, descriptores segmentados ni particiones en ese estado.

## 9. Interfaz y experiencia de uso

Extender el estilo crema y los componentes existentes. Usar español en los textos nuevos y preservar accesibilidad, diseño adaptable y navegación por teclado. No se necesita un rediseño general.

### 9.1 Configuración y listas

- Selector con seis modos, agrupados o etiquetados claramente. Al entrar a cada modo, mostrar solo los controles aplicables.
- Tamaño de página en paginación; tamaños de partición únicamente en modos estáticos; ajuste habilitado en segmentación y modos anteriores aplicables.
- Mostrar RAM, SO y capacidad de usuario antes de iniciar; en paginación, también cantidad de marcos.
- Catálogo siempre con **Ejecutar** y distribución de regiones. Lista de residentes con **Terminar**, ID y número de instancia.
- En los modos nuevos, sustituir el resumen `start — end` del proceso por cantidad de segmentos o páginas/marcos. No llamar a `toHexAddress(null)` ni mostrar `mínimo — máximo` como si todos los bytes intermedios pertenecieran al proceso.
- Mantener creación de programas personalizados con tamaños, reservas y permisos indicados en la sección 4.

### 9.2 Mapas y tablas

- Segmentación: mapa físico por segmentos/huecos, tabla de segmentos de la instancia seleccionada y selección coordinada por identidad. Identificar simultáneamente proceso y región, no solo color.
- Paginación: vista de marcos y tabla página/marco de la instancia seleccionada. Poder seleccionar una página en la tabla y localizar su marco físico, y viceversa.
- Mostrar el rango físico del marco y los bytes usados/relleno. La distribución lógica se consulta aparte; una página puede contener partes de varias regiones.
- Con 1 KiB hay 16.384 marcos. Evitar crear miles de tarjetas extensas o rehacerlas completas por cada selección. Usar agrupación de libres, cuadrícula compacta, filtros y paginación de tablas; un visor de rangos de hasta 256 marcos por vista es una opción suficiente. Permitir ir a cualquier número de marco y localizar la traducción fuera del rango actualmente visible.
- Mantener una representación global proporcional y direcciones numéricas exactas. Si se amplían bloques pequeños para seleccionarlos, etiquetar esa vista como detalle y conservar la referencia proporcional.
- No usar tamaño mínimo visual como si fuera tamaño físico real.

### 9.3 Traductor y trazas

- Selección de instancia residente.
- En segmentación: selector de segmento, desplazamiento decimal o hexadecimal y operación R/W/X.
- En paginación: elegir formato de dirección lógica lineal o par página/desplazamiento.
- Validar entradas completas con mensajes próximos al campo y resultado legible; destacar el segmento o marco correspondiente.
- Mostrar la fórmula con los operandos reales, no solo el resultado final.
- Mostrar error por instancia no residente, selector inexistente, límite o permiso; conservar controles para corregirlo.
- Mostrar traza del último intento de carga y motivo de rechazo, incluyendo el segmento que falló o marcos faltantes. No es obligatorio construir una bitácora histórica adicional.
- Los textos introducidos por el usuario se insertan con `textContent` o escape adecuado; nombres de programas y regiones no deben convertirse en HTML ejecutable.

## 10. Persistencia y compatibilidad

Subir `STATE_SCHEMA_VERSION` de 2 a **3** si sigue siendo la versión vigente al implementar. Conservar la clave `mms:simulation:v1` para encontrar sesiones existentes; no cambiarla para evitar la migración.

1. Aceptar explícitamente versiones 1, 2 y 3. Rechazar desconocidas y datos corruptos con información comprensible y opción de comenzar de nuevo; no sobrescribir una sesión incompatible silenciosamente al intentar leerla.
2. Mantener la migración existente de versión 1: particiones iguales por cantidad y separación de heap/stack desde segmentos antiguos.
3. Desde versión 2, añadir tablas/marcos vacíos y permisos por defecto donde falten, sin mover ni recalcular asignaciones de los cuatro modos originales.
4. Conservar orden y tamaños de particiones, remanente no particionado, tamaños de reservas runtime, direcciones residentes, IDs y contadores de ejecuciones consumidas.
5. En versión 3, validar tablas y marcos con sus invariantes antes de aceptar el estado. No ejecutar la normalización contigua de `start/end` sobre un residente de modo nuevo.
6. Exportar/importar el estado ampliado, aunque no se requiera añadir botones nuevos de importación/exportación a la interfaz. Verificar ida y vuelta por las funciones existentes.
7. El deshacer usa copias del estado completo: tablas, marcos, permisos y reservas deben entrar en esas copias. No se requiere guardar la pila de deshacer entre recargas.

## 11. Casos numéricos y pruebas de aceptación

Usar `node:test`, como el repositorio, sin incorporar un framework de pruebas. Los estados de prueba deben cubrir realmente 16 MiB e identificar sus procesos de relleno; no reducir la RAM del producto a unos pocos KiB para hacer pasar un ejemplo.

### 11.1 Casos comunes y de regresión

| ID | Escenario | Resultado exigido |
| --- | --- | --- |
| C01 | Inicio, mínimo y máximo físicos | 16.777.216 B; `0x000000`; `0xFFFFFF`; rechazar `0x1000000` como dirección física |
| C02 | Catálogo inicial | Cinco programas; tamaños exactos de la sección 4; total agregado 13.056 KiB = 12,75 MiB |
| C03 | Ejecutar dos veces el mismo programa en ambos modos nuevos | Dos instancias, regiones/tablas privadas y contador correcto |
| C04 | Terminar y deshacer | Liberación completa; restauración exacta de instancia y mapeos en un solo paso |
| C05 | Carga fallida | Estado y contador iguales a los anteriores; traza del intento disponible; sin paso adicional de deshacer |
| C06 | Reiniciar/cambiar de modo/cancelar | Sin tablas ni selección residuales; cancelar no modifica la sesión |
| C07 | Entradas inválidas | Rechazar tipos/enum/tamaños/direcciones inválidos; aceptar 0 solo donde corresponde |
| C08 | Regresión | Las 60 pruebas base siguen aprobadas; no reemplazarlas por aserciones más débiles |
| C09 | Exhaustividad de despacho | Recorrer todos los valores de `MemoryMode` contra `allocate()`, `terminate()`, `deriveMetrics()` y `assertState()`, con fixtures válidos y resultados propios de cada modo. `SEGMENTATION` y `PAGING` nunca deben usar por defecto las ramas de particiones estáticas o dinámicas. Un modo desconocido debe rechazarse explícitamente sin modificar el estado. |

**C09 se verifica en dos momentos.** Antes de entrar a la Fase 1, probar los cuatro modos vigentes y el rechazo explícito de un modo desconocido en las cuatro operaciones; mientras segmentación y paginación no tengan implementación, tampoco deben ejecutar rutas contiguas. Al integrar los motores nuevos, ampliar la misma prueba para cubrir los seis valores reales de `MemoryMode`. Usar `Object.values(MemoryMode)` y expectativas explícitas por modo: una futura séptima constante debe exigir un caso y una expectativa nuevos, no heredar una rama predeterminada. No limitar la prueba a «no lanza»: comprobar representación/asignación, liberación, contabilidad e invariantes que distingan cada método; incluir estados o solicitudes cuya interpretación contigua produzca un resultado distinto o inválido. Verificar también el rechazo de configuraciones y candidatos de modos desconocidos en los puntos adicionales de la sección 2.2.

### 11.2 Segmentación

**S01. Diferencias entre algoritmos.** Construir huecos separados de 1 MiB, 768 KiB y 2 MiB, en ese orden físico, y una región de 512 KiB. Primer ajuste elige el primero, mejor ajuste el segundo y peor ajuste el tercero. Añadir empates para comprobar menor dirección. Verificar candidatos e inspecciones reales, también en el rechazo.

**S02. Carga sin bloque contiguo para todo el proceso.** Con SO de 1 MiB, construir este mapa (intervalos en MiB con extremo final exclusivo): SO `[0,1)`, hueco `[1,3)`, otro proceso `[3,4)`, hueco `[4,6)`, otros residentes `[6,16)`. Cargar P4 por primer ajuste. Debe quedar:

| Región de P4 | Base (MiB) | Tamaño (MiB) |
| --- | ---: | ---: |
| Code | 1 | 1 |
| Data | 4 | 1,5 |
| Heap | 2 | 1 |
| Stack | 5,5 | 0,5 |

P4 ocupa 4 MiB en dos zonas separadas. No había hueco inicial de 4 MiB y aun así debe cargar. Los procesos de relleno deben tener asignaciones segmentadas válidas.

**S03. Fallo después de asignar tentativamente.** Construir dos huecos separados de 6 KiB y 4 KiB; toda la memoria restante, tras el SO, pertenece a residentes válidos. Programa de dos regiones, en orden, de 4 KiB y 6 KiB, heap/pila cero. Primer ajuste coloca tentativamente 4 en el hueco de 6 y luego falla. El estado público queda intacto. Mejor ajuste sobre el mismo estado inicial sí puede asignar ambas. Este caso evita exigir falsamente que una estrategia voraz encuentre toda combinación posible.

**S04. Traducción y límites.** Descriptor con base `0x100000`, límite 4096: desplazamiento 0 produce `0x100000`; 4095 produce `0x100FFF`; 4096 y -1 fallan. Selector inexistente falla aunque otra instancia tenga ese número de segmento.

**S05. Permisos.** Código `r-x`: leer/ejecutar válidos; escribir inválido. Datos `rw-`: leer/escribir válidos; ejecutar inválido. Comprobar permisos personalizados y conservación al reanudar.

**S06. Liberación y fragmentación.** Terminar una instancia con segmentos separados fusiona todos sus huecos vecinos sin mover otros residentes. Memoria interna perdida = 0. Verificar que el indicador no rechace por comparar el total del proceso con un solo hueco.

### 11.3 Paginación

**P01. Parámetros iniciales.** `Q = 4096`, SO = 1 MiB: 4096 marcos totales; 256 del SO; 3840 libres. Primer marco de usuario = 256, base `0x100000`. Último marco = 4095, rango `0xFFF000..0xFFFFFF`.

**P02. Relleno y traducción no contigua.** Con `L = 8193 B`, `Q = 4096 B`, disponer los marcos libres de menor número en 256, 260 y 300 (los intermedios están ocupados por otros residentes válidos). Deben asignarse páginas 0, 1 y 2 a esos marcos. Tamaño físico = 12.288 B; fragmentación interna = 4095 B. Resultados:

| Dirección lógica | Página | Offset | Marco | Dirección física |
| ---: | ---: | ---: | ---: | --- |
| 0 | 0 | 0 | 256 | `0x100000` |
| 4103 | 1 | 7 | 260 | `0x104007` |
| 8192 | 2 | 0 | 300 | `0x12C000` |

Dirección 8193 y par `(2,1)` deben fallar: corresponden al relleno. Offset igual a 4096 es inválido. Este caso demuestra que el motor no calcula la dirección como `baseDelProceso + direcciónLógica`.

**P03. Sin fragmentación externa.** Dejar suficientes marcos libres aislados y ningún intervalo continuo para el proceso completo. La carga debe funcionar. En cambio, con un marco menos del requerido debe fallar de manera atómica aunque ese conjunto libre forme un intervalo grande.

**P04. Límites de redondeo.** Tamaños de proceso 1, `Q-1`, `Q`, `Q+1`: páginas 1, 1, 1 y 2; rellenos `Q-1`, 1, 0 y `Q-1`. Crear imágenes válidas con reservas cero o distribuidas sin cambiar el total.

**P05. Regiones que cruzan páginas.** Programa: código 3000 B, datos 3000 B, heap 2193 B, pila 0. Total 8193 B, tres páginas, no cuatro ni suma de redondeos por región. Primera página contiene código y 1096 B de datos.

**P06. Cinco programas completos.** Con los valores predeterminados y páginas de 4 KiB, cargar los cinco: 3264 páginas de usuario, 0 B de relleno, 576 marcos libres y cinco instancias. Todos los tamaños predeterminados están alineados incluso para los tamaños de página ofrecidos: usar P02/P04/P05 para demostrar fragmentación; no alterar los programas para forzarla.

**P07. Configuración y aislamiento.** Probar todos los tamaños permitidos; rechazar tamaños ajenos a la lista y SO no alineado. Terminar una instancia no cambia marcos de otras. SO = 0 válido; SO >= RAM inválido. No asignar marcos del SO.

### 11.4 Persistencia, invariantes y presentación

- **I01:** ida y vuelta de los seis modos; nuevos mapeos y permisos idénticos tras reanudar; regresión de las migraciones antiguas.
- **I02:** rechazar JSON malformado, versiones desconocidas, IDs duplicados, marcos repetidos, tabla fuera de rango, propietarios huérfanos y bloques segmentados sin descriptor.
- **I03:** comparación segmentada no modifica estado activo; nuevas instancias por copia, contadores y trazas correctos; comparación paginada rechazada también en API.
- **I04:** secuencias deterministas de cargas, terminaciones, fallos y deshacer, con invariantes y contabilidad tras cada paso. Usar semilla fija si se generan operaciones.
- **U01:** seleccionar cada modo y completar configurar/iniciar/ejecutar/inspeccionar/traducir/terminar/deshacer/reiniciar.
- **U02:** mensajes y métricas correctos en éxito y error; sin direcciones ficticias de procesos no contiguos; controles de ajuste y comparación deshabilitados en paginación.
- **U03:** con páginas de 1 KiB, localizar e inspeccionar un marco alto y volver desde una traducción; interfaz utilizable sin miles de tarjetas extensas.
- **U04:** navegación con teclado, etiquetas, enfoque de diálogos, tabla accesible y vista estrecha sin controles inaccesibles; sin excepciones de consola durante los recorridos.

Agregar pruebas nuevas, por ejemplo: `segmentation.test.js`, `paging.test.js`, `translation.test.js`, `noncontiguous-invariants.test.js`, `noncontiguous-metrics.test.js` y casos en pruebas de persistencia, comandos e instancias. La separación exacta de archivos no forma parte del criterio de aprobación.

## 12. Secuencia de implementación

| Fase | Trabajo | Condición para avanzar |
| --- | --- | --- |
| 0 | Revisar instrucciones/cambios locales, ejecutar base, leer módulos afectados y eliminar los despachos implícitos señalados en 2.2 | Estado inicial identificado, sin trabajo ajeno sobrescrito; C09 en su etapa de cuatro modos y rechazo explícito aprobado antes de añadir los modos nuevos |
| 1 | Constantes, configuración, adaptador de regiones, permisos y formas de estado | Modelos válidos de los seis modos; pruebas de configuración; modos pendientes de motor rechazados explícitamente, sin rutas contiguas por defecto |
| 2 | Motor de segmentación, tabla, trazas, límites y permisos | S01-S06 aprobados, incluida reversión del fallo parcial |
| 3 | Motor de paginación, marcos, tablas y traductor | P01-P07 aprobados, incluida carga no contigua |
| 4 | Integrar los seis casos explícitos de despacho, comandos, invariantes, métricas, instancias y deshacer | C01-C09 e invariantes de operaciones aprobados; C09 ampliado a los seis modos |
| 5 | Persistencia/migración y comparación segmentada | I01-I03 aprobados; sesiones antiguas conservadas |
| 6 | Controles, mapas, tablas, trazas y traductor en interfaz | U01-U04 verificados en navegador |
| 7 | Documentación, regresión completa y revisión del cambio | Criterios finales completos y resultados reportados |

Los motores y sus cálculos deben quedar verificables sin navegador antes de conectarlos a la presentación. Evitar concentrar toda la lógica en renderizadores o en un único archivo. No hace falta delegación ni agentes paralelos para cumplir este plan; si se requiere autorización para cambiar el alcance, consultar al usuario mientras se continúa trabajo independiente autorizado.

## 13. Criterio final de entrega

El agente no debe declarar terminado el laboratorio solo porque se dibujan páginas o segmentos. Debe comprobar:

- Los seis modos existen y los cuatro anteriores conservan su comportamiento.
- C09 demuestra que carga, terminación, métricas e invariantes usan el caso explícito de cada modo, y que un modo desconocido falla sin modificar el estado; ningún modo nuevo hereda una ruta contigua por defecto.
- La segmentación usa asignación física por región, no un bloque de proceso disfrazado.
- La paginación usa tabla y marcos realmente no contiguos cuando corresponde.
- Los cinco programas y las ejecuciones múltiples están disponibles y consumen memoria privada correcta.
- Traducciones válidas y errores de límites/permisos están verificados con valores conocidos.
- Las identidades de conservación de RAM se cumplen en éxito, fallo, terminación, deshacer y recarga.
- No se pierden sesiones previas ni cambios locales del usuario.
- La suite completa pasa y los recorridos de navegador se comprobaron. Si una comprobación no se pudo ejecutar, informar exactamente cuál y por qué; no presentarla como aprobada.
- `README.md` explica cómo iniciar, elegir los nuevos modos, interpretar los mapas y ejecutar las pruebas.
- Las dos especificaciones existentes reflejan seis modos, el esquema vigente y las simplificaciones de esta solución, eliminando prohibiciones y reglas contradictorias. No añadir referencias ficticias como `[cite:77]`.
- No se redactó informe final ni sustentación, ni se añadieron funciones excluidas por D4.

Ejecutar desde la raíz `npm test` (equivalente actual: `node --test "tests/*.test.js"`). Para probar en navegador, servir el proyecto por HTTP local con el procedimiento del README (`python -m http.server 8000` o equivalente disponible) y abrir `http://localhost:8000`. No instalar dependencias de aplicación si no hay una necesidad demostrada. Al entregar, resumir qué cambió, pruebas realmente ejecutadas y cualquier limitación material restante, con enlaces a archivos relevantes.

## 14. Fuentes y trazabilidad académica

### Material de clase revisado

- **Archivo:** `C:\Users\asus\Downloads\3 - Memoria - Gestión de la memoria.pdf`, 37 páginas; numeración física del PDF desde 1.
- Páginas 2 y 16: gestión, contabilidad, protección y organización de memoria en multiprogramación.
- Páginas 20-23: huecos, particiones dinámicas, compactación y algoritmos de ajuste.
- Páginas 26-27: direcciones lógicas/físicas y MMU.
- Páginas 28-29: segmentación y tabla de segmentos; base principal del modelo segmentado.
- Página 30: ejemplos visuales de errores de acceso; no contiene un algoritmo adicional.
- Páginas 31-32 y 34: páginas, marcos, tablas, traducción y no aplicabilidad de ajustes entre marcos iguales.
- Páginas 33 y 35-37: TLB, hiperpaginación, multinivel y sistema combinado; contexto académico que no amplía el alcance validado.

### Fuentes primarias complementarias consultadas

Remzi H. Arpaci-Dusseau y Andrea C. Arpaci-Dusseau, *Operating Systems: Three Easy Pieces*, University of Wisconsin-Madison:

- [Capítulo 16: Segmentation](https://pages.cs.wisc.edu/~remzi/OSTEP/vm-segmentation.pdf): contraste de asignación independiente y protección por segmento.
- [Capítulo 17: Free-Space Management](https://pages.cs.wisc.edu/~remzi/OSTEP/vm-freespace.pdf): contraste de huecos variables, división/fusión y elección de candidatos.
- [Capítulo 18: Paging: Introduction](https://pages.cs.wisc.edu/~remzi/OSTEP/vm-paging.pdf): contraste de páginas, marcos, tablas por proceso y traducción conservando desplazamiento.

Las fórmulas y fixtures de este plan se concretaron para los 16 MiB y las decisiones confirmadas del laboratorio. Los permisos predeterminados, la asignación de marcos ascendente, la carga atómica, el tratamiento del relleno y la representación de metadatos son convenciones explícitas de esta solución; no se presentan como una reproducción completa de un sistema operativo real.
