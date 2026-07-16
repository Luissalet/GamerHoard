# Phase 4 — Fichas completas, social real y calendario (2026-07-08)

## Qué se ha construido en esta pasada

**Bugs del deploy (lo urgente)**
- El perfil mostraba "you": usaba el mirror de stats (`app_profile.handle`, null en cuentas nuevas). Ahora en cloud muestra `profiles.display_name` (→ "Luis Salet") + @handle.
- El chip "Importado de TV Time" se pintaba SIEMPRE. Ahora solo si hay datos importados (handle o episodios/pelis > 0). El footer de Ajustes ya no dice "imported from TV Time".
- Nota: la DB cloud está LIMPIA (una sola cuenta, 0 filas de contenido). No se filtró ningún dato de prueba a GitHub — era solo el chip mentiroso + el "you".

**Features**
- Comentarios por **película, serie y episodio individual** (nueva ficha de episodio `/episode/{tvdb}-{s}-{e}` con still, sinopsis, check de visto, puntuaciones y comentarios). Tocar una fila de episodio abre su ficha; el círculo sigue marcando visto.
- **Pósters alternativos** (icono pincel en el póster de las fichas → grid de pósters de TMDB → se guarda por usuario en local y cloud).
- **Banners**: cards de "A continuación" con imagen ancha (backdrop) estilo TV Time; las fichas ya tenían backdrop hero.
- **Calendario** (`/calendar`, icono en el tab Series): grid mensual + agenda con los próximos episodios de tus series (temporada en emisión completa) y estrenos de tus pelis pendientes.
- **Filtros por género**: en Explorar (chips + secciones por género vía TMDB discover) y en tu biblioteca (series y pelis; el género se rellena solo en segundo plano y se guarda en la columna `genres`).
- **Personalización de perfil**: subir foto de avatar (web → bucket `avatars` de Supabase Storage) y **banner desde una serie/peli de tu biblioteca** (estilo TV Time). Se muestran en tu perfil y en el público.
- **Seguidores**: contadores reales (RPC follow_counts) en tu perfil, tocables → listas. Botón seguir/solicitar ya existente verificado.
- **Actividad de amigos**: nueva pestaña "Amigos" en Explorar. Eventos: episodio visto, temporada marcada, peli vista, reseña publicada, follow. RLS: solo tus seguidos aceptados (o perfiles públicos). Testeado con role no-superuser en PGlite.
- **Perfil público/privado**: el perfil público muestra las reseñas recientes del usuario — RLS las oculta si es privado y no le sigues (gate real, no solo UI).
- **Historial TV Time**: Ajustes ya tenía "Comentarios de TV Time" y "Insignias de TV Time" (verificado).
- **Puntuaciones y páginas externas**: bloque "Puntuaciones" en fichas de serie/peli/episodio con nota TMDB + enlaces directos a IMDb (por imdb_id), FilmAffinity y Rotten Tomatoes. (Nota: FA y RT no tienen API pública para traer el número; con una key de OMDb podríamos añadir la nota de IMDb/RT nativa.)
- **Recuperar contraseña**: "¿Olvidaste tu contraseña?" en el login (envía email vía Resend) + pantalla `/reset-password` que consume el enlace y cambia la contraseña.

## LO QUE TIENES QUE HACER TÚ (en orden)

0. **⚠️ SPA fallback (URGENTE):** tu deploy usa `wrangler deploy --assets` por CLI, y ese flag NO permite configurar el not-found handling (por eso no aparece en el dashboard). Ya hay un `apps/mobile/wrangler.jsonc` real en el repo (name=watchhoard, SPA fallback activado). Solo cambia el **Deploy command** en el dashboard (Settings → Build → Build configuration) a:
   ```
   cd apps/mobile && npx wrangler deploy
   ```
   (deja el Build command como está). El próximo push despliega con fallback SPA: recargar /profile, /show/x o abrir el enlace del email de reset dejará de dar 404.

1. **SQL**: Supabase → SQL Editor → pega y ejecuta `supabase/migrations/0007_phase4_social_plus.sql`
   (o `docs/supabase/APPLY_ALL.sql` entero, es idempotente). Sin esto: comentarios de episodio, feed de amigos, géneros en cloud y subida de avatar fallan en silencio.
2. **Supabase → Authentication → URL Configuration**:
   - Site URL: `https://watchhoard.com`
   - Redirect URLs: añade `https://watchhoard.com/reset-password` (y `http://localhost:8081/reset-password` para dev).
3. **Push** (desde tu terminal de Windows, como siempre):
   ```
   cd "Desktop\Proyectos independientes\WatchHoard\watchhoard"
   git add -A && git commit -m "phase 4: episode comments, activity feed, calendar, genres, posters, banners, profile custom, password reset"
   git push
   ```
   Cloudflare Pages reconstruye y despliega solo.
