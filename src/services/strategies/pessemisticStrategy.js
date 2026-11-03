
import { SeatNotFoundError, SeatUnavailableError } from '../../errors/bookingErrors.js';
import SeatLockingStrategy from './seatLockingStrategy.js';

class PessimisticStrategy extends SeatLockingStrategy {
  /**
   * Implements pessimistic locking strategy using SELECT ... FOR UPDATE.
   */
  async lockSeats(client, showId, seatIds, lockDurationSeconds) {
    // Crucial: Sort seat IDs ascending to enforce consistent lock acquisition order.
    // This eliminates potential deadlock scenarios between overlapping concurrent lock requests.
    const sortedSeatIds = [...seatIds].sort((a, b) => a - b);

    // 1. Fetch seats and acquire row locks in consistent sorted order.
    const result = await client.query(
      `SELECT id, status, lock_expires_at
       FROM seats
       WHERE id = ANY($1) AND show_id = $2
       ORDER BY id ASC
       FOR UPDATE;`,
      [sortedSeatIds, showId]
    );

    const dbSeats = result.rows;

    // Validate existence of all requested seats
    if (dbSeats.length !== sortedSeatIds.length) {
      const foundIds = dbSeats.map((s) => s.id);
      const missingId = sortedSeatIds.find((id) => !foundIds.includes(id));
      throw new SeatNotFoundError(missingId);
    }

    // Check availability of each seat
    const now = new Date();
    const unavailableSeatIds = [];

    for (const seat of dbSeats) {
      const isHoldExpired =
        seat.status === 'LOCKED' &&
        seat.lock_expires_at &&
        new Date(seat.lock_expires_at) < now;

      const isAvailable = seat.status === 'AVAILABLE' || isHoldExpired;

      if (!isAvailable) {
        unavailableSeatIds.push(seat.id);
      }
    }

    if (unavailableSeatIds.length > 0) {
      throw new SeatUnavailableError(unavailableSeatIds);
    }

    // 2. Perform the update to transition seats to LOCKED state with expiration
    const expiryTimestamp = new Date(now.getTime() + lockDurationSeconds * 1000);
    await client.query(
      `UPDATE seats
       SET status = 'LOCKED', lock_expires_at = $1
       WHERE id = ANY($2);`,
      [expiryTimestamp, sortedSeatIds]
    );
  }
}

export default new PessimisticStrategy();