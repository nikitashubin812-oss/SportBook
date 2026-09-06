// ==================== ДАННЫЕ ПЛОЩАДКИ ====================

let currentVenue = null;
let selectedSlots = [];       // [{date, hour, price}]
let currentWeekStart = null;  // Monday of displayed week
let bookedSlots = {};         // { "YYYY-MM-DD_HH": true }
let rangeAnchor = null;       // {date, hour} — первый клик для диапазона

const DAY_NAMES = ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'];
const WORK_START = 8;
const WORK_END = 22;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

document.addEventListener('DOMContentLoaded', async () => {
    const authBtn = document.getElementById('nav-auth-btn');
    if (authBtn && API.Auth.isAuthenticated()) {
        authBtn.textContent = 'Кабинет';
        authBtn.href = '/cabinet';
    }
    loadVenueData();

    // Скрываем бронирование для арендодателей и администраторов
    if (API.Auth.isAuthenticated()) {
        try {
            const user = await API.getCurrentUser();
            if (user && (user.role === 'landlord' || user.role === 'admin')) {
                const bookBtn = document.getElementById('book-btn');
                const hint = document.querySelector('.booking-hint');
                if (bookBtn) {
                    bookBtn.style.display = 'none';
                }
                if (hint) {
                    hint.textContent = 'Бронирование доступно только арендаторам.';
                }
            }
        } catch {}
    }
});

function getVenueIdFromUrl() {
    const parts = window.location.pathname.split('/');
    return parts[parts.length - 1];
}

async function loadVenueData() {
    const venueId = getVenueIdFromUrl();
    if (!venueId || isNaN(venueId)) {
        window.location.href = '/catalog';
        return;
    }
    try {
        currentVenue = await API.getVenue(venueId);
        displayVenueData(currentVenue);
        if (typeof VenueFavorites !== 'undefined') {
            VenueFavorites.invalidate();
            await VenueFavorites.ensureLoaded();
            initVenueFavoriteButton(Number(venueId));
        }
        loadReviews(venueId);
        if (API.Auth.isAuthenticated()) initReviewForm(venueId);
    } catch (e) {
        console.error('Ошибка загрузки площадки:', e);
        window.location.href = '/catalog';
    }
}

// ==================== ОТОБРАЖЕНИЕ ДАННЫХ ====================

