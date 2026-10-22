# Resultados de pruebas manuales del simulador

Fecha: 21 de octubre de 2026.

Entorno de las pruebas 1 a 12: aplicación en `http://localhost:8000/`, navegador integrado de Codex.
Las acciones de esas pruebas se realizaron mediante los controles de la interfaz. Los resultados
se comprobaron en el mapa, tablas, traductor, avisos y métricas visibles, sin
invocar directamente el motor ni modificar el estado interno de la aplicación.

Resultado: se documentan 22 casos con resultado correcto: 12 comprobados directamente
en el navegador y 10 adicionales aportados por el usuario, quien confirmó que
todos salieron bien. Algunas comprobaciones se complementan o se repiten entre
ambas series. Las pruebas 13 a 22 conservan la numeración de la serie aportada
entre paréntesis y distinguen su procedencia; no se repitieron al actualizar este documento.

En los 12 escenarios comprobados directamente, los rechazos descritos
son respuestas esperadas a operaciones inválidas, no fallos de la aplicación.
No aparecieron errores de consola. No se modificó el código durante esta ronda.

## 1. Límite de un segmento

**Posible fallo:** aceptar un desplazamiento igual al límite del segmento.

En segmentación, cargar Compilador, seleccionar Code y operación READ. Su límite
es 786432 B. El desplazamiento 786431 se tradujo a `0x1BFFFF`; el desplazamiento
786432 se rechazó con `INVALID_LOGICAL_ADDRESS` y el mensaje de desplazamiento
fuera de límite.

**Resultado: correcto.** El límite representa la cantidad de bytes, no el último
desplazamiento permitido.

## 2. Permisos de acceso

**Posible fallo:** permitir escribir en Code o ejecutar Data sin permiso.

WRITE sobre Code y EXECUTE sobre Data devolvieron `ACCESS_DENIED`. READ sobre
Data sí funcionó y tradujo su desplazamiento 0 a `0x1C0000`.

**Resultado: correcto.**

## 3. Carga segmentada atómica

**Posible fallo:** dejar el primer segmento residente cuando no cabe el segundo.

Con SO de 1 MiB, crear programas sin heap ni stack con una región de 6 KiB,
1 KiB, 4 KiB y 15349 KiB, respectivamente. Cargarlos en ese orden y terminar
los de 6 y 4 KiB. Quedan dos huecos de esos tamaños, separados por el programa
de 1 KiB. Crear otro programa con Code de 4 KiB y Data de 6 KiB.

Primer ajuste intentó Code en el hueco de 6 KiB y no pudo colocar Data. La traza
registró 3 inspecciones. Tras el rechazo, mapa y ejecuciones coincidieron con
los anteriores al intento; continuaron libres los 10 KiB.

Cambiar a Mejor ajuste permitió cargar la primera ejecución del programa:
Code quedó en `0x101C00`, con 4096 B, y Data en `0x100000`, con 6144 B.

**Resultado: correcto.** El fallo no dejó asignación parcial ni consumió un
número de ejecución.

## 4. Tablas privadas por instancia

**Posible fallo:** usar la tabla de otra ejecución del mismo programa.

Cargar dos instancias del Compilador en segmentación. El desplazamiento 0 de
Code se tradujo a `0x100000` para la primera y a `0x300000` para la segunda,
al cambiar la instancia en el selector del traductor.

**Resultado: correcto.**

## 5. Relleno y páginas inexistentes

**Posible fallo:** traducir bytes que pertenecen al relleno del último marco.

En paginación de 4096 B, cargar un programa de 8193 B sin heap ni stack. La
dirección lógica 8192 se tradujo a `0x102000`, página 2, marco 258. La dirección
8193 y el par página 2/desplazamiento 1 se rechazaron con
`INVALID_LOGICAL_ADDRESS`. También se rechazó la página 3, que no existe.

**Resultado: correcto.**

## 6. Entradas malformadas

**Posible fallo:** aceptar parcialmente una dirección o interpretar formatos no
admitidos.

El traductor rechazó la entrada vacía, `12abc`, `1.5`, `-1`, `0xGG` y `1e3`.
Todas mostraron el mensaje que solicita un entero decimal o hexadecimal
completo, sin signo. `0x7` sí se tradujo a `0x100007`.

**Resultado: correcto.**

## 7. Liberación aislada

**Posible fallo:** terminar una ejecución y liberar o mover la memoria de otra.

Con dos instancias del Compilador en segmentación, terminar la primera. Solo
permaneció la segunda; su Code siguió en `0x300000` y pudo traducirse.

**Resultado: correcto.**

## 8. Deshacer conserva las correspondencias

**Posible fallo:** recuperar procesos sin sus tablas, regiones o marcos.

En segmentación, deshacer la terminación recuperó las dos instancias y el texto
completo del mapa coincidió con el anterior a la terminación. La tabla volvió
a mostrar las bases originales.

En paginación, terminar el programa de 8193 B vació su tabla y el resultado de
traducción. Deshacer recuperó la misma instancia, exactamente la misma tabla
de páginas y la misma cantidad de memoria libre.

