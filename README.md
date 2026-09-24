# Simulador de memoria multiprogramada

Aplicación web educativa para visualizar la asignación contigua de memoria y comparar algoritmos de ubicación de procesos. Se ejecuta en el navegador y no necesita frameworks ni dependencias externas.

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
- Modos de particiones estáticas iguales o desiguales y particiones dinámicas con o sin compactación.
- Algoritmos de asignación First Fit, Best Fit y Worst Fit cuando corresponden.
- Asignación y terminación de programas predeterminados o personalizados.
- Visualización del mapa de memoria, métricas, direcciones y segmentos de cada proceso.
- Compactación automática ante fragmentación externa en el modo dinámico con compactación.
- Comparación de algoritmos y persistencia de la sesión en el navegador.

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