function displayVenueData(venue) {
    document.title = `${venue.name} - SportBook`;
    const bcEl = document.getElementById('breadcrumb-venue-name');
    if (bcEl) bcEl.textContent = venue.name;
    setText('venue-name', venue.name);
    setText('venue-price', venue.price_per_hour ? `${venue.price_per_hour} ₽` : '— ₽');
    setText('venue-city', venue.city || '—');
    setText('venue-address', venue.address || '—');
    setText('venue-sports', venue.sport_types || '—');
    setText('venue-capacity', venue.capacity ? `${venue.capacity} человек` : '—');
    setText('venue-area', venue.area ? `${venue.area} м²` : '—');
    setText('venue-description', venue.description || '—');

    const amenitiesEl = document.getElementById('venue-amenities');
    if (amenitiesEl) {
        if (venue.amenities && venue.amenities.length > 0) {
            amenitiesEl.innerHTML = venue.amenities.map(a => {
                const name = typeof a === 'string' ? a : a.name;
                return `<span class="amenity-tag">${name}</span>`;
            }).join('');
        } else {
            amenitiesEl.innerHTML = '<span class="amenity-none">Удобства не указаны</span>';
        }
    }

    // Галерея фотографий
    const allImages = [];
    if (venue.image_path) allImages.push(venue.image_path);
    (venue.images || []).forEach(img => {
        if (img.image_path && img.image_path !== venue.image_path) allImages.push(img.image_path);
    });

        const photo = document.getElementById('venue-photo');
    if (photo && allImages.length > 0) {
        photo.style.backgroundImage = `url('${allImages[0]}')`;
            photo.style.backgroundSize = 'cover';
            photo.style.backgroundPosition = 'center';

        if (allImages.length > 1) {
            let currentIndex = 0;
            const galleryNav = document.createElement('div');
            galleryNav.className = 'gallery-nav';
            galleryNav.innerHTML = `
                <button class="gallery-btn gallery-prev" title="Назад">&#8249;</button>
                <span class="gallery-counter">1 / ${allImages.length}</span>
                <button class="gallery-btn gallery-next" title="Вперёд">&#8250;</button>
            `;
            photo.style.position = 'relative';
            photo.appendChild(galleryNav);

            const counter = galleryNav.querySelector('.gallery-counter');
            galleryNav.querySelector('.gallery-prev').addEventListener('click', () => {
                currentIndex = (currentIndex - 1 + allImages.length) % allImages.length;
                photo.style.backgroundImage = `url('${allImages[currentIndex]}')`;
                counter.textContent = `${currentIndex + 1} / ${allImages.length}`;
            });
            galleryNav.querySelector('.gallery-next').addEventListener('click', () => {
                currentIndex = (currentIndex + 1) % allImages.length;
                photo.style.backgroundImage = `url('${allImages[currentIndex]}')`;
                counter.textContent = `${currentIndex + 1} / ${allImages.length}`;
            });
        }
    }

    const ownerName = venue.owner?.full_name || 'Арендодатель';
    const ownerEmail = venue.owner?.email || '';
    const ownerPhone = venue.owner?.phone || '';
    setText('landlord-name', ownerName);
    setText('landlord-email', ownerEmail ? ownerEmail : '');
    setText('landlord-phone', ownerPhone ? ownerPhone : '');
    const avatarEl = document.getElementById('landlord-avatar');
    if (avatarEl) avatarEl.textContent = ownerName.charAt(0).toUpperCase();

    const participantsInput = document.getElementById('participants-count');
    if (participantsInput) {
        participantsInput.min = 1;
        if (venue.capacity) participantsInput.max = venue.capacity;
    }
}

function initVenueFavoriteButton(venueId) {
    const btn = document.getElementById('venue-favorite-btn');
    if (!btn || typeof VenueFavorites === 'undefined') return;
    if (!VenueFavorites.canUseFavorites()) {
        btn.style.display = 'none';
        return;
    }
    btn.style.display = 'inline-flex';
    const on = VenueFavorites.isFavorite(venueId);
    btn.classList.toggle('is-favorite', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'В избранном' : 'В избранное';
    btn.onclick = async () => {
        try {
            const now = await VenueFavorites.toggle(venueId);
            btn.classList.toggle('is-favorite', now);
            btn.setAttribute('aria-pressed', now ? 'true' : 'false');
            btn.textContent = now ? 'В избранном' : 'В избранное';
        } catch (e) {
            alert(e.message || 'Ошибка');
        }
    };
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ==================== ОТКРЫТИЕ/ЗАКРЫТИЕ МОДАЛЬНОГО ОКНА ====================

async function handleBooking() {
    if (!API.Auth.isAuthenticated()) {
        alert('Для бронирования необходимо войти в систему');
        window.location.href = '/login';
        return;
    }
    try {
        const user = await API.getCurrentUser();
        if (user && (user.role === 'landlord' || user.role === 'admin')) {
            alert('Бронирование доступно только арендаторам.');
        return;
        }
    } catch {}

    if (!currentVenue) return;

    const participantsInput = document.getElementById('participants-count');
    const participants = parseInt(participantsInput?.value || 1);
    if (currentVenue.capacity && participants > currentVenue.capacity) {
        alert(`Количество участников (${participants}) превышает вместимость площадки (${currentVenue.capacity} чел.).`);
        return;
    }

    // Заполняем шапку модалки
    setText('modal-venue-name', currentVenue.name);
    const avatarEl = document.getElementById('modal-venue-avatar');
    if (avatarEl) avatarEl.textContent = currentVenue.name.charAt(0).toUpperCase();

    // Инициализируем неделю с сегодня
    currentWeekStart = getMonday(new Date());
    selectedSlots = [];

    // Загружаем занятые слоты
    await loadBookedSlots(currentVenue.id);

    renderCalendar();
    updateNavButtons();
    document.getElementById('booking-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeBookingModal() {
    document.getElementById('booking-modal').style.display = 'none';
    document.body.style.overflow = '';
    selectedSlots = [];
    updateFooter();
}

// Закрытие по клику на оверлей
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('booking-modal');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeBookingModal();
        });
    }
});

