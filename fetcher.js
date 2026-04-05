#!/usr/bin/env node
/**
 * WinGo Fetcher — runs 24/7
 * Fetches WinGo results every 30s and stores unique records to Firebase.
 */

require("dotenv").config();
const admin = require("firebase-admin");
const fetch = require("node-fetch");

// ── Firebase init ──────────────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
});

const db = admin.firestore();

// ── Config ─────────────────────────────────────────────────────────────
const GAMES = {
  "30s": "WinGo_30S",
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://91appv.com",
  "Referer": "https://91appv.com/",
};

const INTERVAL_MS = 30 * 1000; // 30 seconds

// ── Fetch from WinGo API ───────────────────────────────────────────────
async function fetchGame(game) {
  const gameCode = GAMES[game];
  const url = `https://draw.ar-lottery01.com/WinGo/${gameCode}/GetHistoryIssuePage.json?ts=${Date.now()}`;
  const res = await fetch(url, { headers: HEADERS });
  const json = await res.json();
  return json?.data?.list || [];
}

// ── Save unique records to Firebase ───────────────────────────────────
async function saveUnique(game, list) {
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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      newCount++;
    }
  }

  return newCount;
}

// ── Main loop ──────────────────────────────────────────────────────────
async function run() {
  console.log(`[${new Date().toISOString()}] 🚀 WinGo Fetcher started`);

  while (true) {
    for (const game of Object.keys(GAMES)) {
      try {
        const list = await fetchGame(game);
        const saved = await saveUnique(game, list);
        if (saved > 0) {
          console.log(`[${new Date().toISOString()}] ✅ ${game} → fetched ${list.length}, saved ${saved} new`);
        }
      } catch (err) {
        console.error(`[${new Date().toISOString()}] ❌ ${game} error: ${err.message}`);
      }
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

run();
