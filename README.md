# Concurrency-Safe Seat Booking Backend

A seat booking backend built around one question: **What happens when multiple users try to reserve the same seat at the same time?**

SeatLock explores concurrency control at the database level, using PostgreSQL transactions and two different locking strategies to handle competing reservations safely.

## What it does

- Reserves multiple seats atomically.
- Supports pessimistic and optimistic locking.
- Uses idempotency keys to handle duplicate booking requests.
- Manages booking confirmation and cancellation.
- Automatically releases expired reservations through a background worker.

## Engineering Decisions

**Why PostgreSQL row-level locking?**

Checking seat availability in application code isn't sufficient when multiple requests execute simultaneously. The database must coordinate competing transactions to prevent conflicting updates.

**Why two locking strategies?**

Pessimistic locking acquires locks before modifying seats. Optimistic locking uses version checks to detect conflicting updates. Implementing both makes their trade-offs easier to understand and evaluate.

**Why idempotency?**

A client retrying a request after a network failure shouldn't accidentally create another reservation. Idempotency keys help make repeated requests safe.

## Tech Stack

`Node.js` · `Express` · `PostgreSQL` · `pg` · `Joi` · `node-cron`

## Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/SeatLock.git
cd SeatLock

npm install
```

Configure your PostgreSQL connection in `.env`, then start the server:

```bash
npm run dev
```

## API Overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/events/:id/seats` | Retrieve seat availability |
| POST | `/bookings` | Reserve seats |
| POST | `/bookings/:id/confirm` | Confirm reservation |
| DELETE | `/bookings/:id` | Cancel booking |
| POST | `/bookings/release-expired` | Release expired holds |

---

Built to understand database concurrency, transaction boundaries, and the trade-offs involved in designing reliable booking systems.
