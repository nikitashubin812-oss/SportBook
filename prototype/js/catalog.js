let _allVenues = [];
let _searchTimeout = null;

// Загрузка площадок
async function loadVenues() {
    const grid = document.getElementById('venues-grid');
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const city = urlParams.get('city') || '';
        const sport = urlParams.get('sport') || '';

        if (city) document.getElementById('city-filter').value = city;
        if (sport) document.getElementById('sport-filter').value = sport;

        if (grid) grid.innerHTML = '<p class="catalog-empty">Загрузка...</p>';

        const venues = await API.getVenues();
        _allVenues = venues;
        if (typeof VenueFavorites !== 'undefined') {
            VenueFavorites.invalidate();
            await VenueFavorites.ensureLoaded();
        }
        applyFilters();

    } catch (error) {
        console.error('Ошибка загрузки площадок:', error);
        if (grid) grid.innerHTML = '<p class="catalog-empty">Ошибка загрузки. Попробуйте позже.</p>';
    }
}

// Применение всех фильтров
function applyFilters() {
    const search   = (document.getElementById('name-search')?.value || '').toLowerCase().trim();
    const city     = document.getElementById('city-filter')?.value || '';
    const sport    = document.getElementById('sport-filter')?.value || '';
    const capacity = document.getElementById('capacity-filter')?.value || '';
    const priceMin = parseFloat(document.getElementById('price-min')?.value) || 0;
    const priceMax = parseFloat(document.getElementById('price-max')?.value) || Infinity;

    const checkedAmenities = Array.from(
        document.querySelectorAll('input[name="filter-amenity"]:checked')
    ).map(cb => cb.value);

    let filtered = _allVenues;

    // Поиск по названию
    if (search) {
        filtered = filtered.filter(v => v.name?.toLowerCase().includes(search));
    }

    // Город
    if (city) {
        filtered = filtered.filter(v => v.city === city);
    }

    // Вид спорта
    if (sport) {
        filtered = filtered.filter(v =>
            v.sport_types?.toLowerCase().includes(sport.toLowerCase())
        );
    }

    // Вместимость
    if (capacity) {
        filtered = filtered.filter(v => {
            const cap = v.capacity || 0;
            if (capacity === 'small')  return cap <= 10;
            if (capacity === 'medium') return cap > 10 && cap <= 20;
            if (capacity === 'large')  return cap > 20;
            return true;
        });
    }

    // Цена
    if (priceMin > 0) {
        filtered = filtered.filter(v => parseFloat(v.price_per_hour) >= priceMin);
    }
    if (priceMax < Infinity) {
        filtered = filtered.filter(v => parseFloat(v.price_per_hour) <= priceMax);
    }

    // Удобства (выбранные чекбоксы — площадка должна иметь ВСЕ выбранные)
    if (checkedAmenities.length > 0) {
        filtered = filtered.filter(v => {
            const vAmenities = (v.amenities || []).map(a => a.name || a);
            return checkedAmenities.every(a => vAmenities.includes(a));
        });
    }

    renderVenues(filtered);
}

// Отрисовка карточек
function renderVenues(venues) {
    const grid = document.getElementById('venues-grid');
    const info = document.getElementById('results-info');
    if (!grid) return;

    if (info) {
        info.textContent = venues.length > 0
            ? `Найдено: ${venues.length} ${plural(venues.length, 'площадка', 'площадки', 'площадок')}`
            : '';
    }

    if (venues.length === 0) {
        grid.innerHTML = '<p class="catalog-empty">Площадки не найдены. Попробуйте изменить фильтры.</p>';
    } else {
        grid.innerHTML = venues.map(venue => createVenueCardHTML(venue)).join('');
    }

    // Если пользователь прокручен ниже верхней границы результатов —
    // плавно возвращаем к началу каталога (стандартное поведение фильтров)
    const layout = document.querySelector('.catalog-layout');
    if (layout) {
        const layoutTop = layout.getBoundingClientRect().top + window.scrollY - 88;
        if (window.scrollY > layoutTop + 10) {
            window.scrollTo({ top: Math.max(0, layoutTop), behavior: 'smooth' });
        }
    }
}

function plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
}

