// Маппинг ролей на русский
const roleNames = {
    'renter': 'Арендатор',
    'landlord': 'Арендодатель',
    'admin': 'Администратор'
};

let currentUser = null;

// Проверка авторизации
function checkAuth() {
    if (!API.Auth.isAuthenticated()) {
        window.location.href = '/login';
        return false;
    }
    return true;
}

// Выход из системы
function logout() {
    API.Auth.removeToken();
    localStorage.removeItem('current_user');
    if (typeof VenueFavorites !== 'undefined') VenueFavorites.invalidate();
    window.location.href = '/login';
}

// Текущий редактируемый ID (null = режим создания)
let editingVenueId = null;

// Накопленные (ещё не загруженные) доп. фото
let _pendingExtraFiles = [];
// Сохранённые серверные фото (при редактировании)
let _savedExtraImages = [];
let _savedExtraVenueId = null;

// Показать/скрыть форму добавления площадки
function toggleAddVenueForm() {
    // Блокируем создание площадок неверифицированным арендодателям
    if (currentUser && currentUser.role === 'landlord' && currentUser.verification_status !== 'verified') {
        alert('Добавление площадок доступно только после прохождения верификации.');
        return;
    }
    const form = document.getElementById('add-venue-form');
    if (!form) return;
    const isVisible = form.classList.contains('visible');
    if (isVisible) {
        closeVenueForm();
    } else {
        openVenueFormCreate();
    }
}

function openVenueFormCreate() {
    editingVenueId = null;
    const form = document.getElementById('add-venue-form');
    document.getElementById('venue-form').reset();
    document.getElementById('venue-form-title').textContent = 'Новая площадка';
    document.getElementById('venue-form-submit').textContent = 'Создать площадку';

    // Дополнительные фото доступны и при создании
    _pendingExtraFiles = [];
    _savedExtraImages = [];
    _savedExtraVenueId = null;
    const extraGroup = document.getElementById('extra-images-group');
    if (extraGroup) extraGroup.style.display = 'block';
    renderExtraImages([], null);
    const extraInput = document.getElementById('extra-images-input');
    if (extraInput) extraInput.value = '';

        form.classList.add('visible');
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

function openVenueFormEdit(venue) {
    editingVenueId = venue.id;
    const form = document.getElementById('add-venue-form');
    const f = document.getElementById('venue-form');

    document.getElementById('venue-form-title').textContent = 'Редактирование площадки';
    document.getElementById('venue-form-submit').textContent = 'Сохранить изменения';

    // Заполняем форму данными площадки
    f.querySelector('[name="name"]').value = venue.name || '';
    f.querySelector('[name="city"]').value = venue.city || '';
    f.querySelector('[name="address"]').value = venue.address || '';
    f.querySelector('[name="capacity"]').value = venue.capacity || '';
    f.querySelector('[name="area"]').value = venue.area || '';
    f.querySelector('[name="price_per_hour"]').value = venue.price_per_hour || '';
    f.querySelector('[name="description"]').value = venue.description || '';
    f.querySelector('[name="qr_code_path"]').value = venue.qr_code_path || '';

    // Проставляем чекбоксы видов спорта
    const existingSports = (venue.sport_types || '').split(',').map(s => s.trim());
    document.querySelectorAll('#venue-form input[name="sport_type_cb"]').forEach(cb => {
        cb.checked = existingSports.includes(cb.value);
    });

    // Сбрасываем и заполняем чекбоксы удобств
    document.querySelectorAll('#venue-form input[name="amenity"]').forEach(cb => {
        const existingNames = (venue.amenities || []).map(a => typeof a === 'string' ? a : a.name);
        cb.checked = existingNames.includes(cb.value);
    });

    // Показываем существующее фото и QR
    resetImageUpload();
    if (venue.image_path) setExistingImagePreview(venue.image_path);
    if (venue.qr_code_path) setExistingQrPreview(venue.qr_code_path);

    // Показываем дополнительные фото
    _pendingExtraFiles = [];
    const extraGroup = document.getElementById('extra-images-group');
    if (extraGroup) {
        extraGroup.style.display = 'block';
        renderExtraImages(venue.images || [], venue.id);
    }
    const extraInput = document.getElementById('extra-images-input');
    if (extraInput) extraInput.value = '';

        form.classList.add('visible');
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

function closeVenueForm() {
    editingVenueId = null;
    document.getElementById('add-venue-form').classList.remove('visible');
    document.getElementById('venue-form').reset();
    document.querySelectorAll('#venue-form input[name="amenity"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#venue-form input[name="sport_type_cb"]').forEach(cb => cb.checked = false);
    ['name','city','address','sport_types','capacity','area','price_per_hour'].forEach(n => setVenueFieldError(n, ''));
    resetImageUpload();
    _pendingExtraFiles = [];
    _savedExtraImages = [];
    _savedExtraVenueId = null;
    const extraGroup = document.getElementById('extra-images-group');
    if (extraGroup) extraGroup.style.display = 'none';
    const extraList = document.getElementById('extra-images-list');
    if (extraList) extraList.innerHTML = '';
    const extraInput = document.getElementById('extra-images-input');
    if (extraInput) extraInput.value = '';
    const extraStatus = document.getElementById('extra-images-status');
    if (extraStatus) extraStatus.textContent = '';
}

function renderExtraImages(savedImages, venueId) {
    // Сохраняем в модульные переменные, чтобы перерисовка после удаления pending-фото работала
    if (savedImages !== undefined) _savedExtraImages = savedImages;
    if (venueId !== undefined) _savedExtraVenueId = venueId;

    const list = document.getElementById('extra-images-list');
    if (!list) return;

    const savedHtml = _savedExtraImages.map(img => `
        <div class="extra-image-item" id="extra-img-${img.id}">
            <img src="${img.image_path}" alt="Фото площадки">
            <button type="button" class="extra-image-delete" data-image-id="${img.id}" data-venue-id="${_savedExtraVenueId}" title="Удалить">✕</button>
        </div>
    `).join('');

    const pendingHtml = _pendingExtraFiles.map((file, idx) => {
        const url = URL.createObjectURL(file);
        return `
        <div class="extra-image-item" id="extra-pending-${idx}">
            <img src="${url}" alt="Новое фото">
            <button type="button" class="extra-image-delete extra-pending-delete" data-pending-idx="${idx}" title="Убрать">✕</button>
        </div>`;
    }).join('');

    if (!_savedExtraImages.length && !_pendingExtraFiles.length) {
        list.innerHTML = '<p class="form-hint">Нет дополнительных фотографий</p>';
    } else {
        list.innerHTML = savedHtml + pendingHtml;
    }

    // Удаление сохранённых фото (только при редактировании)
    list.querySelectorAll('.extra-image-delete:not(.extra-pending-delete)').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Удалить это фото?')) return;
            try {
                await API.deleteVenueImage(parseInt(btn.dataset.venueId), parseInt(btn.dataset.imageId));
                _savedExtraImages = _savedExtraImages.filter(img => String(img.id) !== btn.dataset.imageId);
                renderExtraImages();
            } catch(e) { alert('Ошибка: ' + e.message); }
        });
    });

    // Удаление pending-фото (ещё не загружены на сервер)
    list.querySelectorAll('.extra-pending-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.pendingIdx);
            URL.revokeObjectURL(list.querySelector(`#extra-pending-${idx} img`)?.src);
            _pendingExtraFiles.splice(idx, 1);
            renderExtraImages();
        });
    });

    // Обновить счётчик статуса
    const statusEl = document.getElementById('extra-images-status');
    if (statusEl) {
        statusEl.style.color = '';
        statusEl.textContent = _pendingExtraFiles.length > 0 ? `Новых фото: ${_pendingExtraFiles.length}` : '';
    }
}

// Загрузка данных пользователя
async function loadUserData() {
    try {
        const user = await API.getCurrentUser();
        if (!user) {
            window.location.href = '/login';
            return;
        }
        currentUser = user;
        displayUserInfo(user);
        showRolePanel(user.role);
        if (user.role === 'renter') {
            if (typeof VenueFavorites !== 'undefined') VenueFavorites.invalidate();
            loadRenterBookings();
            loadMyReviews();
            loadFavoritesList();
        } else if (user.role === 'landlord') {
            renderVerificationBlock(user);
            loadLandlordVenues();
            loadLandlordBookings();
        } else if (user.role === 'admin') {
            loadAdminDisputes();
            loadVerifications();
        }
    } catch (error) {
        console.error('Ошибка загрузки данных пользователя:', error);
        window.location.href = '/login';
    }
}

