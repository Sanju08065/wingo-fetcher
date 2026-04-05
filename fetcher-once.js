#!/usr/bin/env node
/**
 * Single-pass fetcher for GitHub Actions.
 * Fetches latest WinGo 30s results and stores unique records to Firebase.
 */

require("dotenv").config();
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
});

const db = admin.firestore();

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Origin": "https://91appv.com",
  "Referer": "https://91appv.com/",
};

async function run() {
  const url = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?ts=${Date.now()}`;
  const res = await fetch(url, { headers: HEADERS });
  const json = await res.json();
  const list = json?.data?.list || [];

  let newCount = 0;
  for (const r of list) {
    const num = Number(r.number);
    const id = String(r.issueNumber);
    const docRef = db.collection("wingo_30s").doc(id);
    const existing = await docRef.get();
    if (!existing.exists) {
      await docRef.set({
        issueNumber: id,
        number: num,
        color: r.color || "",
        premium: r.premium || "",
        size: num >= 5 ? "Big" : "Small",
        parity: num % 2 === 0 ? "Even" : "Odd",
        gameType: "30s",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      newCount++;
    }
  }

  console.log(`✅ Fetched ${list.length}, saved ${newCount} new records`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
