const admin = require("firebase-admin");
const fetch = require("node-fetch");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const db = admin.firestore();

const GAME_TYPES = {
  "30s": "WinGo_30S",
  "1min": "WinGo",
  "3min": "WinGo_3Min",
  "5min": "WinGo_5Min",
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://draw.ar-lottery01.com",
  "Referer": "https://draw.ar-lottery01.com/",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

async function fetchAndStore(game) {
  const gameCode = GAME_TYPES[game];
  const url = `https://draw.ar-lottery01.com/WinGo/${gameCode}/GetHistoryIssuePage.json?ts=${Date.now()}`;
  const res = await fetch(url, { headers: HEADERS });
  const json = await res.json();
  const list = json?.data?.list || [];

  const col = `wingo_${game}`;
  let newCount = 0;

  for (const r of list) {
    const num = Number(r.number);
    const id = String(r.issueNumber);
    const docRef = db.collection(col).doc(id);
    const existing = await docRef.get();
    if (!existing.exists) {
      await docRef.set({
        issueNumber: id,
        number: num,
        color: r.color || "",
        premium: r.premium || "",
        size: num >= 5 ? "Big" : "Small",
        parity: num % 2 === 0 ? "Even" : "Odd",
        gameType: game,
        fetchedAt: Date.now(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      newCount++;
    }
  }

  return { game, fetched: list.length, newSaved: newCount };
}

module.exports = async (req, res) => {
  // Vercel cron auth check
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Fetch all game types in parallel
    const results = await Promise.all(
      Object.keys(GAME_TYPES).map((game) => fetchAndStore(game))
    );

    console.log("[CRON]", new Date().toISOString(), results);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (err) {
    console.error("[CRON ERROR]", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
