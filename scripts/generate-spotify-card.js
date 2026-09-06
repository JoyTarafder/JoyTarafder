// Fetches your current (or most recent) Spotify track and writes an SVG card
// to spotify/now-playing.svg. Run by .github/workflows/spotify.yml on a schedule.
//
// Requires three environment variables (set as GitHub Actions secrets):
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
//   SPOTIFY_REFRESH_TOKEN
//
// Needs Node 18+ (built-in fetch). The workflow already sets this up.

const fs = require("fs");
const path = require("path");

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } =
  process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
  console.error(
    "Missing one of SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN"
  );
  process.exit(1);
}

async function getAccessToken() {
  const basic = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to refresh access token: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function getNowPlaying(token) {
  const res = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    { headers: { Authorization: `Bearer ${token}` } }
  );

  // 204 = nothing currently playing
  if (res.status === 204 || !res.ok) return null;

  const data = await res.json();
  if (!data || !data.item) return null;

  return { item: data.item, isPlaying: Boolean(data.is_playing) };
}

async function getRecentlyPlayed(token) {
  const res = await fetch(
    "https://api.spotify.com/v1/me/player/recently-played?limit=1",
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const track = data.items && data.items[0] && data.items[0].track;
  if (!track) return null;

  return { item: track, isPlaying: false };
}

function escapeXml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Trim long titles/artists so they don't overflow the fixed-width card.
function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + "…";
}

function buildSvg({ title, artist, isPlaying }) {
  const statusText = isPlaying ? "Listening now" : "Last played";
  const statusColor = isPlaying ? "#1DB954" : "#8a8a8a";
  const safeTitle = escapeXml(truncate(title, 40));
  const safeArtist = escapeXml(truncate(artist, 50));

  return `<svg width="440" height="120" viewBox="0 0 440 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify ${statusText}: ${safeTitle} by ${safeArtist}">
  <rect width="440" height="120" rx="14" fill="#191414"/>
  <circle cx="36" cy="60" r="20" fill="#1DB954"/>
  <path d="M27 52c9-3 17-3 26 1M28 60c8-2.5 15-2.5 22 0.5M29 68c6-1.5 12-1.5 18 0.5"
        stroke="#191414" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  <text x="68" y="42" fill="${statusColor}" font-family="Verdana, sans-serif" font-size="13" font-weight="bold">${statusText}</text>
  <text x="68" y="68" fill="#ffffff" font-family="Verdana, sans-serif" font-size="17" font-weight="bold">${safeTitle}</text>
  <text x="68" y="90" fill="#b3b3b3" font-family="Verdana, sans-serif" font-size="13">${safeArtist}</text>
</svg>`;
}

(async () => {
  try {
    const token = await getAccessToken();

    let result = await getNowPlaying(token);
    if (!result) {
      result = await getRecentlyPlayed(token);
    }

    const title = result?.item?.name ?? "Nothing found";
    const artist =
      result?.item?.artists?.map((a) => a.name).join(", ") ??
      "Play something on Spotify!";
    const isPlaying = Boolean(result?.isPlaying);

    const svg = buildSvg({ title, artist, isPlaying });

    const outDir = path.join(process.cwd(), "spotify");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "now-playing.svg"), svg, "utf8");

    console.log(`Wrote spotify/now-playing.svg — "${title}" by ${artist}`);
  } catch (err) {
    console.error("Failed to generate Spotify card:", err);
    process.exit(1);
  }
})();
