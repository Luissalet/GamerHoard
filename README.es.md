# GamerHoard

[English](README.md)

Una **biblioteca de videojuegos con app web y nativa**. En el modo compartido, la web y las herramientas MCP usan el mismo JSON (`~/.gamerhoard/library.json`). Se conservan también los modos originales de navegador, dispositivo y nube:

- una **app web** servida en tu propio ordenador (`http://127.0.0.1:5207`),
- las **herramientas MCP** que usa Faustus (o cualquier cliente MCP) desde un chat,
- una **app nativa** opcional (Expo, SQLite en el dispositivo).

El modo local compartido se abre sin iniciar sesión. Supabase conserva opcionalmente las cuentas y funciones de comunidad; la app nativa puede usar su propia biblioteca SQLite. Esta recuperación local no cambia el despliegue público de gamer-hoard.com. Necesita Node.js 22 o superior.

## Puesta en marcha

```sh
npm run setup        # una vez: instala la dependencia del servidor (Express)
npm install          # una vez: instala las herramientas del cliente web
npm run build:web    # una vez, y tras cambiar el cliente: genera apps/mobile/dist
npm run server       # arranca http://127.0.0.1:5207
```

En Windows, `GamerHoard.bat` hace lo mismo y abre el navegador. Opcional: define `RAWG_API_KEY` (gratis en rawg.io/apidocs) antes de arrancar para activar el catálogo online (búsqueda, portadas, lista de DLC, «dónde jugar»). Sin ella la app funciona igual con tu biblioteca, notas, sesiones e importación de Steam.

La app web y el servidor MCP leen y escriben el mismo archivo y se enteran de los cambios del otro: un juego que marcas como completado en el navegador queda completado para Faustus, y una sesión que registra Faustus aparece en el navegador al refrescar.

## Qué hace la app web

- **Juegos**: inicio con «Jugando ahora», «A punto de acabar» y añadidos recientes; rejilla por estado (pendiente, jugando, pausado, completado, abandonado), búsqueda, orden (recientes, A-Z, horas), favoritos, filtro por género y el selector ponderado «¿a qué juego ahora?». Mantén pulsado un juego para las acciones rápidas.
- **Ficha del juego**: estado de un toque, nota (1-10), notas personales, plataformas que tienes, lista de DLC (cuando RAWG los conoce), **sesiones de juego** (minutos y una nota por sesión), Metacritic y enlaces a tiendas, tráiler, capturas y juegos similares.
- **Explora**: busca en RAWG, tendencias, novedades, populares y mejor valorados, por género y plataforma; añade directo al backlog.
- **Stats y perfil**: totales, horas, completado, géneros, plataformas y estudios más frecuentes, juegos con más DLC.
- **Historial**: sesiones registradas (con minutos) y DLC marcados.
- **Importar de Steam**: perfil (nombre, URL o SteamID64) y tu Steam Web API key. La key se recuerda solo en el navegador; nunca va al archivo de la biblioteca.
- **Ajustes**: idioma (español o inglés), instalar como app, exportar la biblioteca en JSON.

## Conectar con Faustus

Faustus carga [`faustus-plugin.json`](faustus-plugin.json) con `GAMERHOARD_DIR` apuntando a este repositorio. Declara el servidor MCP stdio (`mcp/server.mjs`), la app web (puerto 5207, salud en `/api/health`, se lanza con `node server/index.mjs`) y el copiloto. Para un cliente MCP manual usa `command: node` y `args: ["C:/ruta/GamerHoard/mcp/server.mjs"]`.

### Copiloto de Faustus

Todas las páginas que sirve el servidor llevan el botón de Faustus (abajo a la derecha). Abre el chat de Faustus en un panel lateral y, con cada mensaje, le envía el contexto de lo que estás viendo (`window.hoardCopilot.context`):