**Resultado: correcto en ambos modos.**

## 9. Cancelar cambios de configuración

**Posible fallo:** reiniciar la simulación aunque se cancele la confirmación.

Con dos procesos segmentados, intentar cambiar a paginación y cancelar. El modo
siguió siendo segmentación, los dos procesos permanecieron y el mapa no cambió.

Con el programa paginado de 8193 B, intentar cambiar de 4096 a 1024 B por página
y cancelar. El selector volvió a 4096 y la tabla de páginas permaneció igual.

**Resultado: correcto en ambos casos.**

## 10. Eliminar del catálogo y recargar

**Posible fallo:** eliminar programas activos o recuperar automáticamente uno
que se eliminó deliberadamente.

El botón Eliminar del programa paginado activo estaba deshabilitado. Eliminar
Compilador, que no tenía ejecuciones activas, y recargar: Compilador siguió
ausente; la ejecución paginada y su tabla permanecieron iguales.

Tras terminar el programa paginado, su botón Eliminar se habilitó y se pudo
quitar del catálogo. El botón Predeterminados permitió recuperar el catálogo
básico para continuar las pruebas.

**Resultado: correcto.**

## 11. Orden descendente y algoritmos

**Posible fallo:** conservar el orden escrito, perder tamaños repetidos o elegir
particiones incorrectas después de ordenar.

Con SO de 2 MiB, introducir `4, 2, 1, 3, 4` y aplicar. El mapa mostró
`4, 4, 3, 2, 1 MiB`, desde `0x200000` hasta `0xFFFFFF`.

Cargar Compilador, de 2 MiB, y terminarlo entre cada política:

| Política | Dirección inicial elegida | Fragmentación interna |
| --- | --- | --- |
| Primer ajuste | `0x200000` (partición de 4 MiB) | 2 MiB |
| Mejor ajuste | `0xD00000` (partición de 2 MiB) | 0 B |
| Peor ajuste | `0x200000` (primera partición de 4 MiB) | 2 MiB |

**Resultado: correcto**, incluido el desempate por menor dirección física.

## 12. Remanente de particiones iguales

**Posible fallo:** usar el remanente como una partición adicional.

Con SO de 1 MiB y particiones iguales de 4 MiB, se crearon tres particiones y
un remanente no asignable de 3 MiB, entre `0xD00000` y `0xFFFFFF`.

Cargar tres instancias del Compilador y después intentar cargar Editor. Se
rechazó por ausencia de particiones libres, aunque Editor cabría en los 3 MiB
del remanente. Continuaron las tres ejecuciones anteriores, el mapa no cambió
y la memoria libre asignable se mantuvo en 0 B.

**Resultado: correcto.**

## Pruebas adicionales aportadas por el usuario

Procedencia: serie de diez pruebas del archivo adjunto `Texto pegado.txt`.
El usuario confirmó que todas se realizaron y salieron bien. Los resultados de
esta sección se registran con esa procedencia; los valores ilustrativos son
cálculos de referencia salvo cuando se indica una comprobación anterior en navegador.

## 13. Distribución inicial de las regiones de P4 (aportada 1)

**Procedimiento:** seleccionar Segmentación, reiniciar con memoria de usuario
libre y cargar P4, Base de datos. Sus regiones son Code de 1024 KiB, Data de
1536 KiB, Heap de 1024 KiB y Stack de 512 KiB.

**Comportamiento confirmado por el usuario:** las cuatro regiones quedan
consecutivas después del SO, en el orden Code, Data, Heap y Stack, sin huecos
intermedios.

**Resultado reportado: correcto.** Una carga segmentada puede ocupar regiones
consecutivas cuando hay un único hueco adecuado; esto no convierte la contigüidad
entre segmentos en un requisito del modelo.

## 14. Fragmentación externa por tamaño de un segmento (aportada 2)

**Procedimiento:** con memoria limpia, cargar P4 y después P2, Navegador, de
3072 KiB. Terminar P4 e intentar cargar un programa con un segmento que no
quepa en ninguno de los huecos, aunque la memoria libre total sea suficiente.

**Comportamiento confirmado por el usuario:** la carga se rechaza por
fragmentación externa.

**Resultado reportado: correcto.** La capacidad se necesita por segmento, no
como un único intervalo para todo el programa.

**Precisión para repetirla:** no basta con superar el hueco dejado por P4; el
segmento debe superar también cualquier otro hueco libre. Con SO de 1 MiB,
P4 de 4 MiB y P2 de 3 MiB, al terminar P4 quedan huecos de 4 y 8 MiB. Un
segmento de 9 MiB permite provocar el rechazo, siempre que la solicitud total
del nuevo programa no supere los 12 MiB libres.

## 15. Primer ajuste frente a Mejor ajuste (aportada 3)

**Procedimiento:** dejar dos huecos de 6 y 4 KiB y solicitar, en ese orden,
regiones de 4 y 6 KiB. Comparar las dos políticas desde la misma distribución.

**Comportamiento confirmado por el usuario:** Primer ajuste usa parte del hueco
de 6 KiB para la región de 4 KiB y luego no puede colocar la de 6 KiB. Mejor
ajuste usa el hueco exacto de 4 KiB y conserva el de 6 KiB para la segunda región.