// ==================== ЗАГРУЗКА ЗАНЯТЫХ СЛОТОВ ====================

async function loadBookedSlots(venueId) {
    bookedSlots = {};
    try {
        const slots = await API.getVenueTimeSlots(venueId);
        (slots || []).forEach(slot => {
            if (slot.status === 'booked' || slot.status === 'reserved') {
                const startHour = slot.start_time ? parseInt(slot.start_time.substring(0, 2)) : null;
                const endHour = slot.end_time ? parseInt(slot.end_time.substring(0, 2)) : null;
                if (startHour !== null) {
                    const last = endHour !== null ? endHour : startHour + 1;
                    for (let h = startHour; h < last; h++) {
                        bookedSlots[`${slot.date}_${h}`] = true;
                    }
                }
            }
        });
    } catch (e) {
        console.error('Ошибка загрузки слотов:', e);
    }
}

// ==================== РЕНДЕР КАЛЕНДАРЯ ====================

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDisplayDate(date) {
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function getMaxWeekStart() {
    const max = new Date();
    max.setHours(0, 0, 0, 0);
    max.setMonth(max.getMonth() + 6);
    return getMonday(max);
}

function changeWeek(dir) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minWeek = getMonday(today);
    const maxWeek = getMaxWeekStart();

    const next = addDays(currentWeekStart, dir * 7);
    if (next < minWeek || next > maxWeek) return;
    currentWeekStart = next;
    renderCalendar();
    updateNavButtons();
}

function updateNavButtons() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minWeek = getMonday(today);
    const maxWeek = getMaxWeekStart();

    const prevBtn = document.getElementById('cal-prev');
    const nextBtn = document.getElementById('cal-next');
    if (prevBtn) prevBtn.disabled = currentWeekStart <= minWeek;
    if (nextBtn) nextBtn.disabled = addDays(currentWeekStart, 7) > maxWeek;
}

