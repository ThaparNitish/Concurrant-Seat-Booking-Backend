import db from "./db.js";

try {
  const result = await db.query("SELECT NOW()");
  console.log("Database connected successfully!");
  console.log(result.rows[0]);

} catch (error) {
  console.error("Database connection failed:", error.message);

} finally {
  await db.end();
}