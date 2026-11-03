import db from '../config/db.js';

class EventController {
  /**
   * Retrieves structural layout and status of seats for a specific event show.
   */
  async getSeats(req, res) {
    try {
      const showId = Number(req.params.id);
      if (isNaN(showId)) {
        return res.status(400).json({ error: 'Invalid event/show ID parameter.' });
      }

      // 1. Check if the show exists
      const showResult = await db.query(
        'SELECT id, title, start_time FROM shows WHERE id = $1;',
        [showId]
      );

      if (showResult.rowCount === 0) {
        return res.status(404).json({ error: `Event with ID ${showId} was not found.` });
      }

      const show = showResult.rows[0];

      // 2. Fetch the seats and order them by Row and Number
      const seatsResult = await db.query(
        `SELECT id, row_name AS "row", seat_number AS "number", status, lock_expires_at, version
         FROM seats
         WHERE show_id = $1
         ORDER BY row_name ASC, seat_number ASC;`,
        [showId]
      );

      // Perform inline clean evaluation of lock expiration for API consumers
      const now = new Date();
      const seats = seatsResult.rows.map((s) => {
        const isHoldExpired =
          s.status === 'LOCKED' &&
          s.lock_expires_at &&
          new Date(s.lock_expires_at) < now;

        return {
          id: s.id,
          row: s.row,
          number: s.number,
          status: isHoldExpired ? 'AVAILABLE' : s.status,
          version: s.version,
        };
      });

      return res.status(200).json({
        eventId: show.id,
        eventTitle: show.title,
        startTime: show.start_time,
        seats,
      });
    } catch (err) {
      console.error('Error fetching event seats map:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default new EventController();