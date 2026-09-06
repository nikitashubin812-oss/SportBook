/**
 * API клиент для связи с backend FastAPI
 */

const API_URL = 'http://127.0.0.1:8000';

function extractErrorMessage(data, fallback = 'Ошибка запроса') {
    if (!data || !data.detail) return fallback;
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
        return data.detail.map(d => {
            if (typeof d === 'string') return d;
            const field = d.loc ? d.loc.slice(-1)[0] : '';
            const msg = d.msg || d.message || JSON.stringify(d);
            return field && field !== 'body' ? `${field}: ${msg}` : msg;
        }).join('; ');
    }
    return String(data.detail);
}

// Хранилище токена
class Auth {
    static getToken() {
        return localStorage.getItem('access_token');
    }
    
    static setToken(token) {
        localStorage.setItem('access_token', token);
    }
    
    static removeToken() {
        localStorage.removeItem('access_token');
    }
    
    static isAuthenticated() {
        return !!this.getToken();
    }
}

// Базовая функция для запросов
async function apiRequest(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    
    // Добавляем токен если есть
    const token = Auth.getToken();
    const headers = options.isFormData
        ? {}
        : { 'Content-Type': 'application/json', ...options.headers };
    
    if (token && !options.skipAuth) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const { isFormData, ...restOptions } = options;
    const config = {
        ...restOptions,
        headers
    };
    
    try {
        const response = await fetch(url, config);
        
        // Если 401 - токен истёк, выходим
        if (response.status === 401) {
            Auth.removeToken();
            window.location.href = '/cabinet';
            throw new Error('Необходима авторизация');
        }
        
        // 204 No Content — пустой ответ (например, DELETE)
        if (response.status === 204) {
            return null;
        }

        // Проверяем что ответ — JSON, иначе возвращаем текст ошибки
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(`Ошибка сервера (${response.status}): ${text.substring(0, 100)}`);
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(extractErrorMessage(data));
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ==================== АУТЕНТИФИКАЦИЯ ====================

async function register(userData) {
    return apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
        skipAuth: true
    });
}

async function login(email, password) {
    // OAuth2 требует form-data, а не JSON
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    
    const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
    });
    
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(extractErrorMessage(errData, 'Неверный email или пароль'));
    }
    
    const data = await response.json();
    
    // Сохраняем токен и данные пользователя
    Auth.setToken(data.access_token);
    localStorage.setItem('current_user', JSON.stringify(data.user));
    
    return data;
}

function logout() {
    Auth.removeToken();
    localStorage.removeItem('current_user');
    window.location.href = '/';
}

async function getCurrentUser() {
    if (!Auth.isAuthenticated()) {
        return null;
    }
    
    // Сначала проверяем localStorage
    const cachedUser = localStorage.getItem('current_user');
    if (cachedUser) {
        return JSON.parse(cachedUser);
    }
    
    // Если нет в кеше, запрашиваем с сервера
    try {
        const user = await apiRequest('/api/auth/me');
        localStorage.setItem('current_user', JSON.stringify(user));
        return user;
    } catch (error) {
        return null;
    }
}

// ==================== ПЛОЩАДКИ ====================

async function getVenues(filters = {}) {
    const params = new URLSearchParams(filters);
    return apiRequest(`/api/venues?${params}`, {
        skipAuth: true  // Каталог доступен без авторизации
    });
}

async function getVenue(venueId) {
    return apiRequest(`/api/venues/${venueId}`, {
        skipAuth: true
    });
}

async function createVenue(venueData) {
    return apiRequest('/api/venues', {
        method: 'POST',
        body: JSON.stringify(venueData)
    });
}

async function updateVenue(venueId, venueData) {
    return apiRequest(`/api/venues/${venueId}`, {
        method: 'PUT',
        body: JSON.stringify(venueData)
    });
}

async function uploadImage(file) {
    const token = Auth.getToken();
    if (!token) throw new Error('Необходима авторизация');

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/upload/image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Ошибка загрузки изображения');
    }
    return response.json();
}

async function deleteVenue(venueId) {
    return apiRequest(`/api/venues/${venueId}`, {
        method: 'DELETE'
    });
}

async function getVenueTimeSlots(venueId, date = null) {
    const params = date ? `?date=${date}` : '';
    return apiRequest(`/api/venues/${venueId}/time-slots${params}`, {
        skipAuth: true
    });
}

// ==================== БРОНИРОВАНИЯ ====================

async function getMyBookings() {
    return apiRequest('/api/bookings/my');
}

async function getVenueReviews(venueId) {
    return apiRequest(`/api/venues/${venueId}/reviews`, { skipAuth: true });
}

async function getMyReviews() {
    return apiRequest('/api/reviews/my');
}

