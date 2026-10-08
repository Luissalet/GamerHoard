# Activity recaps

Ask Faustus: “What did I play from September 30 to October 5, and which game took
the most time?” `gamer_activity` computes the answer from the local dated sessions.

```json
{"from":"2026-09-30","to":"2026-10-05","limit":5}
```

Both endpoints are inclusive. A date is a complete UTC day; a timestamp must
include a timezone. Returned `period` endpoints are normalized UTC timestamps,
or null when omitted. A session belongs to its recorded timestamp's UTC day;
its duration is not split over midnight. There is no automatic background tracker.

The response has `source: "logged_sessions"`, `totals` (minutes, sessions,
games and distinct days), `games` ranked by minutes descending, and `days` in
date order. Equal playtime is ordered by title then ID. `gamesTruncated` states
whether `limit` omitted games. Totals and daily rows include all matching sessions,
even those for games omitted from the ranking. Zero-minute sessions still count
as recorded sessions and days. Days with no sessions are omitted.

Imported Steam or manually entered lifetime time has no historical timestamp:
it is excluded. The recap does not imply that the whole account's activity was
tracked. Repeating a read changes no files. Correcting a session with its stable
`sessionId` changes the next recap, including its date if corrected. IDs are scoped
to a game: the same session ID on two games represents two records.

## En español

Pide un resumen entre fechas y los juegos a los que más tiempo dedicaste.
Cuenta solo las sesiones registradas dentro del período, agrupadas por día UTC.
Las fechas son inclusivas; una hora concreta debe llevar zona horaria. Las horas
históricas de Steam o introducidas a mano no se atribuyen a un período inventado.
El límite recorta juegos, nunca los totales ni los días. El resumen es de lectura;
para corregir una sesión, usa `gamer_log_session` con su mismo identificador.

## References

The idea draws on the activity-recap pattern in [Steam Replay](https://steamcommunity.com/games/593110/announcements/detail/641297020996289524)
and dated-session aggregates in [GameActivity for Playnite](https://github.com/Lacro59/playnite-gameactivity-plugin).
This is an original implementation, with no copied upstream code, new dependency
or online service.