function renderCalendar() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Заголовки дней
    const daysContainer = document.getElementById('cal-week-days');
    daysContainer.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const day = addDays(currentWeekStart, i);
        const isToday = formatDate(day) === formatDate(today);
        const div = document.createElement('div');
        div.className = 'cal-day-header' + (isToday ? ' today' : '');
        div.innerHTML = `
            <div class="cal-day-name">${DAY_NAMES[i]}</div>
            <div class="cal-day-date">${day.getDate()} ${day.toLocaleDateString('ru-RU', {month: 'short'})}</div>`;
        daysContainer.appendChild(div);
    }

    // Временные метки
    const timeLeft = document.getElementById('cal-time-left');
    const timeRight = document.getElementById('cal-time-right');
    timeLeft.innerHTML = '';
    timeRight.innerHTML = '';

    for (let h = WORK_START; h < WORK_END; h++) {
        const label = `${String(h).padStart(2,'0')}:00`;
        timeLeft.innerHTML += `<div class="cal-time-label">${label}</div>`;
        timeRight.innerHTML += `<div class="cal-time-label">${label}</div>`;
    }

    // Сетка слотов (7 колонок × (WORK_END-WORK_START) строк)
    const grid = document.getElementById('cal-slots-grid');
    grid.innerHTML = '';

    // Строим по часам (строки), затем по дням (колонки)
    for (let h = WORK_START; h < WORK_END; h++) {
        for (let d = 0; d < 7; d++) {
            const day = addDays(currentWeekStart, d);
            const dateStr = formatDate(day);
            const key = `${dateStr}_${h}`;
            const isPast = day < today || (formatDate(day) === formatDate(today) && h < new Date().getHours());
            const isBooked = bookedSlots[key];
            const isSelected = selectedSlots.some(s => s.date === dateStr && s.hour === h);

            const cell = document.createElement('div');
            cell.dataset.date = dateStr;
            cell.dataset.hour = h;

            const price = currentVenue?.price_per_hour || 0;
            const priceStr = parseFloat(price).toFixed(0);

            if (isPast) {
                cell.className = 'cal-slot cal-slot-past';
                cell.textContent = '';
            } else if (isBooked) {
                cell.className = 'cal-slot cal-slot-booked';
                cell.textContent = 'Занято';
            } else if (isSelected) {
                const isAnchor = rangeAnchor && rangeAnchor.date === dateStr && rangeAnchor.hour === h;
                cell.className = 'cal-slot cal-slot-selected' + (isAnchor ? ' cal-slot-anchor' : '');
                cell.textContent = `${priceStr} ₽`;
                cell.addEventListener('click', () => toggleSlot(dateStr, h, parseFloat(price)));
            } else {
                cell.className = 'cal-slot cal-slot-available';
                cell.textContent = `${priceStr} ₽`;
                cell.addEventListener('click', () => toggleSlot(dateStr, h, parseFloat(price)));
            }

            grid.appendChild(cell);
        }
    }

    updateFooter();
}

// ==================== ВЫБОР СЛОТОВ ====================

function toggleSlot(date, hour, price) {
    const isSelected = selectedSlots.some(s => s.date === date && s.hour === hour);

    // Если кликнули на уже выбранный слот — снимаем весь день
    if (isSelected) {
        selectedSlots = selectedSlots.filter(s => s.date !== date);
        rangeAnchor = null;
        renderCalendar();
        return;
    }

    // Есть якорь на том же дне — заполняем диапазон
    if (rangeAnchor && rangeAnchor.date === date) {
        const from = Math.min(rangeAnchor.hour, hour);
        const to   = Math.max(rangeAnchor.hour, hour);

        // Удаляем старые слоты этого дня, добавляем диапазон
        selectedSlots = selectedSlots.filter(s => s.date !== date);

        for (let h = from; h <= to; h++) {
            const key = `${date}_${h}`;
            if (!bookedSlots[key]) {
                selectedSlots.push({ date, hour: h, price });
            }
        }

        rangeAnchor = null; // сбрасываем якорь, следующий клик — новый диапазон
    } else {
        // Нет якоря или другой день — начинаем новый диапазон
        // Не сбрасываем другие дни, просто ставим якорь
        selectedSlots = selectedSlots.filter(s => s.date !== date);
        selectedSlots.push({ date, hour, price });
        rangeAnchor = { date, hour };
    }

    renderCalendar();
}

function clearSlotSelection() {
    selectedSlots = [];
    rangeAnchor = null;
    renderCalendar();
}

function updateFooter() {
    const totalPrice = selectedSlots.reduce((sum, s) => sum + s.price, 0);
    const confirmBtn = document.getElementById('modal-confirm-btn');

    if (selectedSlots.length === 0) {
        setText('modal-total-price', '0 ₽');
        setText('modal-selected-time', 'Выберите время');
        if (confirmBtn) confirmBtn.disabled = true;
        return;
    }

    // Показываем подсказку если ждём второго клика
    if (rangeAnchor) {
        setText('modal-selected-time', `${String(rangeAnchor.hour).padStart(2,'0')}:00 → кликните конец диапазона`);
        setText('modal-total-price', `${totalPrice.toFixed(0)} ₽`);
        if (confirmBtn) confirmBtn.disabled = false;
        return;
    }

    setText('modal-total-price', `${totalPrice.toFixed(0)} ₽`);

    // Формируем текст со временем
    const sorted = [...selectedSlots].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.hour - b.hour;
    });

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const hours = selectedSlots.length;

    const timeText = first.date === last.date
        ? `${String(first.hour).padStart(2,'0')}:00–${String(last.hour + 1).padStart(2,'0')}:00 (${hours}ч)`
        : `${hours} слот(ов) на нескольких датах`;

    setText('modal-selected-time', timeText);
    if (confirmBtn) confirmBtn.disabled = false;
}