// HTML карточки площадки
function createVenueCardHTML(venue) {
    const imageBg = venue.image_path
        ? `background-image: url('${venue.image_path}'); background-size: cover; background-position: center;`
        : 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);';

    const showFav = typeof VenueFavorites !== 'undefined' && VenueFavorites.canUseFavorites();
    const favOn = showFav && VenueFavorites.isFavorite(venue.id);
    const favBtn = showFav
        ? `<button type="button" class="venue-favorite-btn${favOn ? ' is-favorite' : ''}" data-favorite-id="${venue.id}" aria-label="${favOn ? 'Удалить из избранного' : 'В избранное'}" title="${favOn ? 'Удалить из избранного' : 'В избранное'}">${favOn ? '\u2605' : '\u2606'}</button>`
        : '';

    return `
        <div class="venue-card" data-venue-id="${venue.id}">
            ${favBtn}
            <div class="venue-card-inner" data-href="/venue/${venue.id}">
            <div class="venue-image" style="${imageBg}"></div>
            <div class="venue-content">
                <h3 class="venue-title">${venue.name}</h3>
                <div class="venue-info">
                    <span>${venue.address || ''}</span>
                    <span>${venue.sport_types || ''}</span>
                    <span>Вместимость: ${venue.capacity || '—'} чел.</span>
                </div>
                <div class="venue-price">${parseFloat(venue.price_per_hour).toFixed(0)} ₽/час</div>
                <div class="venue-rating">
                    ${venue.reviews_count > 0
                        ? `<span class="stars">${'★'.repeat(Math.round(venue.rating))}${'☆'.repeat(5 - Math.round(venue.rating))}</span>
                           <span>${parseFloat(venue.rating).toFixed(1)} (${venue.reviews_count} отз.)</span>`
                        : `<span class="stars" style="color:#ccc">★★★★★</span>
                           <span style="color:#aaa">Нет отзывов</span>`
                    }
                </div>
            </div>
            </div>
        </div>`;
}

function initVenuesGridClicks() {
    const grid = document.getElementById('venues-grid');
    if (!grid || grid.dataset.delegated === '1') return;
    grid.dataset.delegated = '1';
    grid.addEventListener('click', async (e) => {
        const favBtn = e.target.closest('.venue-favorite-btn');
        if (favBtn) {
            e.preventDefault();
            e.stopPropagation();
            const id = parseInt(favBtn.dataset.favoriteId, 10);
            try {
                const on = await VenueFavorites.toggle(id);
                favBtn.classList.toggle('is-favorite', on);
                favBtn.textContent = on ? '\u2605' : '\u2606';
                favBtn.setAttribute('aria-label', on ? 'Удалить из избранного' : 'В избранное');
                favBtn.title = on ? 'Удалить из избранного' : 'В избранное';
            } catch (err) {
                alert(err.message || 'Ошибка');
            }
            return;
        }
        const inner = e.target.closest('.venue-card-inner');
        if (inner && inner.dataset.href) {
            window.location.href = inner.dataset.href;
        }
    });
}

// Инициализация всех фильтров
function initFilters() {
    // Поиск по названию с дебаунсом
    const searchInput = document.getElementById('name-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(_searchTimeout);
            _searchTimeout = setTimeout(applyFilters, 200);
        });
    }

    // Селекты
    ['city-filter', 'sport-filter', 'capacity-filter'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', applyFilters);
    });

    // Диапазон цен
    ['price-min', 'price-max'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            clearTimeout(_searchTimeout);
            _searchTimeout = setTimeout(applyFilters, 300);
        });
    });

    // Удобства
    document.querySelectorAll('input[name="filter-amenity"]').forEach(cb => {
        cb.addEventListener('change', applyFilters);
    });

    // Сброс фильтров
    document.getElementById('reset-filters')?.addEventListener('click', () => {
        document.getElementById('name-search').value = '';
        document.getElementById('city-filter').value = '';
        document.getElementById('sport-filter').value = '';
        document.getElementById('capacity-filter').value = '';
        document.getElementById('price-min').value = '';
        document.getElementById('price-max').value = '';
        document.querySelectorAll('input[name="filter-amenity"]').forEach(cb => cb.checked = false);
        applyFilters();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    initVenuesGridClicks();
    loadVenues();

    const authBtn = document.getElementById('nav-auth-btn');
    if (authBtn && API.Auth.isAuthenticated()) {
        authBtn.textContent = 'Кабинет';
        authBtn.href = '/cabinet';
    }
});
