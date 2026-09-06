-- ====================================================
-- ВНИМАНИЕ! Перед выполнением этого скрипта:
-- 1. Создайте базу данных sportbook вручную в pgAdmin4
-- 2. Подключитесь к ней
-- 3. Затем выполните этот скрипт
-- ====================================================

-- Или выполните эти команды через psql:
-- CREATE DATABASE sportbook WITH ENCODING = 'UTF8';
-- \c sportbook;

-- ====================================================
-- Создание типов ENUM
-- ====================================================

CREATE TYPE user_role AS ENUM ('renter', 'landlord', 'admin');
CREATE TYPE slot_status AS ENUM ('available', 'booked', 'pending');
CREATE TYPE booking_status AS ENUM ('draft', 'pending_payment', 'payment_uploaded', 'confirmed', 'cancelled', 'dispute');
CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'resolved_renter', 'resolved_landlord');

-- ====================================================
-- Таблица 1: users (Пользователи)
-- ====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role user_role NOT NULL DEFAULT 'renter',
    rating NUMERIC(3,2) DEFAULT 0.00 CHECK (rating >= 0 AND rating <= 5)
);

COMMENT ON TABLE users IS 'Пользователи системы (арендаторы, арендодатели, администраторы)';
COMMENT ON COLUMN users.email IS 'Адрес электронной почты';
COMMENT ON COLUMN users.password IS 'Пароль пользователя';
COMMENT ON COLUMN users.role IS 'Роль: renter (арендатор), landlord (арендодатель), admin (администратор)';
COMMENT ON COLUMN users.rating IS 'Рейтинг пользователя от 0 до 5';

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ====================================================
-- Таблица 2: venues (Площадки)
-- ====================================================
CREATE TABLE venues (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500) NOT NULL,
    city VARCHAR(100) NOT NULL,
    description TEXT,
    sport_types VARCHAR(255) NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    area NUMERIC(10,2) CHECK (area > 0),
    price_per_hour NUMERIC(10,2) NOT NULL CHECK (price_per_hour > 0),
    rating NUMERIC(3,2) DEFAULT 0.00 CHECK (rating >= 0 AND rating <= 5),
    qr_code_path VARCHAR(500)
);

COMMENT ON TABLE venues IS 'Спортивные площадки';
COMMENT ON COLUMN venues.owner_id IS 'ID владельца площадки (арендодателя)';
COMMENT ON COLUMN venues.sport_types IS 'Виды спорта: Футбол, Баскетбол, Волейбол и т.д.';
COMMENT ON COLUMN venues.capacity IS 'Максимальная вместимость игроков';
COMMENT ON COLUMN venues.area IS 'Площадь помещения в м²';
COMMENT ON COLUMN venues.qr_code_path IS 'Путь к QR-коду для оплаты';

CREATE INDEX idx_venues_owner_id ON venues(owner_id);
CREATE INDEX idx_venues_city ON venues(city);
CREATE INDEX idx_venues_rating ON venues(rating);
CREATE INDEX idx_venues_city_sport ON venues(city, sport_types);

-- ====================================================
-- Таблица 3: amenities (Удобства)
-- ====================================================
CREATE TABLE amenities (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL
);

COMMENT ON TABLE amenities IS 'Удобства, доступные на площадках';
COMMENT ON COLUMN amenities.name IS 'Название удобства: раздевалка, душевая, парковка, wi-fi, инвентарь, трибуны';

CREATE INDEX idx_amenities_venue_id ON amenities(venue_id);

-- ====================================================
-- Таблица 4: time_slots (Временные слоты)
-- ====================================================
CREATE TABLE time_slots (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    current_bookings INTEGER DEFAULT 0 CHECK (current_bookings >= 0),
    status slot_status NOT NULL DEFAULT 'available'
);

COMMENT ON TABLE time_slots IS 'Временные слоты для бронирования';
COMMENT ON COLUMN time_slots.current_bookings IS 'Текущее количество бронирований';
COMMENT ON COLUMN time_slots.status IS 'Статус: available (свободен), booked (занят), pending (ожидает)';

CREATE INDEX idx_time_slots_venue_id ON time_slots(venue_id);
CREATE INDEX idx_time_slots_venue_date_time ON time_slots(venue_id, date, start_time);
CREATE INDEX idx_time_slots_status ON time_slots(status);

-- ====================================================
-- Таблица 5: bookings (Бронирования)
-- ====================================================
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    time_slot_id INTEGER NOT NULL REFERENCES time_slots(id) ON DELETE RESTRICT,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    participants_count INTEGER NOT NULL CHECK (participants_count > 0),
    total_price NUMERIC(10,2) NOT NULL CHECK (total_price > 0),
    status booking_status NOT NULL DEFAULT 'draft',
    receipt_path VARCHAR(500),
    receipt_uploaded_at TIMESTAMP,
    confirmed_at TIMESTAMP
);

