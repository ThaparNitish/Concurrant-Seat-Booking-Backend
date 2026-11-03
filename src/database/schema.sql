DROP TABLE IF EXISTS booking_seats CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS seats CASCADE;
DROP TABLE IF EXISTS shows CASCADE;
DROP TABLE IF EXISTS idempotency_keys CASCADE;

CREATE TABLE shows (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE seats (
    id SERIAL PRIMARY KEY,
    show_id INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    row_name VARCHAR(10) NOT NULL,
    seat_number INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, LOCKED, BOOKED
    lock_expires_at TIMESTAMP WITH TIME ZONE,
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT unique_show_seat UNIQUE (show_id, row_name, seat_number)
);

CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    show_id INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, CONFIRMED, CANCELLED, EXPIRED
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE booking_seats (
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    seat_id INTEGER NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
    PRIMARY KEY (booking_id, seat_id)
);

-- Distributed transaction-safe API Idempotency storage
CREATE TABLE idempotency_keys (
    user_id VARCHAR(100) NOT NULL,
    key VARCHAR(255) NOT NULL,
    request_path VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL, -- PENDING, SUCCESS
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, key)
);

-- Optimize high concurrency search and status updates
CREATE INDEX idx_seats_show_status ON seats(show_id, status);

-- Conditional partial index for fast scanning of actively locked seats
CREATE INDEX idx_seats_lock_expiry ON seats(lock_expires_at) WHERE status = 'LOCKED';

-- Conditional partial index for fast scanning of pending bookings
CREATE INDEX idx_bookings_expiry ON bookings(expires_at) WHERE status = 'PENDING';

-- Seed Mock Data
-- 1. Create a Show
INSERT INTO shows (title, start_time) VALUES ('Inception - 15th Anniversary IMAX', NOW() + INTERVAL '2 hours');

-- 2. Populate 50 seats (Rows A to E, Seats 1 to 10)
DO $$
DECLARE
    row_arr VARCHAR[] := ARRAY['A', 'B', 'C', 'D', 'E'];
    r VARCHAR;
    s INTEGER;
BEGIN
    FOREACH r IN ARRAY row_arr LOOP
        FOR s IN 1..10 LOOP
            INSERT INTO seats (show_id, row_name, seat_number, status, version)
            VALUES (1, r, s, 'AVAILABLE', 1);
        END LOOP;
    END LOOP;
END $$;