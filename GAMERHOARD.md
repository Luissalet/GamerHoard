# GamerHoard

Un clon de **Watch Hoard** para **videojuegos**. Misma arquitectura (Expo / React Native +
Expo Router, SQLite local o Supabase, i18n ES/EN), pero la fuente de datos es **RAWG**
(https://rawg.io) en lugar de TMDB, y la app gira en torno a **juegos** y **DLCs**.

## Qué cambia respecto a Watch Hoard

| Watch Hoard            | GamerHoard                                              |
|------------------------|--------------------------------------------------------|
| Dónde ver (streaming)  | **Dónde jugar** (tiendas: Steam, PSN, Xbox, GOG...)    |
| —                      | **Plataformas disponibles** + marcar en cuáles lo tienes |
| Episodios de una serie | **DLCs / expansiones** (misma UI de checklist)         |
| Director / creador     | **Estudio / editor**                                   |
| Colección de pelis     | **Saga / serie** del juego                             |
| Nota TMDB              | **Metacritic** + enlaces (OpenCritic, HowLongToBeat...) |
| Importar de TV Time    | **Importar de Steam** (juegos + horas jugadas)         |
| Pestañas Series+Pelis  | **Una sola pestaña de Juegos** (Todos / Jugando)       |

Estados de un juego: **Pendiente · Jugando · Pausado · Completado**.

## Puesta en marcha

1. **RAWG key (gratis, 1 min):** https://rawg.io/apidocs → pégala en `apps/mobile/.env`:
   `EXPO_PUBLIC_RAWG_KEY=tu_key`
2. Instala y arranca:
   ```bash
   cd apps/mobile
   npm install
   npx expo start      # w (web), a (Android), i (iOS)
   ```
   Por defecto `EXPO_PUBLIC_BACKEND=local` (biblioteca on-device, sin Supabase).

## Importar tu cuenta de Steam

Ajustes → **Importar de Steam** (o el botón en la biblioteca/perfil vacíos):

1. Consigue tu **Steam Web API key** (gratis): https://steamcommunity.com/dev/apikey
2. Pon tu **perfil** (nombre, URL del perfil o SteamID64) y la **API key** en la pantalla
   (la key se guarda en el dispositivo; también puedes ponerla en `EXPO_PUBLIC_STEAM_KEY`).
3. Tu perfil de Steam debe estar en **Público** (Detalles del juego) para que se vean tus juegos.

Carga todos tus juegos con sus **horas jugadas**, marca la plataforma **PC**, y calcula tu
estado: jugado en los últimos 90 días → **Jugando**, jugado antes → **Pausado**, sin jugar → **Pendiente**. El detalle de cada juego resuelve datos de RAWG (Metacritic, dónde
jugar, saga, estudio…) por nombre, y añade un enlace directo a su ficha de Steam.

> **CORS en web:** `api.steampowered.com` no envía cabeceras CORS, así que el navegador (Expo
> web) bloquea la llamada. Úsalo en un **dispositivo/emulador** (funciona directo), o define
> `EXPO_PUBLIC_STEAM_PROXY` con un proxy CORS.

## Qué incluye

- **Inicio dinámico**: carrusel "Jugando ahora", "A punto de acabar" (DLCs a medias), añadidos recientes, franja de stats y el selector **"¿A qué juego ahora?"** (aleatorio ponderado del backlog con filtros por género/favoritos; los favoritos pesan x3 y los pausados x2).
- **Acciones rápidas**: mantén pulsado cualquier juego (biblioteca o inicio) para cambiar su estado, marcarlo favorito o quitarlo sin abrir la ficha.
- **Tu nota y notas**: valora cada juego con 5 estrellas (medias con pulsación larga; se guarda 1-10) y escribe notas personales (builds, misiones pendientes…). Nota media y top personal en Stats.
- **Explora**: buscar juegos; tendencias, **novedades**, populares, mejor valorados, próximos; filtro por **género** y por **plataforma**. El botón **+** añade directo al backlog; mantenlo pulsado para elegir estado (Pendiente/Jugando/Completado). Skeletons de carga en vez de spinners.
- **Ficha de juego**: estados de un toque (añaden a la biblioteca si hace falta), descripción, géneros, **dónde jugar**, **plataformas con propiedad**, **DLCs marcables**, **Metacritic** + enlaces, **saga**, **estudio/editor**, capturas, tráiler, similares, y **tus horas** (juegos de Steam).
- **Biblioteca** (Juegos): rejilla por estado, buscador, orden (recientes / A-Z / horas), favoritos, filtros. En web, pulsa **/** para buscar y hay hover en las tarjetas.
- **Perfil**: total, horas, completados, favoritos, jugando/pendientes/pausados, DLCs, actividad reciente.
- **Stats**: ratio de completado, horas, por estado, top géneros/plataformas/estudios, juegos con más DLCs.
- **Historial** de actividad, **página de estudio**, **Ajustes** (idioma, importar Steam, exportar, borrar datos).
- **Importar de Steam** (juegos + horas).

## Fases siguientes (opcional)

Funciones sociales/nube (feed, follows, reseñas) solo aplican con Supabase; los logros propios
de juegos y un calendario de lanzamientos quedan pendientes.

## Sincronización en la nube (Supabase) — opcional, ya preparada

La app funciona en local por defecto. Cuando crees tu proyecto Supabase, ya está todo listo:

1. En el **SQL editor** de Supabase, ejecuta `docs/supabase/APPLY_ALL.sql` (esquema completo,
   ya incluye los campos de juego), **o** aplica las migraciones de `supabase/migrations/`
   (la **0013** añade `owned_platforms`, `platforms`, `playtime_minutes`, `steam_appid` a `app_shows`;
   la **0014** añade `user_rating` y `notes`).
2. En `apps/mobile/.env` pon:
   ```
   EXPO_PUBLIC_BACKEND=supabase
   EXPO_PUBLIC_SUPABASE_URL=https://<tu-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
   ```
3. Reinicia Expo. La biblioteca (juegos, plataformas, DLCs, horas de Steam) se sincroniza por
   usuario con RLS. El `SupabaseSource` implementa el mismo contrato que el local, así que las
   pantallas no cambian; los métodos nuevos (`setOwnedPlatforms`, `setPlatforms`, `addSteamGame`)
   ya están implementados y degradan sin romper si aún no aplicaste la 0013.

## Nota técnica (nombres internos)

Para minimizar cambios sobre la base de Watch Hoard, algunos nombres internos se conservan con
otra semántica: la tabla `shows`/`tvdb_id` = **juego** (id de RAWG; los juegos de Steam usan
`2_000_000_000 + appid`), `episode`/`ep_state` = **DLC**, `network` = **estudio/editor**. Datos
en `apps/mobile/src/rawg.ts` (RAWG) y `apps/mobile/src/steam.ts` (Steam); `src/tmdb.ts` es un
shim que reexporta de `rawg.ts`.
