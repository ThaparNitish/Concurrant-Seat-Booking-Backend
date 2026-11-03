import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

db.on("error", (err) => {
  console.error("Unexpected database error:", err);
});

export default db;