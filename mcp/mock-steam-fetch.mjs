// Loaded only by the stdio MCP test subprocess. It never contacts Steam.
globalThis.fetch = async (url) => {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://partner.steam-api.com' ||
      parsed.pathname !== '/ISteamUserStats/GetPlayerAchievements/v1/' ||
      parsed.searchParams.get('steamid') !== '76561198000000000' ||
      parsed.searchParams.get('appid') !== '620' ||
      parsed.searchParams.get('key') !== 'synthetic-test-key') {
    throw new Error('Unexpected Steam request');
  }
  return new Response(process.env.GAMERHOARD_MOCK_STEAM_JSON,
    { status: 200, headers: { 'Content-Type': 'application/json' } });
};
