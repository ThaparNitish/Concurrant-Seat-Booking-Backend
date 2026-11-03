class SeatLockingStrategy {
  /**
   * Lock a collection of seats atomically under the active transaction client.
   * @param {Object} client - The pg connection client (inside transaction block)
   * @param {number} showId - The ID of the show
   * @param {number[]} seatIds - Array of seat IDs (pre-sorted to mitigate deadlocks)
   * @param {number} lockDurationSeconds - Duration of the hold in seconds
   * @returns {Promise<void>}
   */
  async lockSeats(client, showId, seatIds, lockDurationSeconds) {
    throw new Error('lockSeats() method must be implemented by concrete subclass.');
  }
}

export default SeatLockingStrategy;