// Переключение между формами
function switchToRegister() {
    document.getElementById('login-card').style.display = 'none';
    document.getElementById('register-form-container').classList.add('visible');
}

function switchToLogin() {
    document.getElementById('login-card').style.display = 'block';
    document.getElementById('register-form-container').classList.remove('visible');
    clearAllFieldErrors();
}

// ==================== ПОКАЗ ОШИБОК ====================

function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
}

function hideError(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.style.display = 'none';
}

function setFieldError(inputId, errorId, message) {
    const input = document.getElementById(inputId);
    const err   = document.getElementById(errorId);
    if (err) {
        err.textContent = message || '';
        err.classList.toggle('visible', !!message);
    }
    if (input) input.classList.toggle('input-error', !!message);
    return !!message;
}

function clearAllFieldErrors() {
    ['err-email', 'err-fullname', 'err-phone', 'err-password'].forEach(id => setFieldError('', id, ''));
}

// ==================== ПРАВИЛА ВАЛИДАЦИИ ====================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value) {
    if (!value) return 'Введите email';
    if (!EMAIL_RE.test(value)) return 'Некорректный формат email';
    if (value.length > 100) return 'Email не более 100 символов';
    return '';
}

function validateFullName(value) {
    if (!value) return 'Введите имя';
    if (value.length < 2) return 'Имя не менее 2 символов';
    if (value.length > 20) return 'Имя не более 20 символов';
    return '';
}

function validatePhone(value) {
    if (!value) return ''; // необязательное поле
    if (!/^[+\d\s\-()]+$/.test(value)) return 'Телефон может содержать только цифры и символы + - ( )';
    if (value.length > 20) return 'Телефон не более 20 символов';
    return '';
}

function validatePassword(value) {
    if (!value) return 'Введите пароль';
    if (value.length < 6) return 'Пароль не менее 6 символов';
    if (value.length > 20) return 'Пароль не более 20 символов';
    return '';
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

document.addEventListener('DOMContentLoaded', () => {
    if (API.Auth.isAuthenticated()) {
        window.location.href = '/cabinet';
        return;
    }

    // Форма входа
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('error-message');
        const email    = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
            await API.login(email, password);
            window.location.href = '/cabinet';
        } catch (error) {
            showError('error-message', error.message);
        }
    });

    // Валидация по blur (потеря фокуса)
    document.getElementById('reg-email').addEventListener('blur', (e) => {
        setFieldError('reg-email', 'err-email', validateEmail(e.target.value.trim()));
    });
    document.getElementById('reg-fullname').addEventListener('blur', (e) => {
        setFieldError('reg-fullname', 'err-fullname', validateFullName(e.target.value.trim()));
    });
    document.getElementById('reg-phone').addEventListener('blur', (e) => {
        setFieldError('reg-phone', 'err-phone', validatePhone(e.target.value.trim()));
    });
    document.getElementById('reg-phone').addEventListener('keypress', (e) => {
        if (!/[\d+\s\-().]/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
    });
    document.getElementById('reg-password').addEventListener('blur', (e) => {
        setFieldError('reg-password', 'err-password', validatePassword(e.target.value));
    });

    // Сброс ошибки при вводе
    ['reg-email', 'reg-fullname', 'reg-phone', 'reg-password'].forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            const errId = id.replace('reg-', 'err-').replace('fullname', 'fullname');
            const errMap = { 'reg-email': 'err-email', 'reg-fullname': 'err-fullname', 'reg-phone': 'err-phone', 'reg-password': 'err-password' };
            const errEl = document.getElementById(errMap[id]);
            if (errEl && errEl.textContent) {
                errEl.textContent = '';
                errEl.classList.remove('visible');
                e.target.classList.remove('input-error');
            }
        });
    });

    // Форма регистрации
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError('register-error-message');

        const email    = document.getElementById('reg-email').value.trim();
        const fullName = document.getElementById('reg-fullname').value.trim();
        const phone    = document.getElementById('reg-phone').value.trim() || null;
        const password = document.getElementById('reg-password').value;
        const role     = document.getElementById('reg-role').value;

        // Финальная валидация всех полей перед отправкой
        const e1 = setFieldError('reg-email',    'err-email',    validateEmail(email));
        const e2 = setFieldError('reg-fullname', 'err-fullname', validateFullName(fullName));
        const e3 = setFieldError('reg-phone',    'err-phone',    validatePhone(phone || ''));
        const e4 = setFieldError('reg-password', 'err-password', validatePassword(password));

        if (e1 || e2 || e3 || e4) return;

        const userData = { email, full_name: fullName, phone, password, role };
        try {
            await API.register(userData);
            await API.login(email, password);
            window.location.href = '/cabinet';
        } catch (error) {
            showError('register-error-message', error.message);
        }
    });
});