// Отображение информации о пользователе
function displayUserInfo(user) {
    const firstLetter = user.full_name ? user.full_name.charAt(0).toUpperCase() : '?';
    document.getElementById('user-avatar').textContent = firstLetter;
    document.getElementById('user-name').textContent = user.full_name || '—';
    document.getElementById('user-email').textContent = user.email || '—';
    document.getElementById('user-role-display').textContent = roleNames[user.role] || user.role;
}

// Показать нужную панель по роли
function showRolePanel(role) {
    document.querySelectorAll('.role-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    const panel = document.getElementById(role + '-panel');
    if (panel) panel.style.display = 'block';
}

// Переключение вкладок
function switchTab(event, tabId) {
    const tabsEl = event.target.closest('.tabs');
    const rolePanel = tabsEl.closest('.role-panel');

    rolePanel.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    rolePanel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const selected = document.getElementById(tabId);
    if (selected) selected.classList.add('active');

    if (tabId === 'favorites') {
        loadFavoritesList();
    }
    if (tabId === 'admin-reviews') {
        loadAdminReviews();
    }
}

// ==================== ВЕРИФИКАЦИЯ АРЕНДОДАТЕЛЯ ====================

const VERIFY_STATUS = {
    unverified:   { text: 'Не верифицирован', cls: 'badge-warning' },
    pending:      { text: 'На проверке',       cls: 'badge-info' },
    verified:     { text: 'Верифицирован',     cls: 'badge-success' },
    rejected:     { text: 'Отклонено',         cls: 'badge-danger' },
    not_required: { text: '',                  cls: '' }
};

function renderVerificationBlock(user) {
    const block = document.getElementById('verification-block');
    if (!block) return;
    const st = user.verification_status || 'unverified';
    const info = VERIFY_STATUS[st] || VERIFY_STATUS.unverified;

    let html = `<div class="verification-status-row">
        <span class="badge ${info.cls}">${info.text}</span>
    </div>`;

    if (st === 'unverified' || st === 'rejected') {
        if (st === 'rejected' && user.verification_comment) {
            html += `<p class="verification-comment">Причина отказа: <em>${user.verification_comment}</em></p>`;
        }
        html += `
        <p class="verification-hint">Загрузите документы, подтверждающие право на управление спортивной площадкой (скан договора аренды, свидетельства собственности или иного документа). Можно загрузить несколько файлов.</p>
        <div class="image-upload-area verify-doc-drop-zone" id="verify-drop">
            <div class="image-upload-placeholder verify-doc-placeholder" id="verify-placeholder" onclick="document.getElementById('verify-file-input').click()">
                <div>Нажмите или перетащите файлы</div>
                <small>JPG, PNG, PDF — можно несколько</small>
            </div>
            <div id="verify-files-grid" class="verify-files-grid" style="display:none"></div>
        </div>
        <input type="file" id="verify-file-input" accept="image/jpeg,image/png,image/webp,application/pdf" multiple style="display:none">
        <p id="verify-status" class="verification-upload-status"></p>
        <button class="btn-primary verify-upload-btn" id="verify-upload-btn" onclick="submitVerificationDoc()" disabled>Отправить на проверку</button>`;
    } else if (st === 'pending') {
        html += `<p class="verification-hint">Документы отправлены и ожидают проверки администратором. Как только решение будет принято, вы сможете добавлять площадки.</p>`;
    } else if (st === 'verified') {
        html += `<p class="verification-hint">Ваши документы подтверждены. Вы можете добавлять и управлять площадками.</p>`;
    }

    block.innerHTML = html;

    // Визуально отключаем кнопку добавления площадки, пока не verified
    const addBtn = document.getElementById('add-venue-top-btn');
    if (addBtn) {
        const canAdd = st === 'verified';
        addBtn.disabled = !canAdd;
        addBtn.title = canAdd ? '' : 'Добавление площадок доступно только после верификации';
        addBtn.classList.toggle('btn-disabled', !canAdd);
    }

    if (st === 'unverified' || st === 'rejected') {
        initVerificationFileUpload();
    }
}

// Список файлов верификации (объекты File)
let _verifyFiles = [];

function _updateVerifyGrid() {
    const grid = document.getElementById('verify-files-grid');
    const placeholder = document.getElementById('verify-placeholder');
    const uploadBtn = document.getElementById('verify-upload-btn');
    const statusEl = document.getElementById('verify-status');
    if (!grid) return;

    if (_verifyFiles.length === 0) {
        grid.innerHTML = '';
        grid.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
        if (uploadBtn) uploadBtn.disabled = true;
        return;
    }

    if (placeholder) placeholder.style.display = 'none';
    grid.style.display = 'flex';
    if (statusEl) statusEl.textContent = '';
    if (uploadBtn) uploadBtn.disabled = false;

    grid.innerHTML = '';

    _verifyFiles.forEach((file, idx) => {
        const card = document.createElement('div');
        card.className = 'verify-file-card';

        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

        const inner = document.createElement('div');
        inner.className = 'verify-file-card-inner' + (isPdf ? ' verify-file-card-pdf' : '');

        if (isPdf) {
            inner.innerHTML = `<span class="verify-pdf-badge">PDF</span><p class="verify-file-card-name">${file.name}</p>`;
        } else {
            const img = document.createElement('img');
            img.className = 'verify-file-card-img';
            img.alt = file.name;
            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(file);
            inner.appendChild(img);
            inner.insertAdjacentHTML('beforeend', `<p class="verify-file-card-name">${file.name}</p>`);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'verify-file-remove-btn';
        removeBtn.title = 'Удалить';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => { e.stopPropagation(); _removeVerifyFile(idx); });

        card.appendChild(inner);
        card.appendChild(removeBtn);
        grid.appendChild(card);
    });

    // Кнопка «+ Ещё» в конце сетки
    const addMore = document.createElement('div');
    addMore.className = 'verify-file-add-more';
    addMore.title = 'Добавить ещё файлы';
    addMore.textContent = '+';
    addMore.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('verify-file-input')?.click();
    });
    grid.appendChild(addMore);
}

function _removeVerifyFile(idx) {
    _verifyFiles.splice(idx, 1);
    _updateVerifyGrid();
}

function _addVerifyFiles(fileList) {
    const statusEl = document.getElementById('verify-status');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    let rejected = 0;
    Array.from(fileList).forEach(file => {
        const ok = allowed.includes(file.type) || /\.pdf$/i.test(file.name);
        if (!ok) { rejected++; return; }
        const alreadyAdded = _verifyFiles.some(f => f.name === file.name && f.size === file.size);
        if (!alreadyAdded) _verifyFiles.push(file);
    });
    if (rejected > 0 && statusEl) statusEl.textContent = `${rejected} файл(ов) пропущено — допустимы только JPG, PNG, PDF`;
    _updateVerifyGrid();
}

function initVerificationFileUpload() {
    _verifyFiles = [];
    const fileInput = document.getElementById('verify-file-input');
    const uploadArea = document.getElementById('verify-drop');
    if (!fileInput || !uploadArea) return;

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) _addVerifyFiles(fileInput.files);
        fileInput.value = '';
    });

    // Клик по пустой зоне (не по карточкам) открывает выбор файла
    uploadArea.addEventListener('click', (e) => {
        if (e.target === uploadArea) document.getElementById('verify-file-input')?.click();
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length) _addVerifyFiles(e.dataTransfer.files);
    });
}

async function submitVerificationDoc() {
    const btn = document.getElementById('verify-upload-btn');
    const statusEl = document.getElementById('verify-status');
    if (!_verifyFiles.length) return;
    btn.disabled = true;
    btn.textContent = 'Отправляю...';
    try {
        // Первый файл отправляем с reset=true — это сбрасывает старые пути в БД
        for (let i = 0; i < _verifyFiles.length; i++) {
            await API.uploadVerificationDoc(_verifyFiles[i], i === 0);
        }
        if (statusEl) statusEl.textContent = '';
        if (currentUser) {
            currentUser.verification_status = 'pending';
            renderVerificationBlock(currentUser);
        }
    } catch (e) {
        if (statusEl) statusEl.textContent = 'Ошибка: ' + e.message;
        btn.disabled = false;
        btn.textContent = 'Отправить на проверку';
    }
}

