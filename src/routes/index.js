import { Router } from "express";
import bookingRoutes from "./booking.routes.js";
import eventRoutes from "./event.routes.js";

const router = Router();

router.use("/bookings", bookingRoutes);
router.use("/events",eventRoutes);

export default router;