| Vista | Qué recibe Faustus |
|-------|--------------------|
| Ficha de juego (`/show/<id>`) | el juego abierto como `active_objects`: id de la biblioteca, título, estado, plataformas, nota, horas, favorito, DLC hechos/total, estudio, géneros; los campos sin guardar en `view.editor` (notas que has escrito, minutos de una sesión aún sin registrar) |
| Biblioteca (`/`) | los juegos listados en pantalla (hasta 8, en el orden mostrado) y en `view` la pestaña, el filtro de estado, el género, solo favoritos y el orden; el texto de búsqueda en `view.editor` |
| Stats y perfil | un resumen en `view.summary` (juegos por estado, horas, favoritos, más jugados) |
| Explora | el texto de búsqueda en `view.editor` |
| Importar de Steam | el perfil que has escrito (nunca la API key) |
| Cualquier otra, o un juego que no está en la biblioteca | `active_objects: []` |

Tras cada turno de Faustus se refrescan una vez las listas abiertas sin perder lo que estás escribiendo. Define `HOARD_COPILOT=0` antes de arrancar el servidor para quitar el botón. Las rutas están en [docs/API.md](docs/API.md).

Cada petición de contexto captura la pantalla y los campos pendientes antes de que terminen las lecturas nativas, para no mezclar dos vistas si navegas durante la petición. Una biblioteca filtrada sin coincidencias envía cero juegos. Las notas personales que estás editando siguen pendientes cuando un turno actualiza la nota guardada; el siguiente Guardar escribe el borrador local conservado.

## Herramientas MCP

- `gamer_list`, `gamer_get`: buscar e inspeccionar juegos, con filtros de estado, favorito y plataforma y paginación (`offset`).
- `gamer_add`, `gamer_update`: añadir juegos y actualizar estado, nota de 1 a 10, notas, favoritos, plataformas, etiquetas, horas, progreso, portada, estudio y total de DLC.
- `gamer_remove`: borra un juego de la biblioteca. Exige `confirm: true`.
- `gamer_dlc`: registra expansiones y las marca como completadas (un `number` opcional guarda la posición del catálogo para que la lista web coincida).
- `gamer_log_session`, `gamer_sessions`: registran sesiones locales y consultan el historial. Un `sessionId` estable hace que repetir actualice la misma sesión en vez de sumar tiempo dos veces. Corregir los minutos cambia el total por la diferencia. `playedAt` exige ISO 8601 con zona horaria. Los filtros aceptan fechas UTC o marcas ISO con extremos inclusivos; `limit` afecta a las filas devueltas, mientras `total` y `minutes` cubren todas las sesiones que encajan.
- `gamer_stats`, `gamer_backlog`: resúmenes y sugerencias deterministas del backlog.
- `gamer_activity`: resumen de actividad de un rango de fechas inclusivo, ordenado por minutos y agrupado por día UTC. Solo cuentan las sesiones con fecha. Ver [Resúmenes de actividad](docs/ACTIVITY.md).
- `gamer_search_catalog`, `gamer_add_from_catalog`: metadatos opcionales de RAWG (necesitan `RAWG_API_KEY` en el proceso MCP).
- `gamer_import_steam`: pasa un SteamID64 y la Web API key **en la llamada** para importar una biblioteca pública y las horas. `syncExistingPlaytime: true` refresca las horas de juegos ya enlazados sin contar dos veces las sesiones registradas. La key no se guarda en el JSON ni en logs.
- `gamer_sync_steam_achievements`, `gamer_achievements`: refrescan y consultan los logros de un juego de Steam.
- `gamer_import_json`, `gamer_export_json`: importación aditiva y exportación. Se aceptan las exportaciones de GamerHoard y el formato antiguo `watchhoard-export`; lo que ya existe se omite. Las exportaciones crean archivos nuevos y nunca sobrescriben.

Los estados son `backlog`, `playing`, `paused`, `completed` y `dropped`. La app web los muestra como Pendiente, Jugando, Pausado, Completado y Abandonado.

## Configuración

