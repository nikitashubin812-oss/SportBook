-- Избранные площадки арендаторов
-- Выполните в pgAdmin (Query Tool), подключившись к базе sportbook

CREATE TABLE IF NOT EXISTS favorite_venues (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_favorite_user_venue UNIQUE (user_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_venues_user_id ON favorite_venues(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_venues_venue_id ON favorite_venues(venue_id);
