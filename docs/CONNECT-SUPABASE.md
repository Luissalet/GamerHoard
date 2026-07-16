# Conectar Watch Hoard a Supabase (modo nube)

La app funciona en **dos modos**, elegidos por una variable de entorno:

- `EXPO_PUBLIC_BACKEND=local` (por defecto) → 100% on-device, sin cuenta, sin red. Nada cambia.
- `EXPO_PUBLIC_BACKEND=supabase` → tu biblioteca vive en tu Supabase, con cuentas y sync entre dispositivos.

El interruptor está en **`apps/mobile/.env`** (es el `.env` que lee la app). Vuelves a `local` cuando quieras.

> **Cómo funciona por dentro:** todas las pantallas hablan con una interfaz `DataSource`.
> En local la implementa `LocalSource` (SQLite) / `MemorySource` (web); en nube la implementa
> `SupabaseSource` contra tablas por-usuario (`app_*`) con RLS. La identidad social (cuentas,
> `@handle`, amigos, comentarios) vive en la tabla `profiles` del esquema `0001`.

---

## Paso 1 — Aplicar el esquema en Supabase (una vez)

El Postgres directo (5432) no es accesible desde mi entorno, así que el esquema se aplica
pegando el SQL en el editor de Supabase:

1. Abre el **SQL Editor**: https://supabase.com/dashboard/project/mqguraohfkncwtzfvkfd/sql/new
2. Abre `watchhoard/docs/supabase/APPLY_ALL.sql`, **copia todo**, pégalo y pulsa **Run**.

Crea el esquema social (`0001`) + RLS (`0002`), las **8 tablas de la app** (`0003`) y el
**registro de cuentas** (`0004`: trigger de perfiles + `is_handle_available`).

> Es para una base **recién creada**. Si al re-ejecutar se queja de "already exists", ejecuta
> solo las idempotentes: `0003_app_user_data.sql` y `0004_accounts.sql`.

Comprueba en **Table Editor** que aparecen las tablas `app_*` y `profiles`.

---

## Paso 2 — Activar el backend de nube

1. Instala dependencias (añadí `@react-native-async-storage/async-storage` para la sesión):
   ```bash
   cd watchhoard
   npm install
   ```
2. En **`apps/mobile/.env`** (¡ojo, NO es `watchhoard/.env`!) pon:
   ```
   EXPO_PUBLIC_BACKEND=supabase
   ```
   (La URL y la clave publishable ya están ahí.)

> **Dos archivos `.env`, a propósito:**
> - `apps/mobile/.env` → lo lee la app (solo `EXPO_PUBLIC_*`, todo client-safe).
> - `watchhoard/.env` → lo lee el importer (aquí vive la **secret key**, nunca en la app).

---

## Paso 3 — Arrancar y crear tu cuenta

Arranca **desde la raíz del monorepo** con los scripts (montan Expo dentro de `apps/mobile`).
**No** uses `npx expo start` desde `watchhoard/` — Metro se montaría mal y fallaría con
`Unable to resolve "../../App"`.

```bash
cd watchhoard
npm run web         # o: npm run mobile
```

**Acceso instantáneo (sin verificar email)** — recomendado para probar:
en el panel → **Authentication → Sign In / Providers → Email** → desactiva **Confirm email** → Save.

En la pantalla de registro elige tu **@usuario** (te dice en vivo si está libre), un nombre
(opcional), email y contraseña. Al crear la cuenta entras directo.

> Si dejas *Confirm email* activado, tras registrarte hay que pulsar el enlace del correo y luego
> iniciar sesión. El registro igual crea tu perfil; solo cambia el momento de entrar.

Entrarás con una cuenta vacía (0 series/pelis). Normal: falta subir tus datos (Paso 4).

---

## Paso 4 — Subir tu biblioteca (14.611 episodios, 462 series, 1.059 pelis)

Tu `seed.json` se sube a tu cuenta con la **secret key** (solo servidor, ya está en `watchhoard/.env`).

1. Tu **user id**: panel → **Authentication → Users** (o pasa tu email y el script lo resuelve).
2. Push:
   ```bash
   cd watchhoard/packages/importer
   npx tsx src/run.ts push luismasc16@gmail.com
   ```

El push **borra y reescribe** tus filas, así que es seguro re-ejecutarlo.

---

## Paso 5 — Verificar

Recarga la app. Verás tu **Continue Watching**, estadísticas (relojes "8mo 23d 22h"), pelis y
badges, servidos desde tu Supabase. Marca un episodio y compruébalo en el **Table Editor**.

Edita tu perfil en **Ajustes → tu @usuario** (nombre, bio, avatar, público/privado) o cierra sesión.

---

## Cuentas — cómo funciona

El registro crea un usuario de Supabase Auth **y** una fila en `profiles` (con `@handle` único),
que es la identidad a la que apuntan comentarios, amigos y listas. Un trigger
`on_auth_user_created` la crea desde los metadatos del registro y **garantiza un handle único**
(si "luis" está pillado, genera "luis1"). La disponibilidad se consulta con `is_handle_available`.

Siguiente (Fase 3): comentarios y amigos, ya con esta base de cuentas + RLS lista.

---

## Volver a local

En `apps/mobile/.env`: `EXPO_PUBLIC_BACKEND=local`. La app vuelve a on-device sin tocar nada más.

---

## Seguridad (el repo será open-source)

- `keys.txt`, `datos supabase/`, ambos `.env` y `apps/mobile/assets/seed.json` están gitignoreados. **No se suben.**
- La **publishable key** (`sb_publishable_…`) va en el cliente: es segura, la RLS protege los datos.
- La **secret key** (`sb_secret_…`) es SOLO para el `push` del importer (servidor). Nunca en el bundle.

---

## Social: seguidores, valoraciones y reseñas

Todo esto lo crea `0005` (incluida en `APPLY_ALL.sql`). No requiere pasos extra: aplica el SQL y ya.

**Seguidores (modelo Instagram/Twitter):**
- Tu perfil (@usuario, nombre, avatar) es **descubrible** por cualquiera desde el buscador → pestaña *Personas*.
- **Público** (Ajustes → Perfil público ON): cualquiera te sigue al instante y ve tu actividad.
- **Privado** (OFF): seguir crea una **solicitud**; hasta que la aceptas (Cuenta → *Solicitudes de seguimiento*), esa persona no ve tus reseñas.
- En un perfil: botón Seguir / Siguiendo / Solicitado y contadores de seguidores/siguiendo (tocar → lista).

**Valoraciones y reseñas:**
- En la ficha de cualquier serie o peli (abajo, sección *Valoraciones*): pon **estrellas (1-5)** y/o escribe una **reseña**, con opción de marcar **spoiler**.
- Ves la **media** y el número de valoraciones, y las **reseñas de otras personas** (con avatar, @usuario, estrellas, like ❤️, y los spoilers ocultos hasta tocar).
- Respeta privacidad: solo ves reseñas de cuentas públicas, tuyas, o de quien sigues (si es privada).

Las series se identifican por su id de TVDB y las pelis por su uuid (`tmdb:…`), así que funciona con cualquier título sin precargar catálogo.
