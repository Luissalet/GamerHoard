# steam-auth — "Sign in through Steam"

Public Edge Function that runs the Steam OpenID login and reads the user's owned
games with the **developer's** Steam Web API key (held server-side). Users no
longer create an API key or paste a profile — they just log in.

## One-time setup

1. Install deps. `expo-web-browser` (the in-app browser used for the login) is
   already pinned in `apps/mobile/package.json` **and** the root
   `package-lock.json`, so a plain install at the repo root is enough:
   ```
   npm install
   ```
   Don't run `npx expo install expo-web-browser` — it would rewrite the lock and
   desync CI. Note: it ships inside Expo Go, but a custom native build needs a
   rebuild to pick it up.

2. Set the function secrets on your Supabase project:
   ```
   supabase link --project-ref jfbvovwrmpenrbnqauxt      # if not linked yet
   supabase secrets set \
     STEAM_WEB_API_KEY=YOUR_STEAM_KEY \
     STEAM_AUTH_SECRET=$(openssl rand -hex 32)
   ```
   - `STEAM_WEB_API_KEY` → https://steamcommunity.com/dev/apikey (one key, yours)
   - `STEAM_AUTH_SECRET` → any random string; signs the SteamID (HMAC) between the
     login step and the games fetch so your key can't be spent by strangers.
   - Optional: `STEAM_ALLOWED_HOSTS=gamerhoard.pages.dev` to restrict which web
     origins may be used as the OpenID redirect target (the native `gamerhoard://`
     scheme and `localhost` are always allowed).

3. Deploy (JWT off — Steam calls this endpoint with no auth header):
   ```
   supabase functions deploy steam-auth --no-verify-jwt
   ```

## Flow

```
app  ──▶ /steam-auth?app=<redirect>                     start   → 302 to Steam login
Steam ─▶ /steam-auth?app=<redirect>&openid.*=…          callback→ verify, 302 back to
                                                                  <redirect>#sid&exp&sig
app  ──▶ /steam-auth?stage=games&sid&exp&sig            games   → GetOwnedGames (server
                                                                  key) → JSON library
```

The default flow requires **Steam → Edit Profile → Privacy → "Game details" =
Public**, otherwise Steam returns an empty library (the client shows `errPrivate`).

## Manual fallback (private profiles)

The import screen hides a secondary "Prefer to keep your profile private? Use an
API key" option. That posts the user's **own** Steam key + profile:

```
app ──▶ POST /steam-auth  {mode:"manual", key, profile}  → resolve + GetOwnedGames → JSON
```

A key can always read its owner's library even when private, so this works for
private profiles. The key is sent once (POST body, not the URL) and is **not**
stored server-side; the client remembers it locally for convenience.
