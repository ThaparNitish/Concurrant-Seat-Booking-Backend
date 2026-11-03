import SeatLockingStrategy from './seatLockingStrategy.js';
import {
  SeatNotFoundError,
  SeatUnavailableError,
  VersionConflictError,
} from '../../errors/bookingErrors.js';

class OptimisticStrategy extends SeatLockingStrategy {
  /**
   * Implements optimistic locking strategy using version checks.
   */
  async lockSeats(client, showId, seatIds, lockDurationSeconds) {
    // 1. Read status and version of requested seats (no lock acquired)
    const result = await client.query(
      `SELECT id, status, lock_expires_at, version
       FROM seats
       WHERE id = ANY($1) AND show_id = $2;`,
      [seatIds, showId]
    );

    const dbSeats = result.rows;

    // Validate existence of all requested seats
    if (dbSeats.length !== seatIds.length) {
      const foundIds = dbSeats.map((s) => s.id);
      const missingId = seatIds.find((id) => !foundIds.includes(id));
      throw new SeatNotFoundError(missingId);
    }

    // Validate availability of all seats
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

    // 2. Perform conditional version-checked updates for each seat.
    // If any update affects 0 rows, a concurrency conflict has occurred.
    const expiryTimestamp = new Date(now.getTime() + lockDurationSeconds * 1000);

    for (const seat of dbSeats) {
      const updateResult = await client.query(
        `UPDATE seats
         SET status = 'LOCKED', lock_expires_at = $1, version = version + 1
         WHERE id = $2 AND version = $3;`,
        [expiryTimestamp, seat.id, seat.version]
      );

      if (updateResult.rowCount === 0) {
        // Concurrency conflict: another client updated the version since we read it
        throw new VersionConflictError(seat.id);
      }
    }
  }
}

export default new OptimisticStrategy();