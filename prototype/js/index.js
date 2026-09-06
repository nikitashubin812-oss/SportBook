document.addEventListener('DOMContentLoaded', () => {
    // Поиск площадок
    const searchBtn = document.querySelector('.search-box .btn-primary');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const inputs = document.querySelectorAll('.search-box .search-input');
            const city = inputs[0]?.value || '';
            const sport = inputs[1]?.value || '';

            const params = new URLSearchParams();
            if (city && city !== 'Выберите город') params.append('city', city);
            if (sport && sport !== 'Вид спорта') params.append('sport', sport);

            window.location.href = `/catalog?${params.toString()}`;
        });
    }

    // Обновить кнопку входа, если уже авторизован
    if (typeof API !== 'undefined' && API.Auth.isAuthenticated()) {
        const loginBtn = document.querySelector('.btn-login');
        if (loginBtn) {
            loginBtn.textContent = 'Кабинет';
            loginBtn.href = '/cabinet';
        }
    }
});
