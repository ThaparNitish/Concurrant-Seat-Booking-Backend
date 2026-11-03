import bookingLockService from '../services/booking.service.js';
import { BookingError } from '../errors/bookingErrors.js';
import logger from '../utils/logger.js';
import db from '../config/db.js';

class BookingController {
  /**
   * Initiate a booking (acquire holds)
   * POST /bookings
   */
  async lockSeats(req, res) {
    const start = performance.now();
    const { showId, seatIds, userId, strategy = 'pessimistic' } = req.body;

    try {
      const parsedShowId = Number(showId);
      const parsedSeatIds = seatIds.map(Number);
      const chosenStrategy = strategy.toLowerCase();

      // Invoke core transactional reservation service
      const result = await bookingLockService.lockSeats(
        parsedShowId,
        parsedSeatIds,
        chosenStrategy
      );

      const durationMs = performance.now() - start;

      // Structured JSON log for success audit
      logger.info('Booking hold request succeeded', {
        action: 'lock_seats',
        userId,
        showId: parsedShowId,
        seatIds: parsedSeatIds,
        seatCount: parsedSeatIds.length,
        strategyUsed: chosenStrategy,
        bookingId: result.bookingId,
        durationMs: Number(durationMs.toFixed(3)),
      });

      return res.status(201).json(result);
    } catch (err) {
      const durationMs = performance.now() - start;
      const statusCode = err instanceof BookingError ? err.statusCode : 500;

      // Structured JSON log for error audit
      logger.warn('Booking hold request failed', {
        action: 'lock_seats',
        userId,
        showId,
        seatIds,
        seatCount: seatIds ? seatIds.length : 0,
        strategyUsed: strategy,
        error: err.message,
        statusCode,
        durationMs: Number(durationMs.toFixed(3)),
      });

      if (err instanceof BookingError) {
        return res.status(err.statusCode).json({ error: err.message });
      }

      console.error('Unhandled failure inside lockSeats controller:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Confirm booking payment
   * POST /bookings/:id/confirm
   */
  async confirmBooking(req, res) {
    try {
      const bookingId = Number(req.params.id);
      if (isNaN(bookingId)) {
        return res.status(400).json({ error: 'Invalid booking ID parameter. Must be an integer.' });
      }

      const result = await bookingLockService.confirmBooking(bookingId);
      return res.status(200).json(result);
    } catch (err) {
      if (err instanceof BookingError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Unhandled failure inside confirmBooking controller:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Cancel booking (release holds/booked status)
   * DELETE /bookings/:id
   */
  async cancelBooking(req, res) {
    try {
      const bookingId = Number(req.params.id);
      if (isNaN(bookingId)) {
        return res.status(400).json({ error: 'Invalid booking ID parameter. Must be an integer.' });
      }

      const result = await bookingLockService.cancelBooking(bookingId);
      return res.status(200).json(result);
    } catch (err) {
      console.error('Unhandled failure inside cancelBooking controller:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Trigger hold locks cleanup
   * POST /bookings/release-expired
   */
  async releaseExpired(req, res) {
    try {
      const result = await bookingLockService.releaseExpiredLocks();
      return res.status(200).json(result);
    } catch (err) {
      console.error('Unhandled failure inside releaseExpired controller:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /**
   * Environment-gated route to wipe reservations and reset seats for clean integration tests
   * POST /bookings/reset
   */
  async resetDatabase(req, res) {
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      return res.status(404).json({ error: 'Not Found' });
    }

    try {
      await db.query('BEGIN');
      await db.query('DELETE FROM booking_seats;');
      await db.query('DELETE FROM bookings;');
      await db.query('DELETE FROM idempotency_keys;');
      await db.query("UPDATE seats SET status = 'AVAILABLE', lock_expires_at = NULL, version = 1;");
      await db.query('COMMIT');

      logger.info('Database has been reset to clean state for test run');
      return res.status(200).json({ status: 'RESET_SUCCESS' });
    } catch (err) {
      await db.query('ROLLBACK');
      console.error('Failed to reset test database:', err);
      return res.status(500).json({ error: 'Failed to reset database.' });
    }
  }
}

export default new BookingController();