COMMENT ON TABLE bookings IS 'Бронирования площадок (центральная таблица)';
COMMENT ON COLUMN bookings.user_id IS 'ID арендатора';
COMMENT ON COLUMN bookings.participants_count IS 'Количество участников';
COMMENT ON COLUMN bookings.status IS 'Статус процесса бронирования';
COMMENT ON COLUMN bookings.receipt_path IS 'Путь к чеку об оплате';

CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_venue_id ON bookings(venue_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_user_status ON bookings(user_id, status);
CREATE INDEX idx_bookings_booking_date ON bookings(booking_date);

-- ====================================================
-- Таблица 6: disputes (Споры)
-- ====================================================
CREATE TABLE disputes (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status dispute_status NOT NULL DEFAULT 'open',
    resolution_text TEXT
);

COMMENT ON TABLE disputes IS 'Споры между арендаторами и арендодателями';
COMMENT ON COLUMN disputes.resolved_by IS 'ID администратора, разрешившего спор';
COMMENT ON COLUMN disputes.resolution_text IS 'Текст решения администратора';

CREATE INDEX idx_disputes_booking_id ON disputes(booking_id);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_resolved_by ON disputes(resolved_by);

-- ====================================================
-- Таблица 7: reviews (Отзывы)
-- ====================================================
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT
);

COMMENT ON TABLE reviews IS 'Отзывы пользователей о площадках';
COMMENT ON COLUMN reviews.rating IS 'Оценка от 1 до 5';

CREATE INDEX idx_reviews_venue_id ON reviews(venue_id);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);

-- ====================================================
-- Таблица 8: favorite_venues (Избранные площадки арендатора)
-- ====================================================
CREATE TABLE favorite_venues (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    CONSTRAINT uq_favorite_user_venue UNIQUE (user_id, venue_id)
);

COMMENT ON TABLE favorite_venues IS 'Связь арендатор — избранная площадка';
CREATE INDEX idx_favorite_venues_user_id ON favorite_venues(user_id);
CREATE INDEX idx_favorite_venues_venue_id ON favorite_venues(venue_id);

-- ====================================================
-- Триггеры для автоматического обновления рейтингов
-- ====================================================

