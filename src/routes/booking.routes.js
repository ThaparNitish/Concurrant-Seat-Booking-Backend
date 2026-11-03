import { Router } from "express";
import Joi from "joi";

import validate from "../middleware/validate.js";
import idempotency from "../middleware/idempotency.js";
import bookingController from "../controllers/booking.controller.js";

const router = Router();

// Request validation schema for initiating seat reservations
const lockSeatsSchema = Joi.object({
    showId: Joi.number().integer().positive().required(),

    seatIds: Joi.array()
    .items(Joi.number().integer().positive())
    .min(1)
    .unique()
    .required(),

    userId: Joi.string().trim().max(100).required(),

    strategy: Joi.string()
    .valid("pessimistic", "optimistic")
    .default("pessimistic"),
});

// POST /bookings - Initiate booking hold
router.post("/", validate(lockSeatsSchema), idempotency, bookingController.lockSeats.bind(bookingController));

// POST /bookings//confirm - Confirm booking
router.post("/:id/confirm", bookingController.confirmBooking.bind(bookingController));

// DELETE /bookings/ - Cancel booking
router.delete("/:id", bookingController.cancelBooking.bind(bookingController));

// POST /bookings/release-expired - Release expired holds
router.post("/release-expired", bookingController.releaseExpired.bind(bookingController));

// POST /bookings/reset - Development/test database reset
router.post("/reset", bookingController.resetDatabase.bind(bookingController));

export default router;