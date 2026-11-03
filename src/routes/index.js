import { Router } from "express";
import seatRoutes from "./seat.routes.js";
import bookingRoutes from "./booking.routes.js";

const router = Router();

router.use("/seats", seatRoutes);
router.use("/bookings", bookingRoutes);

export default router;