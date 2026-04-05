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

async function fetchFromGameAPI(game) {
  const gameCode = GAME_TYPES[game] || GAME_TYPES["30s"];
  const url = `https://draw.ar-lottery01.com/WinGo/${gameCode}/GetHistoryIssuePage.json?ts=${Date.now()}`;
  const res = await fetch(url, { headers: HEADERS });
  const json = await res.json();
  const list = json?.data?.list || [];

  return list.map((r) => {
    const num = Number(r.number);
    return {
      issueNumber: String(r.issueNumber),
      number: num,
      color: r.color || "",
      premium: r.premium || "",
      size: num >= 5 ? "Big" : "Small",
      parity: num % 2 === 0 ? "Even" : "Odd",
      gameType: game,
      fetchedAt: Date.now(),
    };
  });
}

async function saveToFirebase(results, game) {
  const col = `wingo_${game}`;
  let newCount = 0;
  for (const item of results) {
    const docRef = db.collection(col).doc(item.issueNumber);
    const existing = await docRef.get();
    if (!existing.exists) {
      await docRef.set({
        ...item,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      newCount++;
    }
  }
  return newCount;
}

async function readFromFirebase(game, limit = 500) {
  const col = `wingo_${game}`;
  const snapshot = await db
    .collection(col)
    .orderBy("issueNumber", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((d) => d.data());
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const game = req.query?.game || "30s";
  const limit = parseInt(req.query?.limit || "500");

  try {
    const fresh = await fetchFromGameAPI(game);
    const newCount = fresh.length ? await saveToFirebase(fresh, game) : 0;
    const stored = await readFromFirebase(game, limit);

    return res.status(200).json({
      success: true,
      game,
      fetched: fresh.length,
      newSaved: newCount,
      total: stored.length,
      results: stored,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
