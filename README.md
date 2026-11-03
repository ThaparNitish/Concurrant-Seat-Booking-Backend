# Concurrency-Safe Seat Booking Backend

A backend system for handling high-concurrency ticket reservations, designed to prevent double-booking, race conditions, and inconsistent database states through PostgreSQL transactional integrity and explicit locking strategies.

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/seat-booking-backend.git
cd seat-booking-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root and configure your PostgreSQL connection details and application environment according to your database configuration.

```env
PORT=5000
NODE_ENV=development

# Configure PostgreSQL connection variables
# to match src/db/index.js
```

### 4. Start the Application

```bash
npm run dev
```

The Express server will start on the configured port.

### 5. Verify the API

Use Postman to test the available REST endpoints.

```http
GET http://localhost:5000/health
```

---

## 🛠️ Technology Stack

- **Node.js** — Asynchronous JavaScript runtime for backend execution.
- **Express.js** — REST API framework for routing, middleware and request handling.
- **PostgreSQL** — Relational database providing transactional integrity and row-level locking.
- **node-postgres (pg)** — PostgreSQL connection pooling and direct SQL transaction management.
- **Joi** — Request payload validation and schema enforcement.
- **node-cron** — Scheduled execution of background hold-expiry operations.
- **Docker** — Not currently required to run the application.

---

## 🎯 Project Goal

This project explores the backend engineering challenges involved in building a high-concurrency ticket and seat reservation system.

When multiple users attempt to reserve the same seats simultaneously, the system must ensure that only one reservation succeeds while maintaining consistent database state.

The primary engineering objectives are:

- Prevent double-booking under concurrent requests.
- Maintain transactional integrity across multi-seat reservations.
- Implement pessimistic and optimistic locking strategies.
- Handle duplicate client requests through idempotency.
- Manage temporary seat reservations and their expiration.
- Ensure safe booking state transitions.

The focus is on understanding database-level concurrency control rather than relying exclusively on application-level checks.

---

## 🧠 Core Engineering Concepts

### 1. Database Transactions

Seat reservation operations use PostgreSQL transactions to ensure that multiple related database changes succeed or fail together.

This prevents partially completed reservations and inconsistent seat states.

### 2. Pessimistic Locking

Uses PostgreSQL's `SELECT ... FOR UPDATE` to acquire row-level locks on requested seats.

When multiple transactions attempt to reserve the same seat, competing transactions must wait for the lock holder to commit or roll back.

This approach is useful when contention for the same resources is expected to be high.

### 3. Optimistic Locking

Uses version-based concurrency control to detect conflicting updates.

A transaction reads the current seat version and verifies that the version remains unchanged when updating the seat.

If another transaction modifies the seat first, the update fails its version condition and the transaction must handle the conflict.

Both strategies are exposed through a configurable booking strategy.

### 4. Idempotency

Implements idempotency middleware for booking creation.

Clients can provide an `X-Idempotency-Key` header to identify a logical booking request.

This helps prevent duplicate bookings caused by network retries or repeated client requests.

### 5. Reservation Expiry

Temporary reservations must not permanently occupy seats when users fail to complete their bookings.

The system includes an expiry workflow to identify expired holds and release their associated seats.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Check application health |
| GET | `/events/:id/seats` | Retrieve seat layout and availability |
| POST | `/bookings` | Create a temporary seat reservation |
| POST | `/bookings/:id/confirm` | Confirm a reservation |
| DELETE | `/bookings/:id` | Cancel a booking |
| POST | `/bookings/release-expired` | Release expired reservations |
| POST | `/bookings/reset` | Reset development/test database state |

### Create a Reservation

`POST /bookings`

Request:

```json
{
  "showId": 1,
  "seatIds": [1, 2],
  "userId": "user_123",
  "strategy": "pessimistic"
}
```

Headers:

```http
Content-Type: application/json
X-Idempotency-Key: unique-request-key
```

Supported strategies:

- `pessimistic`
- `optimistic`

### Confirm a Reservation

`POST /bookings/:id/confirm`

Confirms an existing reservation and transitions its status to `CONFIRMED`.

### Cancel a Booking

`DELETE /bookings/:id`

Cancels a booking and processes the associated seat state according to the booking lifecycle implementation.

---

## 🔍 Design Decisions

**Why PostgreSQL instead of application-level locking?**

Concurrency control needs to work across multiple application instances, not just within a single Node.js process. PostgreSQL provides transaction management and row-level locking at the database level.

**Why individual seat records?**

Individual seat records allow transactions to lock specific resources rather than serializing all reservations through a single event-level availability counter.

**Why support two locking strategies?**

Pessimistic and optimistic locking have different contention characteristics. Supporting both makes it possible to compare their trade-offs and understand when each approach is appropriate.

**Why idempotency?**

Network failures do not necessarily mean that a server-side operation failed. Idempotency allows clients to retry logical requests without unintentionally creating duplicate reservations.

---

## 📌 Project Scope

The project focuses on:

- Transaction-safe multi-seat reservations.
- Database-level concurrency control.
- Configurable locking strategies.
- Idempotent booking creation.
- Booking confirmation and cancellation.
- Background reservation expiry.
- REST API design and request validation.

The implementation is intended as a practical exploration of backend concurrency engineering using Node.js and PostgreSQL.
