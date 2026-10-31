<!-- source: README.md sha256:7a71e523a772 · machine -->
[English](README.md) · [Русский](README.ru.md) · [Беларуская](README.be.md) · [Українська](README.uk.md) · [Қазақша](README.kk.md) · [Polski](README.pl.md) · [Deutsch](README.de.md) · **Español** · [Português](README.pt.md) · [Français](README.fr.md) · [Nederlands](README.nl.md) · [Română](README.ro.md)

> Esta página es una traducción automática del README en inglés, que es el texto que hace fe. Las correcciones son bienvenidas a través del formulario [Traducción de la documentación](https://github.com/Dopetast1c/Marksy/issues/new?template=docs-translation.yml).

# Marksy

**El curso escolar de la familia, en un solo lugar tranquilo y claro.**

Marksy es una app familiar para las notas del colegio, de código disponible y gratuita para uso personal y cualquier otro uso no comercial. Se conecta a la agenda escolar electrónica que ya usa tu centro, lee las notas, el horario y los deberes a través de la propia API de la agenda y construye encima una capa más completa: medias y tendencias de cada asignatura y periodo, el historial completo de cada nota, un plan para los próximos días, un temporizador de estudio, notificaciones y un acceso propio para cada madre o padre y cada estudiante. Funciona en tu propio ordenador, se instala como app en cualquier teléfono y habla doce idiomas.

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)
![PWA](https://img.shields.io/badge/app-PWA-5a0fc8.svg)
![Self-hosted](https://img.shields.io/badge/data-self--hosted-2f7a4a.svg)

> **Estado: 1.0, la primera versión.** Las notas, las notas finales, las asignaturas, el horario con los deberes, la familia y la apariencia de la app funcionan y se usan a diario, en casa, en un ordenador que se actualiza solo. Las etiquetas, el tiempo de estudio, la app instalable con modo sin conexión y las notificaciones vienen después, en este orden ([`docs/build-plan.md`](docs/build-plan.md)). Las secciones siguientes describen el producto completo.

## La idea

La agenda escolar es la fuente de verdad: el profesorado anota allí cada día notas, temas, deberes y el horario, y la agenda los pone a disposición a través de su API. Son muchos datos valiosos, y buena parte de su valor aparece con el tiempo y al mirar varias asignaturas a la vez: cómo va una asignatura este periodo, qué ha cambiado desde ayer, qué examen hay el martes, si esta semana ha ido mejor que la anterior.

Marksy toma esos datos y construye sobre ellos para la familia:

- **Recuerda.** Cada nota se guarda con todo su historial, así que la familia no solo ve dónde están las cosas, sino cómo se ha llegado hasta ahí, incluidas las notas que se corrigieron más tarde.
- **Resume.** Medias por asignatura para una semana, un mes, un periodo o un año, comparadas con el intervalo anterior, con la distribución de las notas y una tendencia.
- **Se adelanta.** Las clases de mañana con sus deberes, los próximos exámenes y lo que hay que aprender de memoria, destacados con días de antelación.
- **Une a la familia.** Una sola cuenta de la agenda sirve a toda la familia; cada madre o padre y cada estudiante tiene su propio acceso, sus propias notificaciones y su propia vista.
- **Viaja.** El sistema de agenda es un complemento. Todo lo demás, cada pantalla y cada número, es común, así que un país, una región o un colegio nuevo obtiene la app entera añadiendo un pequeño proveedor.

## Lo que ofrece

### Inicio

El día de un vistazo. Dos números para el periodo elegido, la media y la cantidad de notas, cada uno con su valor en el periodo anterior. Después, las notas de hoy, el tiempo de estudio, el bloque **Atención** (las pocas cosas que merecen una mirada ahora mismo: una nota baja, un examen cercano, una media que baja, algo que llevar mañana) y las clases de mañana con sus deberes. Debajo, las estadísticas: notas por nivel, la distribución por valor y una tendencia por semana, mes, periodo o año.

Cada pantalla con números tiene el mismo control de periodo: elige una semana, un mes, un periodo o un año y vuelve a cualquiera anterior con flechas, deslizando el dedo o desde una lista.

### Notas

Todas las notas en un solo listado, agrupadas por día, con la asignatura, el tipo de trabajo, el tema de la clase y el comentario docente. Filtra por etiquetas como «Examen» o «Poesía», una o varias a la vez. A un toque están las **notas finales**: una tabla con los resultados por periodo y por año de cada asignatura, donde un periodo que aún no ha terminado muestra su media actual, para que una tendencia nunca se confunda con un resultado final.

### Asignaturas

Todas las asignaturas de cada estudiante, siempre: su media en el periodo, hacia dónde se mueve, cuál era antes y las últimas notas. Ordena alfabéticamente, de la más floja a la más fuerte o al revés, o por la mayor subida o bajada. En los cursos en los que todavía no se ponen notas, la misma lista muestra en su lugar las clases, los deberes y el tiempo de estudio.

### Una asignatura de cerca

Cada asignatura tiene su propia página, teñida con su color: el objetivo del periodo («para un 8 necesitas dos 9 o un 10»), lo que merece atención, estadísticas y tendencia, cada nota con su comentario, las próximas clases, los resultados periodo a periodo y el tiempo de estudio.

### Horario y deberes

Un día o una semana entera, hacia atrás y hacia delante, una fila por clase con la hora, el aula, el tema, los deberes y la nota de esa clase; antes de una clase, la media de la asignatura y las últimas notas justo debajo. Las clases que se han preparado reciben una marca de **listo** que ve toda la familia. Las familias pueden añadir deberes propios y marcar una clase como cancelada. Los huecos del día se muestran como huecos, así que una entrada más tarde se ve enseguida.

### Etiquetas

Dile a Marksy qué es importante con las palabras de tu propio colegio: una poesía que aprender, un examen, algo que llevar. Una etiqueta es un puñado de palabras clave que Marksy busca en los temas de las clases y en los deberes. Las clases etiquetadas se destacan en el horario y aparecen en la pantalla de inicio con días de antelación, junto con las palabras exactas que coincidieron. Cada idioma trae etiquetas listas para usar, y se pueden editar libremente.

### Tiempo de estudio

Un temporizador para los deberes, que se inicia desde una clase o una asignatura, con pausa y fin, y una pequeña barra que se queda en pantalla mientras está en marcha. Terminar una sesión y marcar una clase como lista son cosas distintas, porque un descanso no es el final. Cuando no se usó el temporizador, Marksy estima el tiempo a partir de las marcas de «Listo» de la tarde y lo indica como estimación. El tiempo se muestra por día y por asignatura, con sencillez y sin juicios.

### Notificaciones

Una notificación push en el teléfono o un mensaje de Telegram cuando pasa algo: una nota nueva, una nota por debajo de un nivel elegido, una nota corregida, una falta, un examen cercano, un resumen de deberes por la tarde, un resumen semanal. Cada regla se ajusta por persona, con horas de silencio. Todo lo enviado se queda en una bandeja de entrada dentro de la app, así que una notificación descartada nunca se pierde.

### Familia

La familia conecta la agenda una sola vez. Cada miembro recibe su propio acceso a Marksy mediante una invitación: la otra madre o el otro padre, las abuelas y los abuelos, cada estudiante. Ningún estudiante necesita nunca la contraseña de la agenda. Las familias amigas pueden crear la suya en el mismo servidor; las familias nunca ven los datos de las demás.

### Tu estilo, tu idioma

Temas claro y oscuro, paletas de colores, imágenes de fondo, cinco fuentes para el texto, un color para cada asignatura. Doce idiomas de interfaz: ruso, bielorruso, ucraniano, kazajo, inglés, polaco, alemán, español, portugués, francés, neerlandés y rumano, elegidos por cada persona. El inglés y el ruso los revisan personas; los otros diez son traducciones automáticas, señaladas como tales en la app, que enlaza a un breve formulario para correcciones. Añadir un idioma es un archivo JSON ([`docs/i18n.md`](docs/i18n.md)).

## Míralo ya

Abre [`docs/mockups.html`](docs/mockups.html) en un navegador. Es un prototipo clicable, pensado primero para el móvil, de todas las pantallas con datos ficticios: cambia entre el rol de madre o padre y el de estudiante, entre dos estudiantes, entre claro y oscuro. La app está hecha para coincidir con él.

## Cómo funciona

```
 ┌───────────────────┐  provider: students, calendar, lessons,  ┌──────────────────────────────┐
 │ school diary      │  marks, homework, final marks            │  Marksy server               │
 │ (through its API) │ <─────────────────────────────────────── │  Node.js + Express           │
 │                   │ ───────────────────────────────────────> │  collector, API, guidance    │
 └───────────────────┘  read-only, serial, gentle               │  PostgreSQL 16               │
                                                                └──────────────┬───────────────┘
                                                                               │ HTTPS, sessions
                                                                ┌──────────────┴───────────────┐
                                                                │  Marksy app (PWA, React)     │
                                                                │  parents and children        │
                                                                └──────────────────────────────┘
```

- **Proveedor.** Un pequeño módulo por cada sistema de agenda. Inicia sesión con las credenciales de la familia y devuelve estudiantes, periodos, asignaturas, clases con notas y deberes, y notas finales en el formato común de Marksy. Declara lo que ofrece su sistema (tipos de clase, comentarios, asistencia, periodos, un horario futuro) y su escala de calificación, y la app se adapta exactamente a eso.
- **Recolector.** El mismo para todos los proveedores. Unas cuantas veces durante la jornada escolar descarga las semanas recientes de cada estudiante, detecta notas nuevas, cambiadas y eliminadas, guarda el historial de cada cambio y vuelve a leer el periodo entero una vez por semana, porque el profesorado edita notas antiguas. Funciona como un planificador: si el ordenador estuvo apagado un fin de semana, la primera ejecución posterior recupera lo que faltó.
- **API.** Sirve los datos guardados a la app, limitados a una familia, y se documenta con OpenAPI en `/api/docs`.
- **App.** Una PWA de React con un armazón sin conexión, instalable en iOS y Android, probada en teléfonos reales a través de la red de casa desde las primeras pantallas.

## Cualquier colegio, cualquier escala

Marksy trabaja con un modelo común (estudiantes, periodos, asignaturas, clases, notas, notas finales) y con una descripción de la **escala de calificación** que aporta el proveedor: el rango y el sentido, cuatro niveles, umbrales, objetivos, cómo se calculan y se muestran las medias, cómo se redondean las notas finales. Una escala de 10 puntos, de 5, de 12, del 1 al 6 donde 1 es la mejor, de 0 a 20, letras con GPA, porcentajes, apto o no apto: las mismas pantallas, medias, filtros, objetivos y consejos funcionan con cada una, incluso cuando la escala cambia de un curso a otro o entre asignaturas.

Todo lo que una agenda puede tener o no es opcional: tipos de clase, categorías de notas, comentarios, asistencia, periodos, notas finales oficiales, incluso el horario. Un proveedor declara lo que hay, y cada pantalla muestra lo que existe en lugar de columnas vacías.

Para conectar un sistema nuevo se escribe un proveedor: un manifiesto (credenciales, escala, capacidades, límites de peticiones), una función de inicio de sesión, unas pocas funciones de descarga que traducen las respuestas a los tipos comunes, un `sanitize()` para los fixtures de prueba y la prueba de conformidad compartida. [`docs/adding-a-diary.md`](docs/adding-a-diary.md) explica lo que hace falta y cómo pedir el sistema de tu colegio; el contrato completo y una lista de revisión están en [`docs/providers.md`](docs/providers.md), y `providers/_template` es un punto de partida que compila.

## Respetuoso por diseño

- **Solo lectura.** Marksy solo lee. El cliente HTTP compartido rechaza cualquier petición fuera de la lista permitida del proveedor, así que nada en la agenda puede cambiarse por accidente.
- **Discreto.** Como mucho un inicio de sesión por hora y cuenta, una petición cada vez con pausas, espera creciente ante errores, un tope por ejecución. La actualización manual comparte el mismo presupuesto.
- **Resistente.** Cada intento y cada semana verificada quedan registrados. Las caídas, en cualquiera de los dos lados, se recuperan automáticamente; tras fallos repetidos, la sincronización se pausa y se avisa una vez a quien administra la familia. Una contraseña incorrecta detiene la sincronización hasta que se corrige, así que la cuenta real nunca se bloquea.
- **Atento a la red.** Algunos sistemas de agenda responden mejor desde su propia región o sin VPN. Cada proveedor declara lo que necesita de la red, y el recolector funciona en una máquina de casa que lo cumple: un PC, un mini PC, una Raspberry Pi, un NAS.
- **Ordenado.** Las notas y su historial se guardan mientras cada estudiante siga en la familia; los datos operativos (registros de sincronización, respuestas en bruto, flujos de eventos) se guardan semanas o meses y después se compactan. Los límites están en `env.example`, bajo `RETENTION_*`.

## Privacidad

Marksy trata datos de menores, y sus valores por defecto lo reflejan.

- **Tus datos se quedan contigo.** Sin analítica, sin scripts ni fuentes de terceros; nada sale de tu servidor.
- **Sesiones en todas partes.** Todas las rutas, salvo el inicio de sesión, el estado del servicio y la documentación de la API, requieren una sesión, y cada consulta se limita a una familia.
- **Secretos protegidos.** Las contraseñas de la agenda se guardan cifradas (AES-256-GCM); las contraseñas de Marksy se guardan con hash argon2id. Los registros nunca contienen contraseñas, tokens ni nombres completos.
- **Nada real en el repositorio.** Los fixtures de prueba son ficticios o están saneados; `pnpm privacy` busca secretos, datos personales y archivos que nunca deben subirse.
- **Las familias son dueñas de sus datos.** Una familia puede exportarlo todo en JSON y borrarse por completo; la conservación es un ajuste. Si alojas Marksy para otras familias, lee antes `docs/design.md`, sección 14.1.

## Requisitos

- Una cuenta en una agenda escolar compatible (de madre o padre, o de estudiante).
- Un ordenador que esté encendido durante la jornada escolar, con Docker y nada más: un PC o portátil de casa, un mini PC, una Raspberry Pi o un NAS.
- Opcional: un dominio en Cloudflare, para usar la app fuera de la red de casa con Cloudflare Tunnel, instalarla en los teléfonos y usar Web Push; un token de bot de Telegram para las notificaciones por Telegram.
- Para desarrollar Marksy: Node.js 22, pnpm y Docker.

## Uso en producción

Para usar Marksy con tu familia cada día, en un portátil, una Raspberry Pi o un NAS, con solo Docker en ese ordenador: [docs/running.md](docs/running.md). Cubre la instalación, las formas de llegar a la app desde casa y desde fuera (Cloudflare Tunnel), las copias de seguridad, la restauración y el traslado a otro ordenador, y las actualizaciones. Cada versión lleva adjuntos los archivos que necesita un servidor, como `marksy-deploy-vX.Y.Z.zip`.

Las versiones se numeran MAJOR.MINOR.PATCH: MAJOR es una remodelación global de la app (poco frecuente), MINOR trae funciones nuevas y PATCH trae correcciones y arreglos. Un servidor instala las versiones nuevas por sí solo, en cuestión de minutos, después de comprobar que las ha firmado este proyecto, con una copia de seguridad antes y una vuelta atrás si algo sale mal.

## Inicio rápido para desarrollo

El espacio de trabajo ejecuta la app entera desde el código fuente: la base de datos, el recolector con su planificador, la API con su documentación, la app y una familia de demostración ficticia para explorarla sin cuenta en una agenda. Necesitas Node.js 22, pnpm (`npm install -g pnpm` o `corepack enable`) y Docker.

```bash
git clone https://github.com/Dopetast1c/Marksy.git
cd Marksy
pnpm setup:env                  # creates .env and generates its secrets
pnpm install                    # also points git at .githooks/ (the pre-commit guard)
pnpm db:up                      # PostgreSQL 16 in Docker: the app database (5432) and an in-memory one for tests (5434)
pnpm db:migrate                 # creates the schema
pnpm db:seed                    # a fictional demo family with demo logins (--reset replaces it)
pnpm check                      # formatting, typecheck, lint, tests, privacy check
pnpm test:provider demo-minimal # the shared conformance suite for one provider
pnpm dev                        # API on :3000, app on :5173, API docs at /api/docs
```

La familia de demostración pertenece a una agenda ficticia y tiene dos estudiantes en dos cursos, uno de ellos sin notas, así que todas las pantallas se pueden explorar sin cuenta en una agenda; sus accesos (`parent@example.com` y `student@example.com`, con la contraseña que imprime `pnpm db:seed`) funcionan en cuanto llega el inicio de sesión. Como esa contraseña es pública, el seed se niega a ejecutarse cuando `PUBLIC_URL` es una dirección pública (`--allow-public` lo anula). `pnpm db:studio` abre la base de datos en Drizzle Studio. `pnpm db:backup` escribe un volcado de la base de datos local en `data/backups/` (se guardan los cinco últimos) y lo comprueba restaurándolo en una base de datos temporal; `pnpm db:restore <file> --yes` repone uno. Con una cuenta en una agenda, abre la app, elige «Conectar una agenda», escoge tu sistema de agenda e inicia sesión: Marksy comprueba las credenciales una vez, crea tu familia y empieza la primera sincronización. Invita al resto de la familia desde «Más» y luego «Familia».

Con una cuenta en una agenda, `pnpm dev:connect` crea tu propia familia desde la línea de comandos: lee el acceso a la agenda (`DIARY_LOGIN`, `DIARY_PASSWORD`) y el acceso a Marksy que quieras (`MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD`) de `.env` y ejecuta el mismo código que «Conectar una agenda»; si se vuelve a ejecutar tras reiniciar la base de datos, solo añade lo que falta, y encima de `pnpm sync:once` adopta esa familia sin volver a iniciar sesión en la agenda. Antes de eso, se puede llenar la base de datos local desde la línea de comandos: pon el acceso a la agenda en `DIARY_LOGIN` y `DIARY_PASSWORD` de `.env` y ejecuta `pnpm sync:once`. Solo habla con los sistemas de agenda que se ofrecen a las familias, crea una familia mínima la primera vez y ejecuta una sincronización con las mismas reglas que cualquier otra ejecución (el tope de peticiones, la comprobación de conexión, un inicio de sesión por cuenta y por intervalo: 10 minutos para los comandos manuales en desarrollo, el intervalo propio del sistema de agenda en producción); `pnpm probe` lee cada endpoint una vez y actualiza los fixtures saneados del proveedor, y `pnpm probe --offline` repite las comprobaciones sobre sus respuestas guardadas sin iniciar sesión (solo reescribe los fixtures con `--write-fixtures`). Los tres comandos que inician sesión en una agenda real comparten una protección de inicio de sesión. La protección pre-commit rechaza un commit que incluya datos locales, secretos, volcados de la base de datos o respuestas en bruto, o cualquier nombre o id de las últimas respuestas reales. Solo imprime recuentos y estados, y sale con 0 también cuando las reglas frenan la ejecución. Mientras `SYNC_ENABLED` sea `true`, `pnpm dev` mantiene esa cuenta sincronizada por sí solo, únicamente durante la jornada escolar de cada estudiante. `pnpm sync:plan` muestra lo que haría ahora el planificador (la ventana de hoy de cada estudiante, lo que está pendiente, si empezaría una ejecución) sin iniciar sesión en ningún sitio.

### En un teléfono de la red de casa

```bash
pnpm dev:lan                    # like pnpm dev, and the app also listens on the local network
```

Vite imprime una dirección `Network:` como `http://192.168.1.20:5173`; ábrela en un teléfono conectado a la misma wifi. Todo pasa por ese único puerto: el servidor de la app reenvía `/api` a la API, que a su vez solo escucha en `127.0.0.1`, así que el inicio de sesión funciona sin más configuración. En Windows, permite Node.js en redes **privadas** cuando lo pregunte el cortafuegos y comprueba que el perfil de la wifi sea Privado. Instalar la app, el modo sin conexión y Web Push necesitan HTTPS en un teléfono; eso llega con el hito de la PWA (`docs/build-plan.md` M8).

`pnpm smoke:lan` comprueba la API como la ve un teléfono, sin teléfono: mientras se ejecuta `pnpm dev:lan`, busca la dirección de este ordenador en la red de casa, inicia sesión en `http://<address>:5173/api` con `MARKSY_DEV_EMAIL` y `MARKSY_DEV_PASSWORD` de `.env` y lee los datos de cada estudiante. Imprime estados, recuentos y la forma de cada respuesta (claves y tipos, sin valores) y falla cuando una respuesta lleva una contraseña o el token de sesión, o cuando la cookie de sesión no funcionaría con http sin cifrar. `--host <ip>` te deja elegir la dirección.

`pnpm smoke:ui` hace lo mismo con las pantallas: con `pnpm dev:lan` en marcha, abre la app por la dirección de la red de casa en un navegador sin interfaz a tamaño de teléfono (360 px, táctil) y de tableta, inicia sesión con la cuenta de demostración de madre o padre (y con la tuya, cuando `MARKSY_DEV_EMAIL` está definida), recorre todas las pantallas de cada estudiante y captura los mismos estados del prototipo clicable (`docs/mockups.html`) para compararlos. Las capturas van a `data/ui/` (las tres últimas ejecuciones), que nunca se sube al repositorio. Necesita Chromium para Playwright una vez: `pnpm exec playwright install chromium`.

## Configuración

En desarrollo, toda la configuración está en `.env` (que `pnpm setup:env` crea a partir de `env.example`); un servidor de producción tiene su propio `.env.production` ([docs/running.md](docs/running.md), sección 3). Los secretos nunca van al repositorio.

| Variable | Para qué sirve |
|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | PostgreSQL para la app (`marksy`, puerto 5432, guardada en un volumen de Docker) y para `pnpm test` (`marksy_test` en un servidor aparte en memoria, puerto 5434, vacío tras cada reinicio) |
| `PORT`, `HOST` | Puerto de la API (3000) y dirección de escucha (`127.0.0.1`; los demás dispositivos llegan a la API a través del servidor de la app) |
| `SESSION_SECRET` | Cadena aleatoria para las cookies de sesión (generada) |
| `CREDENTIALS_KEY` | Clave de 32 bytes (base64) que cifra las contraseñas de la agenda guardadas (generada) |
| `SYNC_ENABLED` | `true` en la máquina que habla con la agenda, `false` en una copia que solo sirve la API |
| `SYNC_WINDOW` | Opcional: un límite exterior para la ventana de jornada escolar de cada estudiante (solo puede estrecharla) |
| `SYNC_JITTER_MIN`, `SYNC_MIN_LOGIN_INTERVAL` | Retraso aleatorio de las ejecuciones programadas; tiempo mínimo entre inicios de sesión por cuenta (solo se puede aumentar) |
| `SYNC_TICK_MIN`, `SYNC_CATCHUP_AFTER`, `SYNC_MAX_REQUESTS_PER_RUN` | Planificador: cada cuánto decide, cuándo se permite una ejecución de recuperación, cuánto puede descargar una ejecución |
| `SYNC_FAILURES_BEFORE_PAUSE`, `SYNC_PAUSE_HOURS`, `SYNC_PAUSE_MAX_HOURS`, `SYNC_OFFLINE_RETRY_MIN` | Gestión de fallos: fallos antes de una pausa, la pausa (que se duplica hasta una semana), reintento cuando esta máquina está sin conexión |
| `RETENTION_*` | Cuánto tiempo se guardan los datos operativos (registro de sincronización, respuestas en bruto, flujos de eventos, cobertura) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Claves de Web Push |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Bot de Telegram (opcional) |
| `MARKSY_ENV`, `DEV_MIN_LOGIN_INTERVAL_MINUTES` | Límites de los comandos manuales de la agenda (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`). `development` (definido en `env.example`): un inicio de sesión por cuenta cada 10 minutos o más, a cualquier hora. Cualquier otro valor, incluida su ausencia, y cualquier build con `NODE_ENV=production`: el intervalo propio del sistema de agenda (una hora en la mayoría). `pnpm env:dev` añade las dos líneas de desarrollo a un `.env` antiguo que no las tenga, sin tocar los valores ya definidos. Las sincronizaciones programadas siguen las reglas de la jornada escolar en ambos casos |
| `MARKSY_RUNNER` | Déjala vacía. `.claude/settings.json` la pone a `claude` para Claude Code: en producción, sus inicios de sesión reales se limitan a tres al día en horario escolar |
| `DIARY_LOGIN`, `DIARY_PASSWORD`, `MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD` | Solo para desarrollo: tu propio acceso a la agenda para `pnpm probe`, `pnpm sync:once` y `pnpm dev:connect`, y el acceso a Marksy que crea `dev:connect`. La app en sí guarda las credenciales de la agenda en la base de datos, cifradas |
| `TZ` | Zona horaria del colegio (nombre IANA) |

## Estructura del repositorio

```
packages/core/          common types, provider interface, grading scales, marks math,
                        guidance rules, throttled HTTP client, provider conformance suite
packages/i18n/          interface languages: en.json as the source of truth, ru reviewed, ten machine translations
packages/registry/      the list of providers the app offers
providers/_template/    starting point for a new provider
providers/demo-minimal/ a fictional diary with the fewest features, served from fixtures
providers/demo-full/    a fictional diary with many features: the demo family and the collector tests use it
providers/demo-lite/    the same fictional diary with fewer features: the demo family's second school
packages/demo-diary/    the fictional diary and school behind the demo providers and the demo family
providers/<id>/         one folder per diary system: manifest, schemas, mapper, fixtures
server/                 Express API, collector, backups, Drizzle schema and migrations, the production command line
web/                    React + Vite PWA, Tailwind driven by docs/tokens.json
updater/                automatic updates: channels, signature checks, rollback, the Docker socket guard
docker/                 the reverse proxy's and the web server's configuration
scripts/                checks (privacy, language, documentation, migrations, commits), releases, .env setup
docs/                   running.md         running Marksy at home
                        adding-a-diary.md  what connecting another diary system takes
                        ux-principles.md   why the interface is the way it is
                        design.md          product and technical design
                        build-plan.md      milestones and how the project is built
                        providers.md       the provider contract
                        i18n.md            how to add a language
                        api-spec.md        notes on the first provider's API
                        tokens.json        design tokens
                        mockups.html       clickable prototype
```

Empieza por `docs/running.md` para poner en marcha Marksy, `docs/ux-principles.md` para ver por qué la interfaz es como es, `docs/design.md` para entender o cambiar el producto y `docs/adding-a-diary.md` para conectar otro sistema de agenda.

## Hoja de ruta

El plan completo con los criterios de aceptación está en [`docs/build-plan.md`](docs/build-plan.md).

Hecho:

1. Núcleo: modelo común, escalas de calificación, cálculo de notas, cliente HTTP, idiomas.
2. El primer proveedor y sus pruebas de conformidad.
3. Servidor: base de datos, recolector, planificador, datos de ejemplo ficticios.
4. Cuentas, familias, invitaciones y la API de lectura.
5. La app: inicio, atención, notas, notas finales, asignaturas, página de asignatura, horario, ajustes, apariencia; después, las traducciones a los otros diez idiomas.
6. Funcionamiento en casa (1.0): imágenes de producción, copias de seguridad, acceso remoto, actualizaciones automáticas firmadas.

Próximamente:

7. Etiquetas.
8. Tiempo de estudio.
9. PWA instalable con modo sin conexión.
10. Notificaciones: bandeja de entrada, reglas, Web Push, Telegram.

## Contribuir

No se aceptan pull requests. Los informes de errores, las ideas y las correcciones de traducción, de la app o de esta página en tu idioma, son muy bienvenidos como [Issues](https://github.com/Dopetast1c/Marksy/issues), en inglés o en ruso.

Si cambia la API de una agenda, abre una issue con una respuesta saneada (nombres, ids y comentarios sustituidos), el id del proveedor y la fecha.

El proyecto se construye con Claude Code siguiendo `docs/build-plan.md`; las skills y los agentes que usa están en `.claude/`, y las reglas que sigue el código están en `CLAUDE.md`. Si modificas Marksy para tu propio uso no comercial, `docs/providers.md` explica cómo añadir un sistema de agenda y `docs/i18n.md`, cómo añadir un idioma.

## Aviso

Marksy es un proyecto independiente de código disponible. No está afiliado a ningún colegio, autoridad educativa ni proveedor de agendas, ni cuenta con su respaldo o su apoyo. Usa la API de una agenda en nombre de quien tiene allí una cuenta (madre o padre, o estudiante), solo lee datos y está pensado para tu propia familia.

## Licencia

Marksy se distribuye bajo la [PolyForm Noncommercial License 1.0.0](LICENSE).

**Puedes** usarlo, copiarlo y modificarlo con cualquier fin no comercial: en casa para tu propia familia, para estudiar, investigar, proyectos personales y pruebas, y en colegios, otros centros educativos, organizaciones benéficas, organismos públicos de investigación e instituciones públicas.

**No puedes** usarlo con fines comerciales: ni venderlo, ni ofrecer alojamiento de pago o un servicio de pago basado en él, ni incluirlo en un producto de pago, ni que una empresa lo use para sus propios fines.

Si necesitas una licencia comercial, solicítala a través de una [issue](https://github.com/Dopetast1c/Marksy/issues). Lo que cuenta es el [texto completo de la licencia](LICENSE); este resumen es solo una guía.