// ==================== ВЕРИФИКАЦИЯ (АДМИНИСТРАТОР) ====================

async function loadVerifications() {
    const container = document.getElementById('verifications-list');
    if (!container) return;
    if (!container.dataset.docModalBound) {
        container.dataset.docModalBound = '1';
        container.addEventListener('click', (e) => {
            const b = e.target.closest('.verify-doc-open-btn');
            if (!b) return;
            e.preventDefault();
            const path = b.getAttribute('data-doc-path');
            const isPdf = b.getAttribute('data-doc-type') === 'pdf';
            openVerificationDocModal(path, isPdf);
        });
    }
    try {
        const list = await API.getVerifications();
        if (!list || list.length === 0) {
            container.innerHTML = '<p class="empty-state">Заявок на верификацию нет.</p>';
            return;
        }
        const statusLabels = {
            pending:  '<span class="badge badge-info">На проверке</span>',
            verified: '<span class="badge badge-success">Одобрен</span>',
            rejected: '<span class="badge badge-danger">Отклонён</span>'
        };
        container.innerHTML = list.map(u => `
        <div class="booking-card" id="verify-card-${u.id}">
            <div class="booking-header">
                <div>
                    <h3>${u.full_name}</h3>
                    <p class="text-gray">${u.email}${u.phone ? ' · ' + u.phone : ''}</p>
                </div>
                ${statusLabels[u.verification_status] || ''}
            </div>
            ${(() => {
                if (!u.verification_doc_path) return '<p class="text-gray" style="margin:0.5rem 0">Документ не загружен</p>';
                let paths = [];
                try { paths = JSON.parse(u.verification_doc_path); if (!Array.isArray(paths)) paths = [u.verification_doc_path]; }
                catch (_) { paths = [u.verification_doc_path]; }
                return `<div class="verify-admin-docs">${paths.map((p, i) => {
                    const isPdf = /\.pdf$/i.test(p);
                    const ap = _verifyDocAttrEscape(p);
                    if (isPdf) {
                        return `<button type="button" class="verify-admin-doc-link verify-admin-doc-pdf verify-doc-open-btn" data-doc-type="pdf" data-doc-path="${ap}">PDF ${i + 1}</button>`;
                    }
                    return `<button type="button" class="verify-admin-doc-link verify-doc-open-btn" data-doc-type="image" data-doc-path="${ap}"><img src="${p}" alt="Документ ${i + 1}" class="verify-admin-doc-thumb"></button>`;
                }).join('')}</div>`;
            })()}
            ${u.verification_comment ? `<p class="verification-comment">Комментарий: <em>${u.verification_comment}</em></p>` : ''}
            ${u.verification_status === 'pending' ? `
            <div class="verify-decision-row" id="decide-row-${u.id}">
                <input type="text" class="search-input verify-comment-input" id="verify-comment-${u.id}" placeholder="Комментарий (необязательно при одобрении)">
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
                    <button class="btn-primary btn-booking-confirm" data-action="approve" data-uid="${u.id}">Одобрить</button>
                    <button class="btn-primary btn-booking-reject" data-action="reject" data-uid="${u.id}">Отклонить</button>
                </div>
            </div>` : ''}
        </div>`).join('');

        container.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = parseInt(btn.dataset.uid);
                const approved = btn.dataset.action === 'approve';
                const commentInput = document.getElementById(`verify-comment-${uid}`);
                const comment = commentInput?.value.trim() || null;
                if (!approved && !comment) {
                    alert('Укажите причину отклонения');
                    commentInput?.focus();
                    return;
                }
                try {
                    btn.disabled = true;
                    await API.decideVerification(uid, approved, comment);
                    loadVerifications();
                } catch (e) {
                    alert('Ошибка: ' + e.message);
                    btn.disabled = false;
                }
            });
        });
    } catch (e) {
        container.innerHTML = '<p class="empty-state">Ошибка загрузки заявок.</p>';
    }
}

// ==================== ИЗБРАННЫЕ ПЛОЩАДКИ (арендатор) ====================

async function loadFavoritesList() {
    const container = document.getElementById('favorites-list');
    if (!container) return;
    if (!currentUser || currentUser.role !== 'renter') return;
    container.style.minHeight = (container.offsetHeight || window.innerHeight) + 'px';
    container.innerHTML = '<p class="empty-state">Загрузка…</p>';
    try {
        const venues = await API.getFavoriteVenues();
        if (!venues || venues.length === 0) {
            container.style.minHeight = '';
            container.innerHTML = '<p class="empty-state">Нет избранных площадок. Добавьте их в каталоге или на странице площадки (кнопка «В избранное»).</p>';
            return;
        }
        container.style.minHeight = '';
        container.innerHTML = venues.map((v) => `
            <div class="favorite-row" data-venue-row="${v.id}">
                <div class="favorite-row-info">
                    <a href="/venue/${v.id}" class="favorite-venue-name">${v.name}</a>
                    <span class="favorite-venue-meta">${v.city || ''} · ${parseFloat(v.price_per_hour).toFixed(0)} ₽/час</span>
                </div>
                <button type="button" class="btn-danger favorite-remove-btn" data-remove-favorite="${v.id}">Удалить</button>
            </div>
        `).join('');
        container.querySelectorAll('[data-remove-favorite]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const vid = parseInt(btn.dataset.removeFavorite, 10);
                try {
                    await API.removeFavoriteVenue(vid);
                    if (typeof VenueFavorites !== 'undefined') VenueFavorites.invalidate();
                    await loadFavoritesList();
                } catch (e) {
                    alert(e.message || 'Ошибка');
                }
            });
        });
    } catch (e) {
        container.style.minHeight = '';
        container.innerHTML = '<p class="empty-state">Не удалось загрузить избранное.</p>';
    }
}

// ==================== МОИ ОТЗЫВЫ ====================