-- Функция для обновления рейтинга площадки
CREATE OR REPLACE FUNCTION update_venue_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE venues 
    SET rating = (
        SELECT ROUND(AVG(rating)::NUMERIC, 2) 
        FROM reviews 
        WHERE venue_id = COALESCE(NEW.venue_id, OLD.venue_id)
    )
    WHERE id = COALESCE(NEW.venue_id, OLD.venue_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер после добавления отзыва
CREATE TRIGGER trg_update_venue_rating_insert
AFTER INSERT ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_venue_rating();

-- Триггер после обновления отзыва
CREATE TRIGGER trg_update_venue_rating_update
AFTER UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_venue_rating();

-- Триггер после удаления отзыва
CREATE TRIGGER trg_update_venue_rating_delete
AFTER DELETE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_venue_rating();

-- ====================================================
-- Вставка тестовых данных
-- ====================================================

-- Пользователи (пароли — bcrypt-хеши)
INSERT INTO users (email, password, full_name, phone, role, rating) VALUES
('admin@sportbook.ru', '$2b$12$S3bjOsfVkCHF034JyRBd/OpZAnhdVLOZv4CT5ndIgNKtL4xTfHsNq', 'Администратор Системы', '+79001234567', 'admin', 5.00),
('landlord1@example.com', '$2b$12$kil.hEF6X6aoSyhUKga.wOXhE8Cb92W57mKs0JQIDYuQrEUg6Wxfe', 'Иван Петров', '+79009876543', 'landlord', 4.80),
('landlord2@example.com', '$2b$12$jnJrAPGy7v1Y6DpNt7hyTOa.SYXvQ9ii7IR/Gp/XO32EuMVpEt/XW', 'Мария Иванова', '+79001112233', 'landlord', 4.90),
('renter1@example.com', '$2b$12$1RBH.plBZIH5Ou9xOE6U0.fYzauEn7B4rn4nbSAA56FIdgfWWBU0W', 'Алексей Смирнов', '+79002223344', 'renter', 4.50),
('renter2@example.com', '$2b$12$WeXyVq8oLMpwPSoFMYZot.05NQUcp0VffGjcO.OxQCk7C5wDcwwmu', 'Ольга Соколова', '+79003334455', 'renter', 4.70);

-- Площадки
INSERT INTO venues (owner_id, name, address, city, description, sport_types, capacity, area, price_per_hour, qr_code_path) VALUES
(2, 'Спортивный комплекс "Динамо"', 'Московская улица, 1В', 'Киров', 
    'Современный спортивный комплекс с качественным покрытием и отличным освещением.', 
    'Футбол, Волейбол', 20, 400.00, 1200.00, '/qr/venue_1.png'),
(2, 'Площадка "Сормовская 2"', 'Сормовская улица, 2', 'Киров',
    'Универсальная крытая площадка для игровых видов спорта.',
    'Баскетбол, Волейбол, Футбол', 15, 350.00, 800.00, '/qr/venue_2.png'),
(3, 'Теннисный корт "Олимп"', 'Ленина проспект, 45', 'Киров',
    'Профессиональный теннисный корт с качественным покрытием.',
    'Теннис', 4, 260.00, 1500.00, '/qr/venue_3.png');

-- Удобства
INSERT INTO amenities (venue_id, name) VALUES
(1, 'Раздевалки'),
(1, 'Душевые'),
(1, 'Парковка'),
(1, 'Wi-Fi'),
(1, 'Инвентарь'),
(1, 'Трибуны'),
(2, 'Раздевалки'),
(2, 'Душевые'),
(2, 'Парковка'),
(3, 'Раздевалки'),
(3, 'Парковка'),
(3, 'Инвентарь');

-- Временные слоты (примеры для одной площадки на один день)
INSERT INTO time_slots (venue_id, date, start_time, end_time, current_bookings, status) VALUES
(1, '2025-12-15', '08:00:00', '09:00:00', 0, 'available'),
(1, '2025-12-15', '09:00:00', '10:00:00', 0, 'available'),
(1, '2025-12-15', '10:00:00', '11:00:00', 1, 'booked'),
(1, '2025-12-15', '11:00:00', '12:00:00', 1, 'booked'),
(1, '2025-12-15', '12:00:00', '13:00:00', 0, 'available'),
(1, '2025-12-15', '13:00:00', '14:00:00', 0, 'available'),
(1, '2025-12-15', '14:00:00', '15:00:00', 1, 'pending'),
(1, '2025-12-15', '15:00:00', '16:00:00', 0, 'available');

-- Бронирования
INSERT INTO bookings (venue_id, user_id, time_slot_id, booking_date, start_time, end_time, participants_count, total_price, status, confirmed_at) VALUES
(1, 4, 3, '2025-12-15', '10:00:00', '11:00:00', 10, 1200.00, 'confirmed', CURRENT_TIMESTAMP),
(1, 5, 7, '2025-12-15', '14:00:00', '15:00:00', 8, 1500.00, 'payment_uploaded', NULL);

-- Отзывы
INSERT INTO reviews (venue_id, user_id, booking_id, rating, comment) VALUES
(1, 4, 1, 5, 'Отличная площадка, всё чисто и ухоженно. Удобные раздевалки. Обязательно вернемся!');

-- ====================================================
-- Полезные представления (views)
-- ====================================================

-- Представление: подробная информация о бронированиях
CREATE VIEW v_bookings_detailed AS
SELECT 
    b.id AS booking_id,
    u.full_name AS renter_name,
    u.phone AS renter_phone,
    v.name AS venue_name,
    v.address AS venue_address,
    v.city AS venue_city,
    b.booking_date,
    b.start_time,
    b.end_time,
    b.participants_count,
    b.total_price,
    b.status AS booking_status
FROM bookings b
JOIN users u ON b.user_id = u.id
JOIN venues v ON b.venue_id = v.id;

COMMENT ON VIEW v_bookings_detailed IS 'Подробная информация о бронированиях с данными пользователей и площадок';

-- Представление: статистика по площадкам
CREATE VIEW v_venues_stats AS
SELECT 
    v.id,
    v.name,
    v.city,
    v.rating,
    COUNT(DISTINCT b.id) AS total_bookings,
    COUNT(DISTINCT r.id) AS total_reviews,
    COALESCE(SUM(b.total_price), 0) AS total_revenue
FROM venues v
LEFT JOIN bookings b ON v.id = b.venue_id AND b.status = 'confirmed'
LEFT JOIN reviews r ON v.id = r.venue_id
GROUP BY v.id, v.name, v.city, v.rating;

COMMENT ON VIEW v_venues_stats IS 'Статистика по площадкам: количество бронирований, отзывов и общий доход';

-- ====================================================
-- Полезные функции
-- ====================================================

-- Функция для поиска свободных слотов
CREATE OR REPLACE FUNCTION get_available_slots(
    p_venue_id INTEGER,
    p_date DATE
)
RETURNS TABLE (
    slot_id INTEGER,
    start_time TIME,
    end_time TIME,
    status slot_status
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ts.id,
        ts.start_time,
        ts.end_time,
        ts.status
    FROM time_slots ts
    WHERE ts.venue_id = p_venue_id
        AND ts.date = p_date
        AND ts.status = 'available'
    ORDER BY ts.start_time;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_available_slots IS 'Возвращает список свободных временных слотов для указанной площадки и даты';

-- Пример использования:
-- SELECT * FROM get_available_slots(1, '2025-12-15');

-- ====================================================
-- Полезные SQL-запросы для работы с БД
-- ====================================================

-- Просмотр всех таблиц
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Просмотр структуры таблицы
-- SELECT column_name, data_type, character_maximum_length, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'users';

-- Просмотр всех внешних ключей
-- SELECT
--     tc.table_name AS table_name,
--     kcu.column_name AS column_name,
--     ccu.table_name AS foreign_table_name,
--     ccu.column_name AS foreign_column_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--     ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--     ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY';

-- Просмотр всех индексов
-- SELECT
--     tablename,
--     indexname,
--     indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- ORDER BY tablename, indexname;

-- ====================================================
-- Конец скрипта
-- ====================================================

