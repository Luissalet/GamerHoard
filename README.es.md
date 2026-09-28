# GamerHoard

[English](README.md)

Biblioteca **local** de videojuegos para usar desde Faustus mediante MCP stdio. No hay web, cuenta, dominio, Supabase ni servicio en segundo plano. Requiere Node.js 20 o posterior; no necesita `npm install`.

## Conectar a Faustus

Faustus puede cargar [`faustus-plugin.json`](./faustus-plugin.json) con `GAMERHOARD_DIR` apuntando a este repositorio. Para un cliente MCP manual, configura `command: node` y `args: ["C:/ruta/GamerHoard/mcp/server.mjs"]`. Ejecuta `npm start` para probarlo por stdio; el cliente MCP lo iniciará normalmente por sí mismo.

La biblioteca se guarda en `~/.gamerhoard/library.json` (`C:\\Users\\<usuario>\\.gamerhoard\\library.json` en Windows). Puedes cambiar la ubicación con `GAMERHOARD_DATA_FILE` en el entorno del proceso MCP. Este archivo es la **única fuente de verdad** y no está en el repositorio. Cópialo para hacer una copia de seguridad; usa `gamer_export_json` para una exportación estructurada. Las exportaciones crean archivos nuevos y nunca sobreescriben.

## Herramientas

- `gamer_list`, `gamer_get`: buscar y consultar la biblioteca, con filtros de estado, favorito y plataforma.
- `gamer_add`, `gamer_update`: añadir manualmente y registrar estado, valoración 1–10, notas, favorito, plataformas propias, etiquetas, horas y progreso.
- `gamer_dlc`: registrar expansiones y completarlas.
- `gamer_log_session`, `gamer_sessions`: guardar sesiones locales por juego y consultar su historial. `sessionId` debe ser estable: repetirlo mediante `gamer_log_session` actualiza esa sesión en vez de sumar otra; corregir minutos aplica solo la diferencia al total. `playedAt` requiere ISO 8601 con zona horaria. En `gamer_sessions`, `id` es opcional para consultar toda la biblioteca; `from`/`to` aceptan `YYYY-MM-DD` como día UTC completo o ISO 8601 con zona horaria, con extremos inclusivos. `limit` limita las filas devueltas, mientras `total` y `minutes` cubren todas las sesiones filtradas.
- `gamer_stats`, `gamer_backlog`: resumen y sugerencias deterministas de tus pendientes.
- `gamer_search_catalog`, `gamer_add_from_catalog`: metadatos opcionales de RAWG. Configura `RAWG_API_KEY` en el entorno de Faustus para habilitarlos. La biblioteca funciona sin clave ni conexión.
- `gamer_import_steam`: recibe un SteamID64 y una Steam Web API key **en esa llamada**; consulta la biblioteca pública y añade juegos y minutos jugados. La clave no se guarda en el JSON ni se escribe en logs. Los juegos ya presentes se conservan. Steam requiere Internet y que sus ajustes de privacidad permitan consultar la biblioteca.
- `gamer_import_json`, `gamer_export_json`: importación aditiva y exportación. Acepta exportaciones de GamerHoard y el formato `watchhoard-export` de la antigua app; las entradas ya presentes se omiten.

Estados: `backlog`, `playing`, `paused`, `completed`, `dropped`. Las sesiones se guardan en el JSON local y se incluyen en importación/exportación. El tiempo previo o importado se conserva como base y se suma al total de sesiones; las copias antiguas sin sesiones siguen siendo válidas. La importación de sesiones es aditiva: añade IDs ausentes y conserva los que ya existen, aunque la copia importada tenga una duración anterior. Para corregir una sesión existente, usa `gamer_log_session`. Una exportación que repite `sessionId` dentro del mismo juego se rechaza antes de modificar la biblioteca. Las operaciones no destructivas conservan los datos existentes. El código anterior de Expo y Supabase permanece recuperable en el historial Git, pero no forma parte del producto activo. No se toca el proyecto remoto ni los `.env` ignorados.

## Usarlo desde el chat

Puedes decirle a Faustus: «Registra los 45 minutos que jugué ayer a Outer Wilds», «Corrige esa sesión: fueron 35 minutos» o «¿Cuánto he jugado esta semana y a qué juegos?». Faustus consulta la biblioteca y gestiona los identificadores de las sesiones; no necesitas escribirlos.

## Verificar

```powershell
npm test
```
