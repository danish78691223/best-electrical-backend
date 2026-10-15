import dotenv from "dotenv";
dotenv.config();
import app from "./app.js";
import { connectDb } from "./config/db.js";
import { startMarketingWorker } from "./services/marketingWorker.js";
import dns from "dns";

dns.setServers(["1.1.1.1", "8.8.8.8"]);


const port = process.env.PORT || 5000;
try {
  await connectDb();
} catch (e) {
  console.warn("MongoDB unavailable; using in-memory demo data.", e.message);
}
startMarketingWorker();
app.listen(port, "0.0.0.0", () =>
  console.log(`BEST ELECTRICAL API running on http://localhost:${port}`),
);
