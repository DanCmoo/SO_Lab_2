# Simulador de memoria multiprogramada

Aplicación web educativa para visualizar particiones contiguas, segmentación y paginación, traducir direcciones y comparar algoritmos de ubicación cuando corresponden. Se ejecuta en el navegador y no necesita frameworks ni dependencias externas.

## Integrantes

| Nombre | Código |
| --- | --- |
| Daniel Camacho | 20231020046 |
| Alejandro Orjuela | 20231020049 |
| Giovanni Vargas | 20231020036 |

## Requisitos

- Python 3 para iniciar el servidor web local.
- Un navegador moderno (Chrome, Firefox, Edge o Safari).
- Node.js y npm solo si se quieren ejecutar las pruebas automatizadas.

## Cómo ejecutar

Abre una terminal en la carpeta raíz del proyecto, donde están `index.html` y `package.json`, e inicia el servidor estático de Python:

```bash
python -m http.server 8000
```

En Windows, si el comando `python` no está disponible, prueba:

```powershell
py -m http.server 8000
```

Abre [http://localhost:8000](http://localhost:8000) en el navegador. Para detener el servidor, vuelve a la terminal y presiona `Ctrl+C`.

La aplicación guarda el estado de la simulación en el almacenamiento local del navegador. Si al abrirla ofrece reanudar una sesión anterior, elige **Empezar de nuevo** para comenzar desde el estado inicial.

## Funcionalidades principales

- Memoria física simulada de 16 MiB, con direcciones de 24 bits.
- Reserva configurable para el sistema operativo.
- Modos de particiones estáticas iguales o desiguales y particiones dinámicas con o sin compactación. Las particiones iguales se configuran por tamaño (B, KiB o MiB); la cantidad se calcula automáticamente y cualquier remanente se muestra como memoria sin particionar, no asignable.
- Algoritmos de asignación First Fit, Best Fit y Worst Fit cuando corresponden.
- Asignación y terminación de programas predeterminados o personalizados.
- El catálogo permite eliminar programas predeterminados y personalizados sin ejecuciones activas. Deshacer recupera el programa; la eliminación se conserva al reanudar o reiniciar. El botón Predeterminados recupera los cinco programas básicos.
- El catálogo de **Programas disponibles** conserva el botón **Ejecutar**. Cada clic crea una instancia nueva (`#1`, `#2`, `#3`, etc.) mientras haya memoria disponible. **Ejecuciones activas** muestra esas instancias con su botón **Terminar**; al terminar salen del listado y liberan su memoria. La numeración continúa sin reutilizar ejecuciones terminadas, también al reanudar la sesión.
- Visualización del mapa de memoria, métricas, direcciones, imagen del programa y reservas de ejecución de cada proceso.
- Heap y stack se solicitan al SO por separado de la imagen del programa. El SO reserva esas regiones al asignar cada proceso y las libera al terminarlo; cuentan como memoria del proceso, sin consumir la reserva del núcleo. Los tamaños permanecen fijos durante la ejecución en este modelo contiguo: no se simulan paginación, demanda de páginas ni llamadas a malloc/free.
- Compactación automática al terminar un proceso en el modo dinámico con compactación. Los procesos restantes conservan su orden y la memoria libre queda en un único hueco final. Añadir o asignar programas no compacta.
- Al construir un mapa de particiones estáticas desiguales, los tamaños se ordenan de mayor a menor después del SO, independientemente del orden ingresado. Reanudar una sesión conserva su distribución guardada; aplicar una nueva configuración o reiniciar construye el mapa con orden descendente.
- Comparación de algoritmos y persistencia de la sesión en el navegador.
- Las sesiones de la versión anterior se convierten al modelo actual al reanudarlas, conservando direcciones, tamaños y orden de las particiones.

## Segmentación y paginación

El selector incluye seis modos. **Segmentación** asigna Code, Data y las reservas de Heap y Stack independientemente; cada instancia tiene una tabla de segmentos con base física, límite en bytes y permisos R/W/X. El traductor acepta segmento, desplazamiento decimal o hexadecimal y operación. El desplazamiento válido es menor que el límite. No se compactan segmentos ni se simula crecimiento de la pila.

**Paginación** carga el proceso completo en los marcos libres de menor número, aunque estén separados. El tamaño inicial es 4 KiB; se ofrecen 1, 2, 4, 8, 16 y 64 KiB. La reserva del SO debe ser múltiplo del tamaño de página. Con la configuración inicial hay 4096 marcos: 256 del SO y 3840 de usuario. Los ajustes no aplican, por lo que algoritmo y comparación quedan deshabilitados.

En **Tablas y traducción de direcciones**, selecciona una instancia. Puedes localizar su segmento/marco desde la tabla o introducir una dirección lógica lineal, o un par página/desplazamiento. El resultado muestra la fórmula y resalta la asignación física. El relleno de la última página se cuenta como fragmentación interna y no es una dirección lógica válida. Los errores no terminan procesos ni consumen deshacer.

El tamaño de página actualiza el mapa durante la configuración. Las reservas del SO conservan la unidad elegida y se advierte si no están alineadas al tamaño de página. El inspector de marcos muestra propietario, página lógica, bytes útiles, relleno y las regiones que intersectan la página. La cuadrícula identifica cada instancia y utiliza los colores del catálogo; **Ver** prepara también la dirección lineal de la página. Los mensajes de búsqueda de marcos aparecen junto al control de búsqueda.

El mapa paginado muestra hasta 256 marcos por vista y las tablas hasta 64 filas. Usa **Ir al marco**, los controles de navegación o **Ver** en una fila para localizar cualquier marco, incluso con páginas de 1 KiB. El carril global mantiene la escala proporcional. Las instancias no contiguas muestran cantidades de segmentos/páginas, sin inventar un rango físico único.

**Deshacer** restaura la instancia y sus tablas/marcos en una sola operación. Cambiar de modo o aplicar una configuración durante la ejecución requiere confirmar reinicio; cancelar conserva la sesión. La persistencia usa esquema 3 y migra versiones 1 y 2 con la misma clave de almacenamiento. Una sesión incompatible se conserva hasta que elijas empezar de nuevo.

Simplificaciones: carga completa, tabla de páginas de un nivel, tamaños fijos y una referencia de un byte por traducción. Las tablas son metadatos sin bytes físicos adicionales. Se excluyen TLB, demanda, reemplazo, memoria compartida, CPU y disco. No se genera informe final ni sustentación.

## Cómo está organizado el proyecto

```text
SO_Lab_2/
├── index.html                  # Página principal y estructura de la interfaz
├── package.json                # Metadatos y comando de pruebas de Node.js
├── README.md                   # Documentación del proyecto
├── specs/
│   ├── functional-spec.md      # Requisitos y comportamiento funcional
│   └── technical-spec.md       # Arquitectura y especificación técnica
├── src/
│   ├── app.js                  # Inicializa el estado, la interfaz y los eventos
│   ├── data/
│   │   └── default-programs.js # Definición de programas predeterminados
│   ├── domain/                 # Modelos, constantes, direcciones, métricas y reglas
│   ├── engine/                 # Asignadores, modos de memoria y compactación
│   ├── state/                  # Estado de la simulación, comandos y persistencia
│   └── ui/                     # Renderizado, formularios, eventos, diálogos y accesibilidad
├── styles/
│   ├── tokens.css              # Colores, tipografía, radios y espaciado
│   ├── base.css                # Estilos base y controles
│   ├── layout.css              # Distribución de paneles
│   └── components.css          # Componentes de la interfaz y mapa de memoria
└── tests/                      # Pruebas automatizadas del dominio y del motor
```

### Responsabilidad de las carpetas

- **`src/domain/`** contiene los conceptos fundamentales de la simulación y sus validaciones. Esta lógica no depende de la interfaz.
- **`src/engine/`** implementa la asignación, liberación, compactación y comparación de algoritmos.
- **`src/state/`** procesa comandos sobre el estado de la simulación y guarda o recupera sesiones del navegador.
- **`src/ui/`** conecta las acciones de la persona usuaria con el estado y actualiza la página.
- **`src/data/`** define los programas iniciales disponibles en la cola.
- **`styles/`** separa los tokens visuales, los estilos globales, el layout y los componentes.
- **`tests/`** verifica reglas como direcciones, asignadores, modos estáticos y dinámicos, compactación, métricas e invariantes.

## Ejecutar las pruebas

Desde la raíz del proyecto, con Node.js instalado, ejecuta:

```bash
npm test
```

Este comando usa el ejecutor de pruebas integrado de Node.js (`node --test`) y no requiere instalar paquetes del proyecto.
