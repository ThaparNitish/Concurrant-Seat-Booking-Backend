import db from '../config/db.js';
import optimisticStrategy from './strategies/optimisticStrategy.js';
import { BookingExpiredError } from '../errors/bookingErrors.js';
import pessimisticStrategy from './strategies/pessemisticStrategy.js';


const LOCK_DURATION_SECONDS = Number(process.env.LOCK_DURATION_SECONDS) || 300; // Configurable hold window

class BookingLockService {
  constructor() {
    this.strategies = {
      pessimistic: pessimisticStrategy,
      optimistic: optimisticStrategy,
    };
  }

  /**
   * Acquire hold locks on seats and create a pending booking record.
   * Runs atomically inside a transaction.
   */
  async lockSeats(showId, seatIds, strategyName = 'pessimistic') {
    const strategy = this.strategies[strategyName.toLowerCase()];
    if (!strategy) {
      throw new Error(`Invalid locking strategy requested: ${strategyName}`);
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Perform idempotent release of expired holds inline before trying to lock
      await this._releaseExpiredLocksWithClient(client);

      // 2. Delegate the seat locking logic to the chosen strategy
      await strategy.lockSeats(client, showId, seatIds, LOCK_DURATION_SECONDS);

      // 3. Create a pending booking record
      const expiryTimestamp = new Date(Date.now() + LOCK_DURATION_SECONDS * 1000);
      const bookingResult = await client.query(
        `INSERT INTO bookings (show_id, status, expires_at)
         VALUES ($1, 'PENDING', $2)
         RETURNING id;`,
        [showId, expiryTimestamp]
      );
      const bookingId = bookingResult.rows[0].id;

      // 4. Create seat mapping in the junction table
      for (const seatId of seatIds) {
        await client.query(
          `INSERT INTO booking_seats (booking_id, seat_id)
           VALUES ($1, $2);`,
          [bookingId, seatId]
        );
      }

      await client.query('COMMIT');
      return {
        bookingId,
        expiresAt: expiryTimestamp,
        strategyUsed: strategyName.toLowerCase(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Transition seats to BOOKED and booking status to CONFIRMED.
   * Uses row-level locking (FOR UPDATE) to serialize updates.
   */
  async confirmBooking(bookingId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock the booking row row-level to serialize confirmation attempts
      const bookingResult = await client.query(
        `SELECT id, status, expires_at
         FROM bookings
         WHERE id = $1
         FOR UPDATE;`,
        [bookingId]
      );

      if (bookingResult.rowCount === 0) {
        throw new Error(`Booking reservation ID ${bookingId} not found.`);
      }

      const booking = bookingResult.rows[0];
      const now = new Date();

      // Check if hold has expired
      if (booking.status !== 'PENDING' || new Date(booking.expires_at) < now) {
        throw new BookingExpiredError(bookingId);
      }

      // 2. Confirm the booking
      await client.query(
        `UPDATE bookings
         SET status = 'CONFIRMED'
         WHERE id = $1;`,
         [bookingId]
      );

      // 3. Confirm status of all associated seats to BOOKED
      const seatsResult = await client.query(
        `SELECT seat_id FROM booking_seats WHERE booking_id = $1;`,
        [bookingId]
      );
      const seatIds = seatsResult.rows.map((r) => r.seat_id);

      if (seatIds.length > 0) {
        await client.query(
          `UPDATE seats
           SET status = 'BOOKED', lock_expires_at = NULL, version = version + 1
           WHERE id = ANY($1);`,
          [seatIds]
        );
      }

      await client.query('COMMIT');
      return {
        bookingId,
        status: 'CONFIRMED',
        confirmedAt: now,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel a booking (pending or confirmed) and release all associated seats.
   * Runs atomically inside a transaction.
   */
  async cancelBooking(bookingId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock the booking row row-level to serialize updates
      const bookingResult = await client.query(
        `SELECT id, status
         FROM bookings
         WHERE id = $1
         FOR UPDATE;`,
        [bookingId]
      );

      if (bookingResult.rowCount === 0) {
        throw new Error(`Booking reservation ID ${bookingId} not found.`);
      }

      const booking = bookingResult.rows[0];

      // If already cancelled, treat as idempotent success
      if (booking.status === 'CANCELLED') {
        await client.query('COMMIT');
        return { bookingId, status: 'CANCELLED' };
      }

      // 2. Fetch associated seats and revert status to AVAILABLE
      const seatsResult = await client.query(
        `SELECT seat_id FROM booking_seats WHERE booking_id = $1;`,
        [bookingId]
      );
      const seatIds = seatsResult.rows.map((r) => r.seat_id);

      if (seatIds.length > 0) {
        await client.query(
          `UPDATE seats
           SET status = 'AVAILABLE', lock_expires_at = NULL, version = version + 1
           WHERE id = ANY($1) AND status IN ('LOCKED', 'BOOKED');`,
          [seatIds]
        );
      }

      // 3. Set booking status to CANCELLED
      await client.query(
        `UPDATE bookings
         SET status = 'CANCELLED'
         WHERE id = $1;`,
        [bookingId]
      );

      await client.query('COMMIT');
      return {
        bookingId,
        status: 'CANCELLED',
        cancelledAt: new Date(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Public interface to trigger cleanup of expired bookings and seats.
   */
  async releaseExpiredLocks() {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const stats = await this._releaseExpiredLocksWithClient(client);
      await client.query('COMMIT');
      return stats;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Idempotent internal logic running inside a transaction context.
   */
  async _releaseExpiredLocksWithClient(client) {
    // 1. Transition expired bookings to EXPIRED and release locked seats atomically via CTE
    const expiredBookingsResult = await client.query(
      `WITH expired_bookings AS (
         UPDATE bookings
         SET status = 'EXPIRED'
         WHERE status = 'PENDING' AND expires_at < NOW()
         RETURNING id, show_id
       ),
       released_seats AS (
         UPDATE seats
         SET status = 'AVAILABLE', lock_expires_at = NULL, version = version + 1
         WHERE id IN (
           SELECT seat_id
           FROM booking_seats
           WHERE booking_id IN (SELECT id FROM expired_bookings)
         ) AND status = 'LOCKED'
         RETURNING id, show_id
       )
       SELECT show_id, count(*)::integer as seat_count
       FROM released_seats
       GROUP BY show_id;`
    );

    // 2. Fallback: Catch any orphaned seats that are LOCKED but have no booking or have expired
    const orphanedSeatsResult = await client.query(
      `UPDATE seats
       SET status = 'AVAILABLE', lock_expires_at = NULL, version = version + 1
       WHERE status = 'LOCKED' AND lock_expires_at < NOW()
       RETURNING show_id;`
    );

    // Merge group results
    const stats = {};

    expiredBookingsResult.rows.forEach((r) => {
      stats[r.show_id] = (stats[r.show_id] || 0) + Number(r.seat_count);
    });

    orphanedSeatsResult.rows.forEach((r) => {
      stats[r.show_id] = (stats[r.show_id] || 0) + 1;
    });

    const statsArray = Object.keys(stats).map((showId) => ({
      show_id: Number(showId),
      seat_count: stats[showId],
    }));

    return statsArray;
  }
}

export default new BookingLockService();