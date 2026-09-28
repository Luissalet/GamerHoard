// Loaded only by the stdio MCP test subprocess. It never contacts Steam.
globalThis.fetch = async (url) => {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://api.steampowered.com' ||
      !['/ISteamUserStats/GetPlayerAchievements/v1/', '/ISteamUserStats/GetSchemaForGame/v2/', '/IPlayerService/GetOwnedGames/v1/'].includes(parsed.pathname) ||
      (parsed.pathname.includes('GetPlayerAchievements') && parsed.searchParams.get('steamid') !== '76561198000000000') ||
      (parsed.pathname.includes('GetOwnedGames') && parsed.searchParams.get('steamid') !== '76561198000000000') ||
      (!parsed.pathname.includes('GetOwnedGames') && parsed.searchParams.get('appid') !== '620') ||
      parsed.searchParams.get('key') !== 'synthetic-test-key') {
    throw new Error('Unexpected Steam request');
  }
  const payload = JSON.parse(process.env.GAMERHOARD_MOCK_STEAM_JSON);
  return new Response(JSON.stringify(parsed.pathname.includes('GetSchemaForGame') ?
    (payload.schema || { game: {} }) : parsed.pathname.includes('GetOwnedGames') ? payload.owned : payload),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
};
