require("dotenv").config();
const handler = require("./api/fetch");

function makeRes() {
  return {
    setHeader() {},
    status(code) {
      return {
        json: (data) => {
          console.log(`\n✅ Status: ${code}`);
          const preview = { ...data, results: data.results?.slice(0, 3) };
          console.log(JSON.stringify(preview, null, 2));
        },
        end: () => console.log(`Status: ${code} END`),
      };
    },
  };
}

async function run() {
  console.log("🚀 Testing fetch.js — fetching from WinGo API + saving to Firebase...\n");

  await handler(
    { method: "GET", query: { game: "30s", limit: "20" } },
    makeRes()
  );

  process.exit(0);
}

run().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