async function loadMyReviews() {
    const container = document.getElementById('my-reviews-list');
    if (!container) return;
    try {
        const reviews = await API.getMyReviews();
        if (!reviews || reviews.length === 0) {
            container.innerHTML = '<p class="empty-state">Вы пока не оставили ни одного отзыва.<br>Оставить отзыв можно на странице площадки после подтверждённого бронирования.</p>';
            return;
        }
        const starsHtml = (rating) => Array.from({length: 5}, (_, i) =>
            `<span style="color:${i < rating ? '#f59e0b' : '#ccc'}">★</span>`
        ).join('');
        container.innerHTML = reviews.map(r => `
            <div class="booking-card" data-review-id="${r.id}">
                <div class="booking-header">
                    <div>
                        <h3><a href="/venue/${r.venue_id}" class="venue-link">${r.venue_name}</a></h3>
                        ${r.booking_date ? `<p class="text-gray mt-sm">${new Date(r.booking_date + 'T00:00:00').toLocaleDateString('ru-RU', {day:'numeric',month:'long',year:'numeric'})}</p>` : ''}
                    </div>
                    <span style="font-size:1.3rem">${starsHtml(r.rating)}</span>
                </div>
                ${r.comment ? `<p class="text-gray" style="margin-top:0.5rem">${r.comment}</p>` : ''}
                <div style="margin-top:0.75rem">
                    <button class="btn-review-delete review-delete-cabinet-btn" data-review-id="${r.id}">Удалить отзыв</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.review-delete-cabinet-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Удалить этот отзыв?')) return;
                try {
                    await API.deleteReview(parseInt(btn.dataset.reviewId));
                    loadMyReviews();
                } catch (e) {
                    alert('Ошибка: ' + (e.message || e));
                }
            });
        });
    } catch (e) {
        container.innerHTML = '<p class="empty-state">Ошибка загрузки отзывов.</p>';
    }
}

// ==================== СТАТУСЫ БРОНИРОВАНИЙ ====================

const BOOKING_STATUS_LABELS = {
    'draft':            { text: 'В процессе',           cls: 'badge-secondary' },
    'pending_payment':  { text: 'Ожидает оплаты',      cls: 'badge-warning' },
    'payment_uploaded': { text: 'Чек загружен',         cls: 'badge-warning' },
    'confirmed':        { text: 'Подтверждено',         cls: 'badge-success' },
    'cancelled':        { text: 'Отменено',             cls: 'badge-danger' },
    'dispute':          { text: 'Спор',                 cls: 'badge-danger' }
};

function bookingStatusBadge(status) {
    const s = BOOKING_STATUS_LABELS[status] || { text: status, cls: 'badge-secondary' };
    return `<span class="badge ${s.cls}">${s.text}</span>`;
}

function formatBookingTime(b) {
    const date = new Date(b.booking_date + 'T00:00:00').toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
    const start = b.start_time ? b.start_time.substring(0, 5) : '—';
    const end   = b.end_time   ? b.end_time.substring(0, 5)   : '—';
    return `${date}, ${start}–${end}`;
}

function formatCountdown(seconds) {
    if (seconds <= 0) return '0:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

let _disputeTimerInterval = null;

let _receiptTimerInterval = null;

function startReceiptTimers(container, onExpire) {
    if (_receiptTimerInterval) clearInterval(_receiptTimerInterval);
    const blocks = container.querySelectorAll('.receipt-timer-block');
    if (blocks.length === 0) return;

    function tick() {
        const now = Date.now();
        let needRefresh = false;
        blocks.forEach(block => {
            const createdAt = block.dataset.createdAt;
            const timerEl = document.getElementById(`receipt-timer-${block.dataset.bookingId}`);
            if (!createdAt || !timerEl) return;
            const utcStr = /[Z+-]\d{2}:?\d{2}$/.test(createdAt) || createdAt.endsWith('Z') ? createdAt : createdAt + 'Z';
            const deadline = new Date(utcStr).getTime() + 24 * 60 * 60 * 1000;
            const left = Math.max(0, Math.floor((deadline - now) / 1000));
            if (left <= 0) {
                needRefresh = true;
                return;
            }
            timerEl.style.color = left < 3600 ? '#dc2626' : '';
            timerEl.textContent = formatCountdown(left);
        });
        if (needRefresh) {
            clearInterval(_receiptTimerInterval);
            _receiptTimerInterval = null;
            if (onExpire) onExpire();
        }
    }

    tick();
    _receiptTimerInterval = setInterval(tick, 1000);
}

function startDisputeTimers(container, onExpire) {
    if (_disputeTimerInterval) clearInterval(_disputeTimerInterval);
    const blocks = container.querySelectorAll('.dispute-timer-block');
    if (blocks.length === 0) return;

    function tick() {
        const now = Date.now();
        let needRefresh = false;
        blocks.forEach(block => {
            const uploadedAt = block.dataset.uploadedAt;
            const timerEl = document.getElementById(`timer-${block.dataset.bookingId}`);
            if (!uploadedAt || !timerEl) return;
            const utcStr = /[Z+-]\d{2}:?\d{2}$/.test(uploadedAt) || uploadedAt.endsWith('Z') ? uploadedAt : uploadedAt + 'Z';
            const deadline = new Date(utcStr).getTime() + 24 * 60 * 60 * 1000;
            const left = Math.max(0, Math.floor((deadline - now) / 1000));
            if (left <= 0) {
                needRefresh = true;
                return;
            }
            // Подсвечиваем красным если меньше часа
            timerEl.style.color = left < 3600 ? '#dc2626' : '';
            timerEl.textContent = formatCountdown(left);
        });
        if (needRefresh) {
            clearInterval(_disputeTimerInterval);
            _disputeTimerInterval = null;
            if (onExpire) onExpire();
        }
    }

    tick();
    _disputeTimerInterval = setInterval(tick, 1000);
}

// ==================== БРОНИРОВАНИЯ АРЕНДАТОРА ====================

async function loadRenterBookings() {
    const container = document.getElementById('renter-bookings-list');
    if (!container) return;
    try {
        const bookings = await API.getMyBookings();
        if (!bookings || bookings.length === 0) {
            container.innerHTML = '<p class="empty-state">У вас пока нет бронирований.</p>';
            return;
        }
        container.innerHTML = bookings.map(b => `
            <div class="booking-card" id="renter-booking-${b.id}">
                <div class="booking-header">
                    <div>
                        <h3><a href="/venue/${b.venue_id}" class="venue-link">${b.venue_name}</a></h3>
                        <p class="text-gray mt-sm">${b.venue_address}</p>
                        <p class="text-gray">${formatBookingTime(b)} · ${b.participants_count} чел.</p>
                    </div>
                    ${bookingStatusBadge(b.status)}
                </div>
                <div class="booking-info-row">
                    <div class="booking-cost-block">
                        <div class="booking-cost-label">Стоимость</div>
                        <div class="booking-cost-value">${parseFloat(b.total_price).toFixed(0)} ₽</div>
                    </div>
                    <div class="booking-cost-block">
                        <div class="booking-cost-label">Предоплата (20%)</div>
                        <div class="booking-cost-value-sm">${(parseFloat(b.total_price) * 0.2).toFixed(0)} ₽</div>
                    </div>
                    <div class="booking-cost-block">
                        <div class="booking-cost-label">Статус</div>
                        <div class="booking-cost-value-sm">${BOOKING_STATUS_LABELS[b.status]?.text || b.status}</div>
                    </div>
                    <div class="booking-actions">
                        ${b.receipt_path
                            ? `<button class="btn-secondary booking-action-btn" onclick="openReceiptModal('${b.receipt_path}')">Мой чек</button>`
                            : (b.status === 'draft' || b.status === 'pending_payment')
                                ? `<div class="receipt-upload-inline">
                                    <input type="file" id="receipt-input-${b.id}" accept="image/jpeg,image/png,image/webp" style="display:none" data-booking-id="${b.id}">
                                    <button class="btn-secondary booking-action-btn" data-trigger-receipt data-booking-id="${b.id}">Загрузить чек</button>
                                    <button class="btn-secondary booking-action-btn" data-cancel-booking data-booking-id="${b.id}">Отменить</button>
                                   </div>`
                                : '&nbsp;'}
                    </div>
                </div>
                ${(b.status === 'draft' || b.status === 'pending_payment') && !b.receipt_path && b.created_at ? `
                <div class="receipt-timer-block" data-booking-id="${b.id}" data-created-at="${b.created_at}">
                    <span class="dispute-timer-label">Осталось времени для загрузки чека:</span>
                    <span class="dispute-timer-value" id="receipt-timer-${b.id}">—</span>
                    <span class="dispute-hint">Если чек не будет загружен в течение 24 часов, бронирование отменится автоматически</span>
                </div>` : ''}
                ${b.status === 'payment_uploaded' && b.receipt_path && b.receipt_uploaded_at ? `
                <div class="dispute-timer-block" data-booking-id="${b.id}" data-uploaded-at="${b.receipt_uploaded_at}">
                    <span class="dispute-timer-label">До автоматического открытия спора:</span>
                    <span class="dispute-timer-value" id="timer-${b.id}">—</span>
                    <span class="dispute-hint">Если арендодатель не подтвердит в течение 24 часов, спор откроется автоматически</span>
                </div>` : b.status === 'dispute' ? `
                <div class="dispute-actions">
                    <span class="badge badge-danger">Спор открыт — ожидайте решения администратора</span>
                </div>` : ''}
                ${(b.status === 'cancelled' || b.status === 'dispute') && b.rejection_reason ? `
                <div class="rejection-reason-block">
                    <span class="rejection-reason-label">Причина отклонения:</span>
                    <span class="rejection-reason-text">${b.rejection_reason}</span>
                </div>` : ''}
            </div>
        `).join('');

        startReceiptTimers(container, loadRenterBookings);
        startDisputeTimers(container, loadRenterBookings);

        container.querySelectorAll('[data-trigger-receipt]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.bookingId;
                document.getElementById(`receipt-input-${id}`)?.click();
            });
        });
        container.querySelectorAll('[data-cancel-booking]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.bookingId);
                if (!confirm('Отменить бронирование? Слот будет освобождён.')) return;
                try {
                    btn.disabled = true;
                    await API.cancelBooking(id);
                    loadRenterBookings();
                } catch (err) {
                    alert('Ошибка: ' + err.message);
                    btn.disabled = false;
                }
            });
        });
        container.querySelectorAll('input[data-booking-id]').forEach(input => {
            if (input.type !== 'file') return;
            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const bookingId = parseInt(input.dataset.bookingId);
                const uploadBtn = container.querySelector(`[data-trigger-receipt][data-booking-id="${bookingId}"]`);
                try {
                    if (uploadBtn) uploadBtn.disabled = true;
                    await API.uploadReceipt(bookingId, file);
                    loadRenterBookings();
                } catch (err) {
                    alert('Ошибка загрузки чека: ' + err.message);
                    if (uploadBtn) uploadBtn.disabled = false;
                }
                input.value = '';
            });
        });
    } catch (e) {
        container.innerHTML = '<p class="empty-state">Ошибка загрузки бронирований.</p>';
    }
}

// ==================== БРОНИРОВАНИЯ АРЕНДОДАТЕЛЯ ====================

async function loadLandlordBookings() {
    const container = document.getElementById('landlord-bookings-list');
    if (!container) return;
    try {
        const bookings = await API.getLandlordBookings();
        if (!bookings || bookings.length === 0) {
            container.innerHTML = '<p class="empty-state">Бронирований пока нет.</p>';
            return;
        }
        container.innerHTML = bookings.map(b => {
            const hasReceipt = !!b.receipt_path;
            const canConfirm = b.status === 'payment_uploaded';
            return `
            <div class="booking-card" id="landlord-booking-${b.id}">
                <div class="booking-header">
                    <div>
                        <h3><a href="/venue/${b.venue_id}" class="venue-link">${b.venue_name}</a></h3>
                        <p class="text-gray mt-sm">${b.venue_address}</p>
                        <p class="text-gray">${formatBookingTime(b)} · ${b.participants_count} чел.</p>
                        <p class="text-gray">Арендатор: <strong>${b.renter_name}</strong> (${b.renter_email})</p>
                    </div>
                    ${bookingStatusBadge(b.status)}
                </div>
                <div class="booking-info-row">
                    <div class="booking-cost-block">
                        <div class="booking-cost-label">Стоимость</div>
                        <div class="booking-cost-value">${parseFloat(b.total_price).toFixed(0)} ₽</div>
                    </div>
                    <div class="booking-cost-block">
                        <div class="booking-cost-label">Предоплата (20%)</div>
                        <div class="booking-cost-value-sm">${(parseFloat(b.total_price) * 0.2).toFixed(0)} ₽</div>
                    </div>
                </div>
                ${hasReceipt ? `
                <div class="receipt-block">
                    <div class="receipt-label">Чек об оплате:</div>
                    <div class="receipt-content">
                        <span class="receipt-icon">&#128196;</span>
                        <button class="btn-secondary receipt-view-btn" onclick="openReceiptModal('${b.receipt_path}')">Просмотреть чек</button>
                    </div>
                </div>` : `
                <div class="receipt-block receipt-missing">
                    <span class="receipt-label">Чек ещё не загружен арендатором</span>
                </div>`}
                ${canConfirm ? `
                ${b.receipt_uploaded_at ? `
                <div class="dispute-timer-block dispute-timer-block--landlord" data-booking-id="${b.id}-l" data-uploaded-at="${b.receipt_uploaded_at}">
                    <span class="dispute-timer-label">Осталось времени на подтверждение:</span>
                    <span class="dispute-timer-value" id="timer-${b.id}-l">—</span>
                    <span class="dispute-hint">По истечении времени спор откроется автоматически</span>
                </div>` : ''}
                <div class="dispute-actions">
                    <button class="btn-primary btn-booking-confirm" data-action="confirm" data-id="${b.id}">Подтвердить бронирование</button>
                    <button class="btn-primary btn-booking-reject"  data-action="reject"  data-id="${b.id}">Отклонить</button>
                </div>` : (b.status === 'draft' || b.status === 'pending_payment') ? `
                <div class="dispute-actions">
                    <button class="btn-primary btn-booking-reject" data-action="reject" data-id="${b.id}">Отменить бронирование</button>
                </div>` : ''}
            </div>`;
        }).join('');

        startDisputeTimers(container, loadLandlordBookings);

        // Делегирование событий
        container.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.id);
                const action = btn.dataset.action;

                if (action === 'confirm') {
                    if (!confirm('Вы уверены, что хотите подтвердить бронирование?')) return;
                    try {
                        btn.disabled = true;
                        await API.confirmBooking(id);
                        loadLandlordBookings();
                    } catch (e) {
                        alert('Ошибка: ' + e.message);
                        btn.disabled = false;
                    }
                } else {
                    showRejectReasonModal(id, () => loadLandlordBookings());
                }
            });
        });

    } catch (e) {
        container.innerHTML = '<p class="empty-state">Ошибка загрузки бронирований.</p>';
    }
}

// ==================== ПРОСМОТР ЧЕКА ====================

function openReceiptModal(receiptPath) {
    const modal = document.getElementById('receipt-modal');
    const img = document.getElementById('receipt-modal-img');
    const base = window.location.origin;
    img.src = receiptPath.startsWith('http') ? receiptPath : base + receiptPath;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeReceiptModal(e) {
    if (e && e.target !== document.getElementById('receipt-modal')) return;
    const modal = document.getElementById('receipt-modal');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

// ==================== ПРОСМОТР ДОКУМЕНТОВ ВЕРИФИКАЦИИ (модалка) ====================

function _verifyDocAttrEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function openVerificationDocModal(path, isPdf) {
    const modal = document.getElementById('verify-doc-modal');
    const img = document.getElementById('verify-doc-modal-img');
    const iframe = document.getElementById('verify-doc-modal-iframe');
    const tabLink = document.getElementById('verify-doc-modal-tab-link');
    if (!modal || !img || !iframe) return;
    const base = window.location.origin;
    const url = path.startsWith('http') ? path : base + path;
    if (tabLink) {
        tabLink.href = url;
    }
    if (isPdf) {
        img.style.display = 'none';
        img.removeAttribute('src');
        iframe.style.display = 'block';
        iframe.src = url;
    } else {
        iframe.style.display = 'none';
        iframe.removeAttribute('src');
        img.style.display = 'block';
        img.src = url;
    }
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeVerificationDocModal(e) {
    if (e && e.target && e.target.id !== 'verify-doc-modal') return;
    const modal = document.getElementById('verify-doc-modal');
    const img = document.getElementById('verify-doc-modal-img');
    const iframe = document.getElementById('verify-doc-modal-iframe');
    if (modal) modal.style.display = 'none';
    if (img) {
        img.removeAttribute('src');
        img.style.display = 'none';
    }
    if (iframe) {
        iframe.removeAttribute('src');
        iframe.style.display = 'none';
    }
    document.body.style.overflow = '';
}

// ==================== ЗАГРУЗКА ПЛОЩАДОК АРЕНДОДАТЕЛЯ ====================

async function loadLandlordVenues() {
    const container = document.getElementById('landlord-venues-list');
    if (!container) return;

    try {
        const venues = await API.getVenues();
        const myVenues = venues.filter(v => v.owner_id === currentUser.id);

        if (myVenues.length === 0) {
            container.innerHTML = '<p class="empty-state">У вас пока нет добавленных площадок.</p>';
            return;
        }

        // Сохраняем данные площадок для доступа в editVenue/deleteVenue
        window._landlordVenues = myVenues;

        container.innerHTML = myVenues.map(venue => `
            <div class="booking-card" id="venue-card-${venue.id}">
                <div class="booking-header">
                    <div>
                        <h3>${venue.name}</h3>
                        <p class="text-gray mt-sm">${venue.address || ''}</p>
                        <p class="text-gray">${venue.sport_types || ''}</p>
                        <div class="venue-stats-row">
                            <div class="venue-stat-block">
                                <div class="venue-stat-label">Цена/час</div>
                                <div class="venue-stat-value">${venue.price_per_hour} ₽</div>
                            </div>
                            <div class="venue-stat-block">
                                <div class="venue-stat-label">Вместимость</div>
                                <div class="venue-stat-value">${venue.capacity} чел.</div>
                            </div>
                        </div>
                    </div>
                    <div class="venue-card-actions">
                        <button class="btn-secondary" data-action="edit" data-id="${venue.id}">Редактировать</button>
                        <button class="btn-danger" data-action="delete" data-id="${venue.id}">Удалить</button>
                    </div>
                </div>
            </div>
        `).join('');

        // Вешаем обработчики через делегирование
        container.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                if (btn.dataset.action === 'edit') editVenue(id);
                if (btn.dataset.action === 'delete') handleDeleteVenue(id);
            });
        });

    } catch (error) {
        console.error('Ошибка загрузки площадок:', error);
        container.innerHTML = '<p class="empty-state">Ошибка загрузки площадок</p>';
    }
}

function editVenue(venueId) {
    const venue = (window._landlordVenues || []).find(v => v.id === venueId);
    if (!venue) {
        alert('Данные площадки не найдены');
        return;
    }
    openVenueFormEdit(venue);
}

async function handleDeleteVenue(venueId) {
    const venue = (window._landlordVenues || []).find(v => v.id === venueId);
    const name = venue ? venue.name : 'площадку';
    if (!confirm(`Удалить "${name}"?\nЭто действие нельзя отменить.`)) return;
    try {
        await API.deleteVenue(venueId);
        document.getElementById(`venue-card-${venueId}`)?.remove();
        // Обновляем локальный список
        window._landlordVenues = (window._landlordVenues || []).filter(v => v.id !== venueId);
    } catch (error) {
        alert('Ошибка при удалении: ' + error.message);
    }
}

// ==================== ЗАГРУЗКА ИЗОБРАЖЕНИЙ ====================

function initImageUpload() {
    setupFileUploadArea(
        'venue-image-file',
        'image-upload-area',
        'image-upload-placeholder',
        'image-preview',
        'image-upload-status'
    );
    setupFileUploadArea(
        'venue-qr-file',
        'qr-upload-area',
        'qr-upload-placeholder',
        'qr-preview',
        'qr-upload-status'
    );
}

function setupFileUploadArea(inputId, areaId, placeholderId, previewId, statusId) {
    const fileInput = document.getElementById(inputId);
    const uploadArea = document.getElementById(areaId);
    if (!fileInput || !uploadArea) return;

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) showFilePreview(file, previewId, placeholderId);
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            fileInput.files = e.dataTransfer.files;
            showFilePreview(file, previewId, placeholderId);
        }
    });
}

function showFilePreview(file, previewId, placeholderId) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById(previewId);
        const placeholder = document.getElementById(placeholderId);
        if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
        if (placeholder) placeholder.style.display = 'none';
        // Показываем кнопку очистки
        const clearBtnId = previewId.replace('-preview', '-clear-btn');
        const clearBtn = document.getElementById(clearBtnId);
        if (clearBtn) clearBtn.style.display = 'flex';
    };
    reader.readAsDataURL(file);
}

function clearUploadField(previewId, placeholderId, inputId, hiddenId, statusId, clearBtnId) {
    const preview = document.getElementById(previewId);
    const placeholder = document.getElementById(placeholderId);
    const fileInput = document.getElementById(inputId);
    const hiddenInput = document.getElementById(hiddenId);
    const status = document.getElementById(statusId);
    const clearBtn = document.getElementById(clearBtnId);
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    if (placeholder) placeholder.style.display = '';
    if (fileInput) fileInput.value = '';
    if (hiddenInput) hiddenInput.value = '';
    if (status) status.textContent = '';
    if (clearBtn) clearBtn.style.display = 'none';
}

// Обратная совместимость
function showImagePreview(file) {
    showFilePreview(file, 'image-preview', 'image-upload-placeholder');
}

function setUploadStatus(elementId, msg, isError = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? '#dc2626' : 'var(--gray)';
}

function setImageUploadStatus(msg, isError = false) {
    setUploadStatus('image-upload-status', msg, isError);
}

function setExistingFilePreview(path, previewId, placeholderId, hiddenId) {
    if (!path) return;
    const preview = document.getElementById(previewId);
    const placeholder = document.getElementById(placeholderId);
    const hiddenInput = document.getElementById(hiddenId);
    if (preview) { preview.src = path; preview.style.display = 'block'; }
    if (placeholder) placeholder.style.display = 'none';
    if (hiddenInput) hiddenInput.value = path;
    const clearBtnId = previewId.replace('-preview', '-clear-btn');
    const clearBtn = document.getElementById(clearBtnId);
    if (clearBtn) clearBtn.style.display = 'flex';
}

function setExistingImagePreview(imagePath) {
    setExistingFilePreview(imagePath, 'image-preview', 'image-upload-placeholder', 'image-path-value');
}

function setExistingQrPreview(qrPath) {
    setExistingFilePreview(qrPath, 'qr-preview', 'qr-upload-placeholder', 'qr-path-value');
}

// Сброс полей загрузки при закрытии формы
function resetImageUpload() {
    [
        ['image-preview', 'image-upload-placeholder', 'venue-image-file', 'image-path-value', 'image-upload-status', 'image-clear-btn'],
        ['qr-preview',    'qr-upload-placeholder',    'venue-qr-file',    'qr-path-value',    'qr-upload-status',    'qr-clear-btn']
    ].forEach(([previewId, placeholderId, inputId, hiddenId, statusId, clearBtnId]) => {
        const preview = document.getElementById(previewId);
        const placeholder = document.getElementById(placeholderId);
        const fileInput = document.getElementById(inputId);
        const hiddenInput = document.getElementById(hiddenId);
        const status = document.getElementById(statusId);
        const clearBtn = document.getElementById(clearBtnId);
        if (preview) { preview.src = ''; preview.style.display = 'none'; }
        if (placeholder) placeholder.style.display = '';
        if (fileInput) fileInput.value = '';
        if (hiddenInput) hiddenInput.value = '';
        if (status) status.textContent = '';
        if (clearBtn) clearBtn.style.display = 'none';
    });
}

// ==================== ФОРМА ПЛОЩАДКИ ====================

function setVenueFieldError(name, message) {
    const span = document.getElementById('err-' + name);
    const input = document.querySelector(`#venue-form [name="${name}"]`);
    if (!span) return;
    if (message) {
        span.textContent = message;
        span.classList.add('visible');
        if (input) input.classList.add('input-error');
    } else {
        span.textContent = '';
        span.classList.remove('visible');
        if (input) input.classList.remove('input-error');
    }
}

function validateVenueField(name, value) {
    switch (name) {
        case 'name':
            if (!value || value.trim().length < 3) return 'Минимум 3 символа';
            if (value.trim().length > 100) return 'Максимум 100 символов';
            return '';
        case 'city':
            if (!value || value.trim() === '') return 'Выберите город';
            return '';
        case 'address':
            if (!value || value.trim().length < 1) return 'Укажите адрес';
            return '';
        case 'sport_types': {
            const checked = document.querySelectorAll('#venue-form input[name="sport_type_cb"]:checked').length;
            if (checked === 0) return 'Выберите хотя бы один вид спорта';
            return '';
        }
        case 'capacity': {
            const n = parseInt(value);
            if (!value || isNaN(n)) return 'Укажите вместимость';
            if (n < 1) return 'Минимум 1 человек';
            if (n > 5000) return 'Максимум 5000 человек';
            return '';
        }
        case 'area': {
            if (!value) return '';
            const n = parseFloat(value);
            if (isNaN(n)) return 'Введите число';
            if (n < 10) return 'Минимум 10 м²';
            if (n > 100000) return 'Максимум 100 000 м²';
            return '';
        }
        case 'price_per_hour': {
            const n = parseFloat(value);
            if (!value || isNaN(n)) return 'Укажите цену';
            if (n < 1) return 'Минимум 1 ₽';
            if (n > 10000000) return 'Максимум 10 000 000 ₽';
            return '';
        }
        default: return '';
    }
}

function validateVenueForm(formData) {
    const fields = ['name', 'city', 'address', 'sport_types', 'capacity', 'area', 'price_per_hour'];
    let valid = true;
    fields.forEach(name => {
        const err = validateVenueField(name, formData.get(name) || '');
        setVenueFieldError(name, err);
        if (err) valid = false;
    });
    return valid;
}

function initVenueForm() {
    const venueForm = document.getElementById('venue-form');
    if (!venueForm) return;

    const validatedFields = ['name', 'city', 'address', 'capacity', 'area', 'price_per_hour'];
    validatedFields.forEach(name => {
        const input = venueForm.querySelector(`[name="${name}"]`);
        if (!input) return;
        input.addEventListener('blur', () => {
            setVenueFieldError(name, validateVenueField(name, input.value));
        });
        input.addEventListener('input', () => {
            if (input.classList.contains('input-error')) {
                setVenueFieldError(name, validateVenueField(name, input.value));
            }
        });
    });

    // Валидация видов спорта при изменении чекбоксов
    venueForm.querySelectorAll('input[name="sport_type_cb"]').forEach(cb => {
        cb.addEventListener('change', () => {
            setVenueFieldError('sport_types', validateVenueField('sport_types', ''));
        });
    });

    venueForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        if (!validateVenueForm(formData)) return;
        const submitBtn = document.getElementById('venue-form-submit');

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Сохраняю...';

            // Проверяем наличие основного фото
            const imageFileInput = document.getElementById('venue-image-file');
            const existingImagePath = formData.get('image_path') || null;
            const hasMainImage = (imageFileInput?.files?.length > 0) || existingImagePath;
            if (!hasMainImage) {
                setUploadStatus('image-upload-status', 'Загрузите основное фото площадки', true);
                submitBtn.disabled = false;
                submitBtn.textContent = editingVenueId ? 'Сохранить изменения' : 'Создать площадку';
                return;
            }

            // Проверяем наличие QR-кода
            const qrFileInputCheck = document.getElementById('venue-qr-file');
            const existingQrPath = formData.get('qr_code_path') || null;
            const hasQr = (qrFileInputCheck?.files?.length > 0) || existingQrPath;
            if (!hasQr) {
                setUploadStatus('qr-upload-status', 'Загрузите QR-код для оплаты', true);
                submitBtn.disabled = false;
                submitBtn.textContent = editingVenueId ? 'Сохранить изменения' : 'Создать площадку';
                return;
            }

            // Загружаем фото площадки если выбрано
            let imagePath = existingImagePath;
            if (imageFileInput?.files?.length > 0) {
                setUploadStatus('image-upload-status', 'Загрузка фото...');
                const result = await API.uploadImage(imageFileInput.files[0]);
                imagePath = result.url;
                setUploadStatus('image-upload-status', 'Фото загружено');
            }

            // Загружаем QR-код если выбран
            let qrPath = formData.get('qr_code_path') || null;
            const qrFileInput = document.getElementById('venue-qr-file');
            if (qrFileInput?.files?.length > 0) {
                setUploadStatus('qr-upload-status', 'Загрузка QR-кода...');
                const result = await API.uploadImage(qrFileInput.files[0]);
                qrPath = result.url;
                setUploadStatus('qr-upload-status', 'QR-код загружен');
            }

            const selectedAmenities = Array.from(
                document.querySelectorAll('#venue-form input[name="amenity"]:checked')
            ).map(cb => cb.value);

            const selectedSports = Array.from(
                document.querySelectorAll('#venue-form input[name="sport_type_cb"]:checked')
            ).map(cb => cb.value).join(', ');

        const venueData = {
            name: formData.get('name'),
            city: formData.get('city'),
            address: formData.get('address'),
                sport_types: selectedSports,
            capacity: parseInt(formData.get('capacity')),
            area: formData.get('area') ? parseFloat(formData.get('area')) : null,
            price_per_hour: parseFloat(formData.get('price_per_hour')),
            description: formData.get('description') || null,
                image_path: imagePath,
                qr_code_path: qrPath,
                amenities: selectedAmenities
            };

            let savedVenue;
            if (editingVenueId) {
                savedVenue = await API.updateVenue(editingVenueId, venueData);
            } else {
                savedVenue = await API.createVenue(venueData);
            }

            // Загружаем дополнительные фото из накопленного массива
            if (_pendingExtraFiles.length > 0 && savedVenue?.id) {
                setUploadStatus('extra-images-status', 'Загрузка дополнительных фото...');
                for (const file of _pendingExtraFiles) {
                    await API.addVenueImage(savedVenue.id, file);
                }
                setUploadStatus('extra-images-status', 'Фото загружены');
                _pendingExtraFiles = [];
            }

            alert(editingVenueId ? 'Площадка успешно обновлена!' : 'Площадка успешно добавлена!');
            closeVenueForm();
            loadLandlordVenues();
        } catch (error) {
            console.error('Ошибка сохранения площадки:', error);
            setUploadStatus('image-upload-status', 'Ошибка: ' + error.message, true);
            alert('Ошибка: ' + error.message);
        } finally {
                submitBtn.disabled = false;
            submitBtn.textContent = editingVenueId ? 'Сохранить изменения' : 'Создать площадку';
        }
    });
}

