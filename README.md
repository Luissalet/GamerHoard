# GamerHoard

Biblioteca **local** de videojuegos para usar desde Faustus mediante MCP stdio. No hay web, cuenta, dominio, Supabase ni servicio en segundo plano. Requiere Node.js 20 o posterior; no necesita `npm install`.

## Conectar a Faustus

Faustus puede cargar [`faustus-plugin.json`](./faustus-plugin.json) con `GAMERHOARD_DIR` apuntando a este repositorio. Para un cliente MCP manual, configura `command: node` y `args: ["C:/ruta/GamerHoard/mcp/server.mjs"]`. Ejecuta `npm start` para probarlo por stdio; el cliente MCP lo iniciará normalmente por sí mismo.

La biblioteca se guarda en `~/.gamerhoard/library.json` (`C:\\Users\\<usuario>\\.gamerhoard\\library.json` en Windows). Puedes cambiar la ubicación con `GAMERHOARD_DATA_FILE` en el entorno del proceso MCP. Este archivo es la **única fuente de verdad** y no está en el repositorio. Cópialo para hacer una copia de seguridad; usa `gamer_export_json` para una exportación estructurada. Las exportaciones crean archivos nuevos y nunca sobreescriben.

## Herramientas

- `gamer_list`, `gamer_get`: buscar y consultar la biblioteca, con filtros de estado, favorito y plataforma.
- `gamer_add`, `gamer_update`: añadir manualmente y registrar estado, valoración 1–10, notas, favorito, plataformas propias, etiquetas, horas y progreso.
- `gamer_dlc`: registrar expansiones y completarlas.
- `gamer_stats`, `gamer_backlog`: resumen y sugerencias deterministas de tus pendientes.
- `gamer_search_catalog`, `gamer_add_from_catalog`: metadatos opcionales de RAWG. Configura `RAWG_API_KEY` en el entorno de Faustus para habilitarlos. La biblioteca funciona sin clave ni conexión.
- `gamer_import_steam`: recibe un SteamID64 y una Steam Web API key **en esa llamada**; consulta la biblioteca pública y añade juegos y minutos jugados. La clave no se guarda en el JSON ni se escribe en logs. Los juegos ya presentes se conservan. Steam requiere Internet y que sus ajustes de privacidad permitan consultar la biblioteca.
- `gamer_import_json`, `gamer_export_json`: importación aditiva y exportación. Acepta exportaciones de GamerHoard y el formato `watchhoard-export` de la antigua app; las entradas ya presentes se omiten.

Estados: `backlog`, `playing`, `paused`, `completed`, `dropped`. Las operaciones no destructivas conservan los datos existentes. El código anterior de Expo y Supabase permanece recuperable en el historial Git, pero no forma parte del producto activo. No se toca el proyecto remoto ni los `.env` ignorados.

## Verificar

```powershell
npm test
```