**Resultado reportado: correcto.** También se comprobó directamente en la
prueba 3, incluyendo la ausencia de asignación parcial tras el fallo.

## 16. Fusión de huecos vecinos al liberar (aportada 4)

**Procedimiento:** dejar dos huecos separados por un segmento ocupado y
terminar el programa que ocupa el espacio intermedio.

**Comportamiento confirmado por el usuario:** ambos huecos y la región recién
liberada se fusionan en un solo hueco grande.

**Resultado reportado: correcto.** Fusionar espacios libres adyacentes no
requiere mover los segmentos de otros procesos ni ejecutar compactación.

## 17. Fragmentación interna en segmentación (aportada 5)

**Procedimiento:** cargar un programa predeterminado en Segmentación y revisar
el espacio que ocupa cada región respecto del tamaño solicitado.

**Comportamiento confirmado por el usuario:** cada segmento ocupa exactamente
su tamaño solicitado, sin relleno interno.

**Resultado reportado: correcto.** En este modelo, la fragmentación interna
segmentada es exactamente 0 B. En la ronda anterior de navegador, Compilador
también presentó 0 B, con intervalos físicos del tamaño de sus cuatro regiones.

## 18. Traducción paginada calculada a mano (aportada 6)

**Procedimiento:** seleccionar Paginación, páginas de 4096 B y SO de 1 MiB.
Cargar el primer programa y comparar la traducción de su dirección lógica 7
con el cálculo basado en el marco de su página 0.

**Comportamiento confirmado por el usuario:** la traducción coincide con
`dirección física = marco × 4096 + desplazamiento`.

**Resultado reportado: correcto.** La ronda anterior de navegador mostró
el marco 256 para la página 0 y `256 × 4096 + 7 = 1048583 = 0x100007`.
Como referencia adicional, el desplazamiento 7 de una página situada en el
marco 260 corresponde a `0x104007`.

La dirección lógica se traduce mediante la tabla; no debe interpretarse como
una dirección física directa, aunque ambos valores pueden coincidir en alguna
configuración particular.

## 19. Carga con marcos libres dispersos (aportada 7)

**Procedimiento:** en Paginación, cargar varios programas, terminar uno
intermedio e intentar cargar otro mayor que el espacio continuo liberado,
pero con suficientes marcos libres en total.

**Comportamiento confirmado por el usuario:** la carga tiene éxito usando
marcos separados y no produce un rechazo por fragmentación externa.

**Resultado reportado: correcto.** En la ronda anterior de navegador, tras
cargar Compilador, Navegador y Editor y terminar Navegador, Base de datos
de 4 MiB reutilizó el hueco de 3 MiB y marcos adicionales. Su página 0 quedó
en el marco 768 y su página 768 en el marco 1856.

## 20. Relleno de la última página (aportada 8)

**Procedimiento:** con páginas de 4096 B, cargar un programa de 8193 B totales,
sin heap ni stack, y revisar su tabla y fragmentación interna.

**Comportamiento confirmado por el usuario:** se reservan tres páginas,
equivalentes a 12288 B físicos. Solo se utilizan 8193 B y quedan 4095 B de
relleno en la última página, que contiene un único byte útil.

**Resultado reportado: correcto.** Estos mismos valores se observaron en la
ronda anterior de navegador.

**Precisión conceptual:** paginación puede tener relleno cero si el tamaño total
es múltiplo exacto del tamaño de página. No siempre desperdicia memoria interna.

## 21. Efecto del tamaño de página (aportada 9)

**Procedimiento:** repetir la carga del programa de 8193 B con páginas de
1 KiB, 4 KiB y 64 KiB.

**Comportamiento confirmado por el usuario:** las páginas pequeñas requieren
más entradas de tabla y reducen el relleno en este ejemplo; las grandes
requieren menos entradas y producen más relleno.

| Tamaño de página | Páginas del proceso | Memoria física reservada | Relleno |
| --- | --- | --- | --- |
| 1024 B | 9 | 9216 B | 1023 B |
| 4096 B | 3 | 12288 B | 4095 B |
| 65536 B | 1 | 65536 B | 57343 B |

**Resultado reportado: correcto.** La ronda anterior de navegador confirmó los
tres resultados de la tabla. El simulador representa las tablas como metadatos;
no descuenta de la RAM su coste de almacenamiento.

## 22. Agotamiento de marcos de usuario (aportada 10)

**Procedimiento:** en Paginación, cargar programas hasta agotar los marcos de
usuario e intentar iniciar una ejecución adicional.

**Comportamiento confirmado por el usuario:** se rechaza por marcos insuficientes,
sin clasificar el problema como fragmentación externa.

**Resultado reportado: correcto.** En la ronda anterior de navegador, con
SO de 1 MiB y páginas de 4096 B, se ocuparon los 3840 marcos de usuario con
siete ejecuciones. La carga adicional de Editor mostró: «Se requieren 320
marcos y hay 0 libres». Permanecieron las siete ejecuciones anteriores.