// ==================== ПОДТВЕРЖДЕНИЕ БРОНИРОВАНИЯ ====================

async function confirmBooking() {
    if (selectedSlots.length === 0) return;

    const confirmBtn = document.getElementById('modal-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Создаю...';

    const sorted = [...selectedSlots].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.hour - b.hour;
    });

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalPrice = selectedSlots.reduce((s, sl) => s + sl.price, 0);

    const bookingData = {
        venue_id: currentVenue.id,
        booking_date: first.date,
        start_time: `${String(first.hour).padStart(2,'0')}:00:00`,
        end_time: `${String(last.hour + 1).padStart(2,'0')}:00:00`,
        participants_count: parseInt(document.getElementById('participants-count')?.value || 1)
    };

    try {
        const booking = await API.createBookingFlexible(bookingData);
        showBookingSuccess(booking, first.date, bookingData.start_time, bookingData.end_time, totalPrice);
    } catch (e) {
        alert('Ошибка создания бронирования: ' + (e.message || String(e)));
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Далее';
    }
}

let currentBookingId = null;

function showBookingSuccess(booking, dateStr, startTime, endTime, totalPrice) {
    currentBookingId = booking ? booking.id : null;

    // Фиксируем высоту модалки и скрываем календарь/подвал
    document.querySelector('.booking-modal').classList.add('booking-modal--success');
    document.querySelector('.booking-calendar').style.display = 'none';
    document.querySelector('.booking-modal-footer').style.display = 'none';

    // Детали бронирования
    document.getElementById('bsv-details').textContent =
        `${currentVenue.name} · ${dateStr} · ${startTime.substring(0,5)}–${endTime.substring(0,5)} · ${totalPrice.toFixed(0)} ₽`;

    // Предоплата 20%
    const prepay = totalPrice * 0.2;
    const prepayEl = document.getElementById('bsv-prepay-amount');
    if (prepayEl) prepayEl.textContent = `${prepay.toFixed(0)} ₽`;

    // QR-код
    const qrImg = document.getElementById('bsv-qr-img');
    const qrMissing = document.getElementById('bsv-qr-missing');
    if (currentVenue.qr_code_path) {
        const base = window.location.origin;
        qrImg.src = currentVenue.qr_code_path.startsWith('http')
            ? currentVenue.qr_code_path
            : base + currentVenue.qr_code_path;
        qrImg.style.display = 'block';
        qrMissing.style.display = 'none';
    } else {
        qrImg.style.display = 'none';
        qrMissing.style.display = 'flex';
    }

    // Сброс загрузки чека
    resetReceiptUpload();
    initReceiptUpload();

    document.getElementById('booking-success-view').style.display = 'flex';
}

function closeBookingSuccess() {
    document.getElementById('booking-success-view').style.display = 'none';
    document.querySelector('.booking-modal').classList.remove('booking-modal--success');
    document.querySelector('.booking-calendar').style.display = '';
    document.querySelector('.booking-modal-footer').style.display = '';
    currentBookingId = null;
    closeBookingModal();
}

// ==================== ЗАГРУЗКА ЧЕКА ====================

