class BookingError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

class SeatNotFoundError extends BookingError {
  constructor(seatId) {
    super(`Seat with ID ${seatId} does not exist or does not belong to the selected show.`, 404);
  }
}

class SeatUnavailableError extends BookingError {
  constructor(seatIds) {
    const ids = Array.isArray(seatIds) ? seatIds.join(', ') : seatIds;
    super(`One or more requested seats (${ids}) are currently locked or booked by another transaction.`, 409);
  }
}

class VersionConflictError extends BookingError {
  constructor(seatId) {
    super(`A optimistic concurrency conflict occurred while locking seat ID ${seatId}.`, 409);
  }
}

class BookingExpiredError extends BookingError {
  constructor(bookingId) {
    super(`The reservation hold for Booking ID ${bookingId} has expired and cannot be confirmed.`, 410);
  }
}

export {
  BookingError,
  SeatNotFoundError,
  SeatUnavailableError,
  VersionConflictError,
  BookingExpiredError,
};