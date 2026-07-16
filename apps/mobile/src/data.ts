// Domain types (mirror the Postgres schema) + demo data.
// The demo profile is seeded with the REAL numbers reconstructed from the TV Time import,
// so the app shows "your data, already here."
export type FollowState = 'watching' | 'stopped' | 'archived';
export interface Show { id: string; title: string; poster: string; network?: string; status?: string; seasons?: number; matchPct?: number; }
export interface UpNext { show: Show; season: number; episode: number; behind: number; title: string; badges: ('premiere'|'new'|'last')[]; }
export interface EpisodeRow { id: string; season: number; number: number; abs: number; title: string; watched: boolean; still: string; }

const img = (seed: string) => `https://picsum.photos/seed/${seed}/300/450`;

export const demoProfile = {
  handle: 'luissalet',
  following: 6, followers: 5, comments: 3,
  seriesClock: '8mo 23d 22h',   // reconstructed from the real export (matches the app)
  episodes: 14611,
  moviesClock: '2mo 21d 3h',
  movies: 1059,
  showsAdded: 462,
};

export const upNext: UpNext[] = [
  { show: { id: '80761', title: 'The 100 Girlfriends', poster: img('gf100') }, season: 3, episode: 1, behind: 0, title: 'My Cousin Girlfriend', badges: ['premiere','new'] },
  { show: { id: 'xmen97', title: "X-Men '97", poster: img('xmen97') }, season: 2, episode: 1, behind: 2, title: 'Days of Past Future', badges: ['premiere','new'] },
  { show: { id: 'drstone', title: 'Dr. Stone', poster: img('drstone') }, season: 4, episode: 37, behind: 0, title: 'Ushers of an Exhilarating Future', badges: ['last'] },
  { show: { id: 'onepiece', title: 'One Piece (2023)', poster: img('onepiece') }, season: 2, episode: 3, behind: 5, title: 'Whiskey Business', badges: [] },
  { show: { id: 'voxmachina', title: 'The Legend of Vox Machina', poster: img('vox') }, season: 4, episode: 1, behind: 11, title: 'One Year Later…', badges: ['premiere'] },
  { show: { id: 'kakegurui', title: 'Kakegurui', poster: img('kakegurui') }, season: 1, episode: 3, behind: 21, title: 'Slit-Eyed Woman', badges: [] },
];

export const moviePosters: Show[] = ['shrek5','avengers','enola3','supergirl','toystory5','mando','sheep','devil2','glhf','wicked','avatar3','ratatouille']
  .map((s, i) => ({ id: s, title: s, poster: img(s + i) }));

export const showDetail: { show: Show; episodes: EpisodeRow[] } = {
  show: { id: 'drstone', title: 'Dr. Stone', poster: img('drstone'), network: 'Tokyo MX', status: 'Ended', seasons: 4, matchPct: 99 },
  episodes: [
    { id: 'e1', season: 1, number: 1, abs: 1, title: 'Stone World', watched: true, still: img('ds1') },
    { id: 'e2', season: 1, number: 2, abs: 2, title: 'King of the Stone World', watched: true, still: img('ds2') },
    { id: 'e3', season: 1, number: 3, abs: 3, title: 'Weapons of Science', watched: true, still: img('ds3') },
    { id: 'e4', season: 1, number: 4, abs: 4, title: 'Fire the Smoke Signal', watched: true, still: img('ds4') },
    { id: 'e5', season: 1, number: 5, abs: 5, title: 'A Kingdom of Science', watched: false, still: img('ds5') },
  ],
};
