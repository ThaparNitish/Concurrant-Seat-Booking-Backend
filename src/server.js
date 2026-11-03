
import "dotenv/config";
import express from "express";
import cors from "cors";

import db from "./config/db.js";
import routes from "./routes/index.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Seat Booking API is running",
  });
});

app.use("/api", routes);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Verify database connectivity
    await db.query("SELECT 1");

    console.log("Database connected successfully");

    // Start server only after successful DB connection
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Failed to start application:", error.message);
    await db.end();
    process.exit(1);
  }
};

startServer();