| Variable | Por defecto | Significado |
|----------|-------------|-------------|
| `GAMERHOARD_PORT` | `5207` | puerto de la app web |
| `GAMERHOARD_DATA_FILE` | `~/.gamerhoard/library.json` | archivo de la biblioteca (lo comparten servidor y MCP; defínela en ambos) |
| `GAMERHOARD_DATA_DIR` | carpeta de la biblioteca | donde el copiloto guarda su pequeño estado |
| `GAMERHOARD_DIST` | `apps/mobile/dist` | cliente web compilado |
| `GAMERHOARD_ALLOWED_HOSTS` | solo nombres locales | nombres de host extra aceptados |
| `RAWG_API_KEY` | ninguna | activa el catálogo online; se queda en el servidor |
| `HOARD_FAUSTUS_URL` | `http://127.0.0.1:7000` | dónde llega el copiloto a Faustus |
| `HOARD_COPILOT` | activo | `0` quita el botón de Faustus |

El archivo de la biblioteca es la única fuente de verdad y no forma parte del repositorio: cópialo para una copia de seguridad, o usa Ajustes > Exportar datos o `gamer_export_json`.

## App nativa

`apps/mobile` es un proyecto Expo. La compilación nativa mantiene su propia base SQLite en el dispositivo (no lee el archivo de la biblioteca del ordenador) y llama a RAWG directamente con `EXPO_PUBLIC_RAWG_KEY` de `apps/mobile/.env`. Copia antes `apps/mobile/.env.example`. La app web es la que comparte datos con Faustus.

## Verificar

```sh
npm test             # biblioteca MCP, servidor REST, contexto del copiloto, manifiesto
npm run typecheck    # el cliente Expo
```

## Límites

- Las herramientas MCP trabajan con los juegos de la biblioteca local compartida; no afirman acceso a las colecciones del navegador ni a la cuenta en la nube. Se han recuperado listas, reseñas, cuentas y pantallas sociales, películas, insignias, parsers de importación y Supabase. Las compatibilidades de catálogo heredadas siguen como antes; no se añade un nuevo proveedor de películas o personas.
- La web no muestra los logros de Steam (las herramientas MCP y `/api/games/<id>/achievements` sí).
- En el modo compartido, Borrar datos vacía las colecciones del navegador y conserva los juegos compartidos. La interfaz lo explica y permite exportar ambos. Los demás modos conservan su operación original de borrado.
- Los metadatos online (portadas, lista de DLC, tráilers) necesitan `RAWG_API_KEY`.

## Fuentes de datos recuperadas

En Ajustes puedes elegir la biblioteca compartida con Faustus, la biblioteca original de este navegador o tu cuenta en la nube. `EXPO_PUBLIC_BACKEND=localapi` sigue siendo el modo web por defecto. `memory` y el `local` original usan el almacenamiento del navegador en web; `local` usa SQLite en nativo; `supabase` selecciona el adaptador original en ambas plataformas. La nube utiliza `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` configurados y el inicio de sesión original. Los modos locales se abren sin iniciar sesión ni renovar una sesión de nube. Desde la entrada de la nube puedes volver a la biblioteca compartida.

Los juegos y sesiones compartidos siguen usando REST/MCP y el mismo archivo nativo. Las listas, películas y demás colecciones del navegador reutilizan MemorySource y sus claves de almacenamiento existentes; las modificaciones sobreviven a la recarga. Puedes añadir un juego a una lista desde su ficha. Las cuentas y funciones sociales utilizan Supabase recuperado; las colecciones del navegador no se presentan como publicadas o sincronizadas. La importación mediante cuenta de Steam vuelve a estar disponible en nube junto a la importación actual por perfil y clave. Una operación de contadores de episodios no admitida por juegos compartidos comunica su límite en lugar de afirmar un guardado vacío.

Se recuperan `packages/` y `supabase/` como código histórico. Esta entrega no ejecuta migraciones, despliegues, cuentas de proveedores ni credenciales reales. El funcionamiento iOS/Android y la conexión a una nube real requieren su entorno configurado; no se confunden con la comprobación de tipos y los fixtures de contrato privados.
