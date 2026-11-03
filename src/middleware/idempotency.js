import crypto from "node:crypto";
import db from "../config/db.js";

/**
 * Transaction-safe Distributed Idempotency middleware for POST /bookings
 */
const idempotency = async (req, res, next) => {
  const idempotencyKey = req.headers['x-idempotency-key'];
  const userId = req.headers['x-user-id'] || req.body.userId;

  // If no idempotency key is provided, skip checks (not enforcing but recommended)
  if (!idempotencyKey) {
    return next();
  }

  if (!userId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'X-User-Id header or userId in body is required when using an idempotency key.',
    });
  }

  // 1. Generate deterministic SHA-256 hash of sorted request body
  const sortedBody = JSON.stringify(req.body, Object.keys(req.body).sort());
  const requestHash = crypto.createHash('sha256').update(sortedBody).digest('hex');
  const requestPath = req.originalUrl || req.path;

  try {
    // 2. Try inserting a PENDING lock record for this user's key
    const insertResult = await db.query(
      `INSERT INTO idempotency_keys (user_id, key, request_path, request_hash, status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       ON CONFLICT (user_id, key) DO NOTHING
       RETURNING status;`,
      [userId, idempotencyKey, requestPath, requestHash]
    );

    // If rowCount === 1, we successfully acquired the key lock (we are the winner)
    if (insertResult.rowCount === 1) {
      // Intercept the Express response to record final outcome
      const originalJson = res.json;
      const originalSend = res.send;
      let responseBody = null;

      res.json = function (body) {
        responseBody = body;
        return originalJson.apply(this, arguments);
      };

      res.send = function (body) {
        if (!responseBody) {
          try {
            responseBody = JSON.parse(body);
          } catch (e) {
            responseBody = body;
          }
        }
        return originalSend.apply(this, arguments);
      };

      // When the request finishes sending response
      res.on('finish', async () => {
        const statusCode = res.statusCode;
        // Commit only on successful locks (200 OK or 201 Created)
        if (statusCode >= 200 && statusCode < 300) {
          await db.query(
            `UPDATE idempotency_keys
             SET status = 'SUCCESS', response_status = $1, response_body = $2
             WHERE user_id = $3 AND key = $4;`,
            [statusCode, JSON.stringify(responseBody), userId, idempotencyKey]
          );
        } else {
          // If transaction failed or parameter error occurred, release lock so user can retry
          await db.query(
            `DELETE FROM idempotency_keys
             WHERE user_id = $1 AND key = $2;`,
            [userId, idempotencyKey]
          );
        }
      });

      return next();
    }

    // 3. If insertResult.rowCount === 0, someone else holds this key (sequential or concurrent)
    const checkResult = await db.query(
      `SELECT status, request_hash, response_status, response_body
       FROM idempotency_keys
       WHERE user_id = $1 AND key = $2;`,
      [userId, idempotencyKey]
    );

    if (checkResult.rows.length === 0) {
      // Extremely rare edge case (another request deleted it between conflict and check)
      return res.status(500).json({ error: 'Idempotency state collision, please retry.' });
    }

    const existingRecord = checkResult.rows[0];

    // Payload Mismatch Verification
    if (existingRecord.request_hash !== requestHash) {
      return res.status(400).json({
        error: 'Idempotency Key Conflict',
        message: 'A request with the same key but different payload details was previously submitted.',
      });
    }

    // Happy Path: Returning cached result
    if (existingRecord.status === 'SUCCESS') {
      return res.status(existingRecord.response_status).json(existingRecord.response_body);
    }

    // Race Path: Status is PENDING, wait for winner to finish
    if (existingRecord.status === 'PENDING') {
      let attempts = 0;
      const maxAttempts = 6;
      const delayMs = 300;

      const pollStatus = async () => {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        const pollResult = await db.query(
          `SELECT status, response_status, response_body
           FROM idempotency_keys
           WHERE user_id = $1 AND key = $2;`,
          [userId, idempotencyKey]
        );

        if (pollResult.rows.length > 0) {
          const row = pollResult.rows[0];
          if (row.status === 'SUCCESS') {
            return res.status(row.response_status).json(row.response_body);
          }
        }

        if (attempts < maxAttempts) {
          return pollStatus();
        } else {
          return res.status(409).json({
            error: 'Conflict',
            message: 'A concurrent request using this idempotency key is already being processed. Please retry shortly.',
          });
        }
      };

      return pollStatus();
    }
  } catch (err) {
    console.error('Idempotency middleware unhandled failure:', err);
    return res.status(500).json({ error: 'Internal Server Error during idempotency validation.' });
  }
};

export default idempotency;