// ==================== ПАНЕЛЬ СПОРОВ (АДМИНИСТРАТОР) ====================

const DISPUTE_STATUS_LABELS = {
    'open':              { text: 'Открыт',                       cls: 'badge-danger' },
    'resolved_renter':   { text: 'Решено в пользу арендатора',   cls: 'badge-success' },
    'resolved_landlord': { text: 'Решено в пользу арендодателя', cls: 'badge-secondary' }
};

let currentDisputeFilter = '';

async function loadAdminDisputes(filter = '') {
    currentDisputeFilter = filter;
    const container = document.getElementById('admin-disputes-list');
    if (!container) return;

    // Фиксируем высоту контейнера, чтобы страница не сжималась во время загрузки
    container.style.minHeight = (container.offsetHeight || window.innerHeight) + 'px';
    container.innerHTML = '<p class="empty-state">Загрузка...</p>';

    // Подсветка активной кнопки фильтра
    document.querySelectorAll('.dispute-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    try {
        const disputes = await API.getDisputes(filter || null);
        if (!disputes || disputes.length === 0) {
            container.style.minHeight = '';
            container.innerHTML = '<p class="empty-state">Споров по выбранному фильтру нет.</p>';
            return;
        }

        container.style.minHeight = '';
        container.innerHTML = disputes.map(d => {
            const s = DISPUTE_STATUS_LABELS[d.status] || { text: d.status, cls: 'badge-secondary' };
            const isOpen = d.status === 'open';
            const openedDate = new Date(d.opened_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const bookingDate = d.booking_date
                ? new Date(d.booking_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
                : '—';
            const timeRange = d.start_time && d.end_time
                ? `, ${d.start_time.substring(0,5)}–${d.end_time.substring(0,5)}`
                : '';

            return `
            <div class="booking-card dispute-card" id="dispute-card-${d.id}">
                <div class="booking-header">
                    <div>
                        <h3>Спор #${d.id} — <a href="/venue/${d.venue_id}" class="venue-link">${d.venue_name}</a></h3>
                        <p class="text-gray mt-sm">${d.venue_address}</p>
                        <p class="text-gray">Дата бронирования: ${bookingDate}${timeRange}</p>
                        <p class="text-gray">Открыт: ${openedDate}</p>
                    </div>
                    <span class="badge ${s.cls}">${s.text}</span>
                </div>
                <div class="dispute-parties">
                    <div class="dispute-party">
                        <span class="party-label">Арендатор</span>
                        <span class="party-name">${d.renter_name}</span>
                        <span class="party-email">${d.renter_email}</span>
                    </div>
                    <div class="dispute-vs">vs</div>
                    <div class="dispute-party">
                        <span class="party-label">Арендодатель</span>
                        <span class="party-name">${d.landlord_name}</span>
                        <span class="party-email">${d.landlord_email}</span>
                    </div>
                </div>
                <div class="dispute-finance">
                    <span>Стоимость бронирования: <strong>${d.total_price ? parseFloat(d.total_price).toFixed(0) + ' ₽' : '—'}</strong></span>
                    ${d.receipt_path ? `<button class="btn-secondary receipt-view-btn" onclick="openReceiptModal('${d.receipt_path}')">Просмотреть чек</button>` : '<span class="receipt-missing">Чек не загружен</span>'}
                </div>
                ${d.rejection_reason ? `
                <div class="rejection-reason-block">
                    <span class="rejection-reason-label">Причина отклонения арендодателем:</span>
                    <span class="rejection-reason-text">${d.rejection_reason}</span>
                </div>` : ''}
                ${d.resolution_text ? `
                <div class="dispute-resolution">
                    <strong>Решение:</strong>
                    <p>${d.resolution_text}</p>
                    ${d.resolved_by_name ? `<p class="text-gray">Администратор: ${d.resolved_by_name}</p>` : ''}
                </div>` : ''}
                ${isOpen ? `
                <div class="dispute-resolve-form" id="resolve-form-${d.id}">
                    <textarea class="dispute-resolution-text" id="resolution-text-${d.id}" placeholder="Опишите причину и обоснование решения..." rows="3"></textarea>
                    <div class="dispute-resolve-actions">
                        <button class="btn-primary btn-confirm" data-action="resolve-renter" data-dispute-id="${d.id}">Решить в пользу арендатора</button>
                        <button class="btn-primary btn-reject" data-action="resolve-landlord" data-dispute-id="${d.id}">Решить в пользу арендодателя</button>
                    </div>
                </div>` : ''}
            </div>`;
        }).join('');

        // Обработка кнопок разрешения
        container.querySelectorAll('[data-action^="resolve-"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const disputeId = parseInt(btn.dataset.disputeId);
                const resolveStatus = btn.dataset.action === 'resolve-renter' ? 'resolved_renter' : 'resolved_landlord';
                const textEl = document.getElementById(`resolution-text-${disputeId}`);
                const text = textEl ? textEl.value.trim() : '';
                if (!text) {
                    alert('Пожалуйста, укажите обоснование решения.');
                    textEl?.focus();
                    return;
                }
                const label = resolveStatus === 'resolved_renter' ? 'в пользу арендатора' : 'в пользу арендодателя';
                if (!confirm(`Вынести решение ${label}?\nЭто действие нельзя отменить.`)) return;
                try {
                    btn.disabled = true;
                    btn.closest('.dispute-resolve-actions').querySelectorAll('button').forEach(b => b.disabled = true);
                    await API.resolveDispute(disputeId, resolveStatus, text);
                    loadAdminDisputes(currentDisputeFilter);
                } catch (e) {
                    alert('Ошибка: ' + e.message);
                    btn.closest('.dispute-resolve-actions').querySelectorAll('button').forEach(b => b.disabled = false);
                }
            });
        });

    } catch (e) {
        container.style.minHeight = '';
        container.innerHTML = '<p class="empty-state">Ошибка загрузки споров.</p>';
        console.error('Ошибка загрузки споров:', e);
    }
}