function initReceiptUpload() {
    const fileInput = document.getElementById('bsv-receipt-file');
    const dropArea = document.getElementById('bsv-receipt-drop');
    if (!fileInput || !dropArea) return;

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) onReceiptFileSelected(file);
    };

    dropArea.ondragover = (e) => { e.preventDefault(); dropArea.classList.add('drag-over'); };
    dropArea.ondragleave = () => dropArea.classList.remove('drag-over');
    dropArea.ondrop = (e) => {
        e.preventDefault();
        dropArea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) {
            document.getElementById('bsv-receipt-file').files = e.dataTransfer.files;
            onReceiptFileSelected(file);
        }
    };
}

function onReceiptFileSelected(file) {
    const placeholder = document.getElementById('bsv-receipt-placeholder');
    const preview = document.getElementById('bsv-receipt-preview');
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
    } else {
        // PDF: показываем имя файла
        if (placeholder) {
            placeholder.innerHTML = `<div class="bsv-receipt-icon">&#128196;</div><div>${file.name}</div>`;
        }
    }
    setReceiptStatus('Файл выбран: ' + file.name);
    document.getElementById('bsv-send-btn').disabled = false;
}

function resetReceiptUpload() {
    const fileInput = document.getElementById('bsv-receipt-file');
    const preview = document.getElementById('bsv-receipt-preview');
    const placeholder = document.getElementById('bsv-receipt-placeholder');
    if (fileInput) fileInput.value = '';
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    if (placeholder) {
        placeholder.innerHTML = '<div class="bsv-receipt-icon">&#128196;</div><div>Нажмите или перетащите файл</div><small>JPG, PNG, PDF до 5 МБ</small>';
        placeholder.style.display = '';
    }
    setReceiptStatus('');
    const sendBtn = document.getElementById('bsv-send-btn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Отправить чек'; }
}

function setReceiptStatus(msg, isError = false) {
    const el = document.getElementById('bsv-receipt-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? '#dc2626' : 'var(--gray)';
}

async function submitReceipt() {
    const fileInput = document.getElementById('bsv-receipt-file');
    if (!fileInput || !fileInput.files.length) return;
    if (!currentBookingId) { setReceiptStatus('Ошибка: нет ID бронирования', true); return; }

    const sendBtn = document.getElementById('bsv-send-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Отправляю...';
    setReceiptStatus('Загрузка чека...');

    try {
        await API.uploadReceipt(currentBookingId, fileInput.files[0]);
        setReceiptStatus('Чек отправлен. Ожидайте подтверждения от арендодателя.');
        sendBtn.textContent = 'Чек отправлен ✓';
    } catch (e) {
        setReceiptStatus('Ошибка: ' + (e.message || String(e)), true);
        sendBtn.disabled = false;
        sendBtn.textContent = 'Отправить чек';
    }
}

// ==================== ОТЗЫВЫ ====================

function starsHtml(rating) {
    return Array.from({length: 5}, (_, i) =>
        `<span style="color:${i < rating ? '#f59e0b' : '#ccc'}">★</span>`
    ).join('');
}

async function loadReviews(venueId) {
    const list = document.getElementById('venue-reviews-list');
    if (!list) return;
    try {
        const reviews = await API.getVenueReviews(venueId);

        // Обновляем блок рейтинга на основе реальных отзывов
        const ratingEl = document.getElementById('venue-rating');
        const starsEl  = document.getElementById('venue-stars');
        if (reviews && reviews.length > 0) {
            const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
            const rounded = Math.round(avg);
            if (starsEl) {
                starsEl.innerHTML = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
                starsEl.style.color = '#f59e0b';
            }
            if (ratingEl) ratingEl.textContent = `${avg.toFixed(1)} (${reviews.length} отз.)`;
        } else {
            if (starsEl) { starsEl.textContent = '★★★★★'; starsEl.style.color = '#ccc'; }
            if (ratingEl) ratingEl.textContent = 'Нет отзывов';
        }

        if (!reviews || reviews.length === 0) {
            list.innerHTML = '<p class="reviews-empty">Отзывов пока нет. Будьте первым!</p>';
            return;
        }
        const currentUser = API.Auth.isAuthenticated() ? await API.getCurrentUser().catch(() => null) : null;
        list.innerHTML = reviews.map(r => {
            const canDelete = currentUser && (
                currentUser.role === 'admin' ||
                (currentUser.role === 'renter' && currentUser.id === r.user_id)
            );
            return `
            <div class="review-item" data-review-id="${r.id}">
                <div class="review-header">
                    <strong>${r.author_name}</strong>
                    <span>${starsHtml(r.rating)}</span>
                    ${canDelete ? `<button class="review-delete-btn" data-review-id="${r.id}" title="Удалить отзыв">✕</button>` : ''}
                </div>
                ${r.comment ? `<p class="review-text">${r.comment}</p>` : ''}
                <small class="review-date">${r.booking_date
                    ? new Date(r.booking_date + 'T00:00:00').toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'})
                    : ''}</small>
            </div>`;
        }).join('');

        list.querySelectorAll('.review-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Удалить этот отзыв?')) return;
                try {
                    await API.deleteReview(parseInt(btn.dataset.reviewId));
                    loadReviews(venueId);
                } catch (e) {
                    alert('Ошибка: ' + (e.message || e));
                }
            });
        });
    } catch (e) {
        list.innerHTML = '<p class="reviews-empty">Ошибка загрузки отзывов.</p>';
    }
}