4. Entra con tu cuenta y verifica: nombre "Luis Salet" en el perfil, sin chip de importado, sube avatar, elige banner.

## Notas técnicas
- Migración `0007`: CHECK de `content_reviews` acepta 'episode'; tabla `activity_events` + RLS (visible para el propio actor, perfiles públicos y seguidores aceptados); columnas `genres` en `app_shows`/`app_movies`; policies de Storage para el bucket `avatars` (el bucket ya está creado vía API).
- Los géneros se guardan como ids TMDB (CSV) y se traducen al idioma de la app al pintar.
- El backfill de géneros corre al enfocar Series/Películas (lotes de 5, máx 60 por visita) — con tu biblioteca grande tarda unas visitas en completarse.
- Todo tsc-clean (strict) y validado: migración 0007 en PGlite (idempotente + RLS enforcement), persistencia web (MemorySource round-trip), paridad i18n EN=ES (316 claves).

---

# Fase 4b — Importador real + auditoría (2026-07-08 tarde)

## El importador que pediste ("Reimportar = volver a pedir el archivo")
Tenías razón: "reimportar" recargaba un seed EMBEBIDO en la app (en la web deployada = vacío) sin pedir nada. Ahora existe el importador de verdad, dentro de la app:

- **Nueva pantalla `/import`** (Ajustes → "Importar de TV Time", y CTA en el perfil si tu biblioteca está vacía):
  1. Te lleva a **gdpr.tvtime.com/gdpr/self-service** para pedir tu export oficial (te llega un .zip por email).
  2. **Te pide el .zip de TU ordenador** con un selector de archivos.
  3. Lo descomprime y parsea EN TU NAVEGADOR (cero dependencias, nada se sube a ningún servidor) y carga todo en tu cuenta (cloud) o en el dispositivo (local).
- Portado el parser completo del CLI con todos sus gotchas (dedup de slugs de pelis, favoritos, listas Go-map, nb_episodes_seen, reloj de TV Time).
- **Validado contra tu export real**: mismo resultado exacto que el importer CLI (462 series, 14.611 episodios, 1.059 pelis vistas + 163 pendientes con los datos actuales, 71 favoritos, 2 listas, insignias, reloj). E2E con recarga y persistencia en verde.
- Los pósters y géneros se rellenan solos tras importar (backfill progresivo vía TMDB al navegar por Series/Películas).
- En cloud, importar sube tu historial a TU cuenta (RLS) por lotes de 500.
- Móvil nativo: por ahora muestra aviso de "importa desde la web" (elegir archivo en nativo necesita expo-document-picker; pendiente).

## Auditoría (más cosas del estilo "no asumir nada")
- **"Exportar mis datos" estaba ROTO igual que reimportar**: descargaba el seed embebido, no tus datos. Ahora exporta en vivo desde tu fuente de datos real (perfil, series, pelis, recientes, listas con items, reseñas, insignias) con fecha en el nombre.
- **Pantalla 404 propia** (`+not-found.tsx`) para rutas desconocidas (verás la de verdad cuando actives el fallback SPA, ver paso 0).
- Recordatorio del **paso 0 (404 al recargar /profile etc.)**: es config de Cloudflare, no de código — activa `not_found_handling = "single-page-application"` (dashboard del Worker o wrangler.jsonc; ejemplo en `apps/mobile/wrangler.example.jsonc`).

## Pasos manuales (siguen pendientes, en orden)
1. Cloudflare: fallback SPA (paso 0 arriba) → arregla el 404 al recargar y el enlace del email de reset.
2. Supabase SQL Editor: ejecuta `supabase/migrations/0007_phase4_social_plus.sql` → sin esto fallan comentarios de episodio, feed de amigos, subida de avatar y géneros en cloud.
3. Supabase Auth → URL Configuration: Site URL `https://watchhoard.com` + redirect `https://watchhoard.com/reset-password`.
4. Commit + push desde Windows y prueba el importador en watchhoard.com con tu zip.

## Fix de pósters post-import (2026-07-08 noche)
Síntoma: tras importar en la web, la biblioteca mostraba fotos aleatorias (paisajes, puentes) en vez de pósters. Causa doble: (1) el import in-app crea filas SIN póster (antes venían horneados en seed.json por el paso enrich del CLI) y el backfill perezoso iba a 60 items por visita — ridículo para ~1.700; (2) el placeholder `posterFor` usaba picsum.photos (fotos random) — parecía que la app encontraba pósters EQUIVOCADOS.

