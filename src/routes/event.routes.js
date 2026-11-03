import express from 'express';
const router = express.Router();
import eventController from '../controllers/event.controller.js';

router.get('/:id/seats', eventController.getSeats.bind(eventController));

export default router;