let reviewEligibleBookings = [];

async function initReviewForm(venueId) {
    try {
        const user = await API.getCurrentUser();
        if (!user || user.role !== 'renter') return;

        // Загружаем подтверждённые бронирования этой площадки
        const myBookings = await API.getMyBookings();
        reviewEligibleBookings = (myBookings || []).filter(b =>
            b.venue_id == venueId && b.status === 'confirmed'
        );
        if (reviewEligibleBookings.length === 0) return;

        // Показываем форму
        const wrap = document.getElementById('review-form-wrap');
        if (wrap) wrap.style.display = 'block';

        // Заполняем селект бронирований
        const sel = document.getElementById('review-booking-select');
        if (sel) {
            sel.innerHTML = reviewEligibleBookings.map(b =>
                `<option value="${b.id}">${b.booking_date} ${b.start_time?.substring(0,5)}–${b.end_time?.substring(0,5)}</option>`
            ).join('');
        }

        initStarInput();
    } catch {}
}

function initStarInput() {
    const stars = document.querySelectorAll('.star-btn');
    stars.forEach(star => {
        star.addEventListener('mouseenter', () => highlightStars(+star.dataset.value));
        star.addEventListener('mouseleave', () => highlightStars(+document.getElementById('review-rating').value));
        star.addEventListener('click', () => {
            document.getElementById('review-rating').value = star.dataset.value;
            highlightStars(+star.dataset.value);
        });
    });
}

function highlightStars(value) {
    document.querySelectorAll('.star-btn').forEach(s => {
        s.classList.toggle('active', +s.dataset.value <= value);
    });
}

async function submitReview() {
    const rating = parseInt(document.getElementById('review-rating').value);
    if (!rating || rating < 1) {
        setReviewStatus('Выберите оценку (звёзды)', true); return;
    }
    const comment = document.getElementById('review-comment').value.trim();
    const bookingId = parseInt(document.getElementById('review-booking-select').value);
    if (!bookingId) { setReviewStatus('Выберите бронирование', true); return; }

    const btn = document.getElementById('review-submit-btn');
    btn.disabled = true;
    setReviewStatus('Публикую...');
    try {
        await API.createReview({ booking_id: bookingId, rating, comment: comment || null });
        setReviewStatus('Отзыв опубликован!');
        document.getElementById('review-form-wrap').style.display = 'none';
        loadReviews(currentVenue.id);
    } catch (e) {
        setReviewStatus('Ошибка: ' + (e.message || String(e)), true);
        btn.disabled = false;
    }
}

function setReviewStatus(msg, isError = false) {
    const el = document.getElementById('review-form-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? '#dc2626' : 'var(--gray)';
}