async function loadAdminReviews() {
    const container = document.getElementById('admin-reviews-list');
    if (!container) return;
    container.style.minHeight = (container.offsetHeight || window.innerHeight) + 'px';
    container.innerHTML = '<p class="empty-state">Загрузка...</p>';
    try {
        const reviews = await API.getAllReviews();
        container.style.minHeight = '';
        if (!reviews || reviews.length === 0) {
            container.innerHTML = '<p class="empty-state">Отзывов нет.</p>';
            return;
        }
        const starsHtml = (rating) => Array.from({length: 5}, (_, i) =>
            `<span style="color:${i < rating ? '#f59e0b' : '#ccc'}">★</span>`
        ).join('');
        container.innerHTML = reviews.map(r => `
            <div class="booking-card" data-review-id="${r.id}">
                <div class="booking-header">
                    <div>
                        <h3><a href="/venue/${r.venue_id}" class="venue-link">${r.venue_name}</a></h3>
                        <p class="text-gray mt-sm">Автор: ${r.author_name}</p>
                        ${r.booking_date ? `<p class="text-gray mt-sm">${new Date(r.booking_date + 'T00:00:00').toLocaleDateString('ru-RU', {day:'numeric',month:'long',year:'numeric'})}</p>` : ''}
                    </div>
                    <span style="font-size:1.3rem">${starsHtml(r.rating)}</span>
                </div>
                ${r.comment ? `<p class="text-gray" style="margin-top:0.5rem">${r.comment}</p>` : ''}
                <div style="margin-top:0.75rem">
                    <button class="btn-review-delete admin-review-delete-btn" data-review-id="${r.id}">Удалить отзыв</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.admin-review-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Удалить этот отзыв?')) return;
                try {
                    await API.deleteReview(parseInt(btn.dataset.reviewId));
                    loadAdminReviews();
                } catch (e) {
                    alert('Ошибка: ' + (e.message || e));
                }
            });
        });
    } catch (e) {
        container.style.minHeight = '';
        container.innerHTML = '<p class="empty-state">Ошибка загрузки отзывов.</p>';
    }
}

function showRejectReasonModal(bookingId, onSuccess) {
    const existing = document.getElementById('reject-reason-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'reject-reason-modal';
    modal.className = 'reject-reason-overlay';
    modal.innerHTML = `
        <div class="reject-reason-dialog">
            <h3>Причина отклонения</h3>
            <p class="reject-reason-hint">Укажите причину, чтобы арендатор понял ситуацию. Это также поможет администратору при рассмотрении спора.</p>
            <textarea id="reject-reason-input" class="reject-reason-textarea" placeholder="Например: площадка занята на техническое обслуживание" maxlength="500" rows="4"></textarea>
            <div class="reject-reason-actions">
                <button class="btn-secondary" id="reject-reason-cancel">Отмена</button>
                <button class="btn-review-delete" id="reject-reason-confirm">Отклонить бронирование</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('reject-reason-cancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('reject-reason-confirm').addEventListener('click', async () => {
        const reason = document.getElementById('reject-reason-input').value.trim();
        const confirmBtn = document.getElementById('reject-reason-confirm');
        confirmBtn.disabled = true;
        try {
            await API.rejectBooking(bookingId, reason || null);
            modal.remove();
            onSuccess();
        } catch (e) {
            alert('Ошибка: ' + e.message);
            confirmBtn.disabled = false;
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    loadUserData();
    initVenueForm();
    initImageUpload();

    // Накопление дополнительных фото в массив и показ превью
    const extraInput = document.getElementById('extra-images-input');
    if (extraInput) {
        extraInput.addEventListener('change', () => {
            if (!extraInput.files.length) return;

            const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
            const MAX_SIZE = 5 * 1024 * 1024; // 5 МБ
            const MAX_EXTRA_PHOTOS = 10;
            const errors = [];

            const currentTotal = _savedExtraImages.length + _pendingExtraFiles.length;
            if (currentTotal >= MAX_EXTRA_PHOTOS) {
                const statusEl = document.getElementById('extra-images-status');
                if (statusEl) {
                    statusEl.textContent = `Максимум ${MAX_EXTRA_PHOTOS} дополнительных фото.`;
                    statusEl.style.color = '#dc2626';
                }
                extraInput.value = '';
                return;
            }

            for (const file of Array.from(extraInput.files)) {
                if (_savedExtraImages.length + _pendingExtraFiles.length >= MAX_EXTRA_PHOTOS) {
                    errors.push(`Достигнут лимит ${MAX_EXTRA_PHOTOS} фото — часть файлов не добавлена.`);
                    break;
                }
                if (!ALLOWED_TYPES.includes(file.type)) {
                    errors.push(`«${file.name}»: недопустимый формат. Разрешены JPG, PNG, WebP.`);
                    continue;
                }
                if (file.size > MAX_SIZE) {
                    errors.push(`«${file.name}»: файл больше 5 МБ.`);
                    continue;
                }
                _pendingExtraFiles.push(file);
            }

            extraInput.value = ''; // сброс, чтобы то же имя файла снова сработало
            renderExtraImages();

            if (errors.length) {
                const statusEl = document.getElementById('extra-images-status');
                if (statusEl) {
                    statusEl.textContent = errors.join(' ');
                    statusEl.style.color = '#dc2626';
                }
            }
        });
    }

    // Фильтры споров (администратор)
    document.querySelectorAll('.dispute-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => loadAdminDisputes(btn.dataset.filter));
    });
});
