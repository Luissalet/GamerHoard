# GamerHoard

Biblioteca de **videojuegos** local y de un solo usuario. Una app web en tu ordenador, las herramientas MCP de Faustus comparten **un único archivo**; una app nativa opcional conserva además su SQLite (`~/.gamerhoard/library.json`). Los datos de catálogo vienen de **RAWG** (https://rawg.io) y la importación estrella es la de **Steam**. El modo compartido se abre sin cuenta; se conservan los modos originales de navegador, SQLite y Supabase, incluidas las pantallas de cuentas y comunidad. La web pública no se modifica.

Guía de uso y herramientas: `README.es.md`. Rutas REST y del copiloto: `docs/API.md`.

## Origen y qué cambió

La app nació como un fork de Watch Hoard (seguimiento de series) y se reconvirtió a juegos:

| Antes (series)        | GamerHoard                                              |
|-----------------------|--------------------------------------------------------|
| Dónde ver (streaming) | **Dónde jugar** (tiendas: Steam, PSN, Xbox, GOG...)    |
| —                     | **Plataformas disponibles** + marcar en cuáles lo tienes |
| Episodios             | **DLC / expansiones** (misma lista de checks)          |
| Director / creador    | **Estudio / editor**                                   |
| Colección de pelis    | **Saga / serie** del juego                             |
| Nota TMDB             | **Metacritic** + enlaces (OpenCritic, HowLongToBeat...) |
| Importar de TV Time   | **Importar de Steam** (juegos + horas)                 |
| —                     | **Sesiones de juego** (minutos y nota por sesión)      |
| Cuentas, seguidores, reseñas, listas, notificaciones | eliminados (app local de un usuario) |

Estados: **Pendiente · Jugando · Pausado · Completado · Abandonado**.

## Puesta en marcha

1. (Opcional) **RAWG key gratis**: https://rawg.io/apidocs → `RAWG_API_KEY` en el entorno del servidor.
2. `npm run setup`, `npm install`, `npm run build:web`, `npm run server` (o `GamerHoard.bat` en Windows) → http://127.0.0.1:5207.

Detalles, variables de entorno y límites en `README.es.md`.

## Importar tu cuenta de Steam

Ajustes → **Importar de Steam** (o el botón de la biblioteca/perfil vacíos):

1. Consigue tu **Steam Web API key** (gratis): https://steamcommunity.com/dev/apikey
2. Escribe tu **perfil** (nombre, URL o SteamID64) y la **API key**. La key se recuerda solo en el navegador y nunca va al archivo de la biblioteca.
3. «Detalles del juego» de tu perfil debe estar en **Público**.

Carga todos tus juegos con sus **horas jugadas**, marca la plataforma **PC** y calcula el estado: jugado en los últimos 90 días → **Jugando**, jugado antes → **Pausado**, sin jugar → **Pendiente**. Las llamadas a Steam las hace el servidor local (el navegador no puede por CORS); en la app nativa van directas.

## Qué incluye

- **Inicio**: «Jugando ahora», «A punto de acabar» (DLC a medias), añadidos recientes, franja de stats y el selector **«¿A qué juego ahora?»** (aleatorio ponderado del backlog; favoritos x3, pausados x2).
- **Acciones rápidas**: mantén pulsado un juego para cambiar estado, marcar favorito o quitarlo.
- **Ficha de juego**: estados de un toque, nota 1-10 con estrellas, notas personales, descripción, géneros, dónde jugar, plataformas con propiedad, DLC marcables, **sesiones de juego**, Metacritic y enlaces, saga, estudio, capturas, tráiler, similares y tus horas.
- **Biblioteca**: rejilla por estado, buscador (en web, **/**), orden, favoritos, filtro por género.
- **Explora**: buscar, tendencias, novedades, populares, mejor valorados, por género y plataforma; **+** añade al backlog (mantén pulsado para elegir estado).
- **Perfil, Stats, Historial, Ajustes** (idioma, instalar, importar Steam, exportar).
- **Copiloto de Faustus**: botón en todas las páginas con el contexto de la vista (juego abierto, juegos listados, campos sin guardar).

## Qué no hace

Sin cuentas ni sincronización entre equipos, sin películas ni listas personalizadas, sin logros de Steam en la web (sí en las herramientas MCP), sin «borrar datos» desde la web. Los metadatos online necesitan `RAWG_API_KEY`.

## Nota técnica (nombres internos)

Para minimizar cambios sobre la base original se conservan nombres internos con otra semántica: `shows` / `tvdb_id` = **juego** (id de RAWG; juegos de Steam `2_000_000_000 + appid`; manuales `1_000_000_000 + hash`), `episode` / `ep_state` = **DLC**, `network` = **estudio**. Datos en `apps/mobile/src/rawg.ts` y `apps/mobile/src/steam.ts`; `src/tmdb.ts` reexporta de `rawg.ts`. El cliente web habla con `server/app.mjs` mediante `apps/mobile/src/db/localapi.ts`; el servidor y el MCP comparten `mcp/library.mjs`.