async function createReview(reviewData) {
    return apiRequest('/api/reviews', {
        method: 'POST',
        body: JSON.stringify(reviewData)
    });
}

async function deleteReview(reviewId) {
    return apiRequest(`/api/reviews/${reviewId}`, { method: 'DELETE' });
}

async function addVenueImage(venueId, file) {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest(`/api/venues/${venueId}/images`, {
        method: 'POST',
        body: formData,
        isFormData: true
    });
}

async function deleteVenueImage(venueId, imageId) {
    return apiRequest(`/api/venues/${venueId}/images/${imageId}`, { method: 'DELETE' });
}

async function getAllReviews() {
    return apiRequest('/api/reviews');
}

async function getLandlordBookings() {
    return apiRequest('/api/bookings/landlord');
}

async function confirmBooking(bookingId) {
    return apiRequest(`/api/bookings/${bookingId}/confirm`, { method: 'POST' });
}

async function rejectBooking(bookingId, reason) {
    return apiRequest(`/api/bookings/${bookingId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || null })
    });
}

async function cancelBooking(bookingId) {
    return apiRequest(`/api/bookings/${bookingId}/cancel`, { method: 'POST' });
}

async function createBooking(bookingData) {
    return apiRequest('/api/bookings', {
        method: 'POST',
        body: JSON.stringify(bookingData)
    });
}

async function createBookingFlexible(bookingData) {
    return apiRequest('/api/bookings/flexible', {
        method: 'POST',
        body: JSON.stringify(bookingData)
    });
}

async function uploadReceipt(bookingId, file) {
    const formData = new FormData();
    formData.append('file', file);
    const token = Auth.getToken();
    const response = await fetch(`${API_URL}/api/bookings/${bookingId}/receipt`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
    });
    if (!response.ok) {
        let msg = 'Ошибка загрузки чека';
        try {
            const data = await response.json();
            if (data.detail) msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
        } catch {}
        throw new Error(msg);
    }
    return response.json();
}

// ==================== СПОРЫ ====================

async function openDispute(bookingId) {
    return apiRequest('/api/disputes', {
        method: 'POST',
        body: JSON.stringify({ booking_id: bookingId })
    });
}

async function getDisputes(statusFilter = null) {
    const url = statusFilter ? `/api/disputes?status_filter=${statusFilter}` : '/api/disputes';
    return apiRequest(url);
}

async function resolveDispute(disputeId, resolveStatus, resolutionText) {
    return apiRequest(`/api/disputes/${disputeId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ status: resolveStatus, resolution_text: resolutionText })
    });
}

// ==================== ВЕРИФИКАЦИЯ ====================

async function uploadVerificationDoc(file, reset = false) {
    const formData = new FormData();
    formData.append('file', file);
    const token = Auth.getToken();
    const url = `${API_URL}/api/verification/upload${reset ? '?reset=true' : ''}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(extractErrorMessage(data, 'Ошибка загрузки документа'));
    }
    return response.json();
}

async function getVerifications() {
    return apiRequest('/api/admin/verifications');
}

async function decideVerification(userId, approved, comment = null) {
    return apiRequest(`/api/admin/verifications/${userId}/decide`, {
        method: 'POST',
        body: JSON.stringify({ approved, comment })
    });
}

// ==================== ИЗБРАННОЕ (арендатор) ====================

async function getFavoriteVenueIds() {
    return apiRequest('/api/favorites/ids');
}

async function getFavoriteVenues() {
    return apiRequest('/api/favorites');
}

async function addFavoriteVenue(venueId) {
    return apiRequest(`/api/favorites/${venueId}`, { method: 'POST', body: '{}' });
}

async function removeFavoriteVenue(venueId) {
    return apiRequest(`/api/favorites/${venueId}`, { method: 'DELETE' });
}

// ==================== ЭКСПОРТ ====================

// Делаем доступным глобально
window.API = {
    Auth,
    register,
    login,
    logout,
    getCurrentUser,
    getVenues,
    getVenue,
    createVenue,
    updateVenue,
    deleteVenue,
    uploadImage,
    getVenueTimeSlots,
    getMyBookings,
    createBooking,
    createBookingFlexible,
    uploadReceipt,
    getLandlordBookings,
    confirmBooking,
    rejectBooking,
    cancelBooking,
    getVenueReviews,
    getMyReviews,
    createReview,
    deleteReview,
    getAllReviews,
    addVenueImage,
    deleteVenueImage,
    openDispute,
    getDisputes,
    resolveDispute,
    uploadVerificationDoc,
    getVerifications,
    decideVerification,
    getFavoriteVenueIds,
    getFavoriteVenues,
    addFavoriteVenue,
    removeFavoriteVenue
};