Arreglo:
- `posterFor` ahora es una tarjeta neutra oscura con la inicial del título (SVG data-uri, sin red).
- Nuevo `src/posterSweep.ts`: barrido masivo de TODOS los pósters+géneros que falten (concurrencia 8, ~2-4 min para tu biblioteca), integrado en el import con barra de progreso ("Buscando los pósters de tu biblioteca… n/total") y botón "Continuar en segundo plano". El perfil también lo lanza solo si detecta pósters faltantes (tu caso actual: al redeployar y abrir el perfil, se rellenará todo automáticamente).

## Sprint de paridad TV Time (2026-07-09 madrugada)
Revisión completa contra TV Time/Trakt/Simkl y features resueltas:
- **Perfil limpio:** badges y comentarios de TV Time fuera del perfil — viven SOLO en Ajustes → historial TV Time (como acordamos).
- **"A continuación" (el corazón de TV Time):** nueva pestaña por defecto en Series — cada serie que estás viendo muestra su SIGUIENTE episodio sin ver (banner, TxxExx, nombre) con check de un toque que avanza al siguiente. Rueda de temporadas automática, solo episodios emitidos.
- **Buscador y orden en tu biblioteca:** caja de búsqueda + toggle Recientes/A-Z en Series→Todas y Películas→Todas (imprescindible con 462 series).
- **Gestión de listas completa:** crear lista (inline), guardar/quitar series y pelis desde sus fichas (icono lista junto al corazón), renombrar, borrar lista y quitar items (modo Editar en el detalle). Local + web + cloud.
- **Compartir:** botón share en fichas de serie/peli y perfiles públicos (Web Share API con fallback a copiar enlace).

Pendiente conocido (anotado, no bloqueante para MVP): historial propio de visionados (los marcados nuevos no alimentan "recientes"), rewatch, notificaciones push, import desde Trakt.

## Ronda 2 de paridad (2026-07-09)
- **Historial de visionados VIVO**: todo lo que marcas (episodio suelto, temporada, watch-next, película) se registra ya en tu historial. Nueva pantalla `/history` agrupada por día + carrusel "Actividad reciente" en el perfil. Antes el historial solo contenía lo importado de TV Time.
- **Estados de serie desde la ficha**: chips Viendo / En pausa / Archivada (como los follow-states de TV Time); se reflejan en las categorías de tu biblioteca. Nuevo `setShowState` en las 3 fuentes.
- **Stats: "Tus géneros más vistos"** — top 10 con barras, ponderado por episodios vistos (series) + pelis vistas. Usa los géneros que la app ya rellena sola. TV Time no tiene esto ni gratis ni de pago.
- **PWA instalable**: manifest + icono (logo WH dorado) + `app/+html.tsx` con meta OG/Twitter para que los enlaces compartidos tengan preview decente. En móvil, "Añadir a pantalla de inicio" ahora instala la app a pantalla completa.

## Rewatch de películas (2026-07-09)
Al pulsar el check de una peli YA vista, sale el diálogo "¿La has vuelto a ver?" con: **"La he vuelto a ver"** (suma rewatch, actualiza la fecha, entra al historial y al feed de amigos) o **"Marcar como no vista"**. La ficha muestra "Vista N veces". Requiere pegar `0008_movie_rewatch.sql` en el SQL Editor (una línea, idempotente).

## Fix: barras de progreso al 50% (2026-07-09)
Causa: el import in-app no traía el meta TMDB de las series (total_episodes, tmdb_status, last_aired, network) — eso lo hacía el paso "meta" del CLI. Sin total, `progress()` cae al fallback 0.5 (la barra a la mitad, amarilla) y las categorías salen todas "Viendo".
Fix triple, sin coste extra de red: `tvLite` ahora devuelve también el meta (mismo response de TMDB); el sweep de pósters rellena el meta de cualquier serie que no lo tenga (tu biblioteca se repara sola al abrir el perfil, ~1-2 min en segundo plano); y la ficha de serie sincroniza el meta al abrirla (además mantiene fresco el estado Returning→Ended y los totales cuando salen temporadas nuevas).

## Notas visibles en Puntuaciones (2026-07-09)
Las fichas (serie/peli/episodio) muestran ahora la NOTA de cada fuente, no solo enlaces:
- **TMDB** ★ (ya la teníamos) y **IMDb** ★ con nº de votos — IMDb sale sin configurar nada (API comunitaria keyless api.imdbapi.dev, funciona hasta por episodio).
- **Rotten Tomatoes % y Metacritic**: aparecen si añades una key GRATIS de OMDb (omdbapi.com/apikey.aspx, 1.000 peticiones/día): ponla como `EXPO_PUBLIC_OMDB_KEY` en `apps/mobile/.env` y añádela también al Build command de Cloudflare (junto a las otras EXPO_PUBLIC_*). Sin key, RT queda como enlace.
- **FilmAffinity** no tiene API pública — siempre enlace (a su búsqueda).
Cada chip abre la página de la fuente al tocarlo.
