# 🚀 Быстрый старт SportBook

## 1. База данных (уже сделано ранее)

Если вы уже создали БД `sportbook` в pgAdmin4 и импортировали `database_postgresql.sql` - пропустите этот шаг.

Если нет:
1. Откройте **pgAdmin 4**
2. Создайте БД `sportbook`
3. Откройте Query Tool и выполните весь код из `prototype/database_postgresql.sql`

## 2. Настройка backend

```powershell
# Переходим в папку backend
cd backend

# Создаём виртуальное окружение (если ещё не создано)
python -m venv venv

# Активируем
.\venv\Scripts\Activate.ps1

# Устанавливаем зависимости
pip install -r requirements.txt

# Создаём файл .env
copy config.example.env .env
```

Откройте `.env` в блокноте и укажите ваш пароль PostgreSQL:

```env
DATABASE_URL="postgresql://postgres:ВАШ_ПАРОЛЬ@localhost:5432/sportbook"
SECRET_KEY="super-secret-key-change-in-production-12345"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

## 3. Запуск

```powershell
# Из папки backend
uvicorn main:app --reload
```

Откройте браузер: **http://localhost:8000**

## 4. Тестовые аккаунты

Для входа используйте:

- **Арендатор:** renter1@example.com / renter123
- **Арендодатель:** landlord1@example.com / landlord123  
- **Администратор:** admin@sportbook.ru / admin123

## 5. Структура сайта

- **Главная:** http://localhost:8000/
- **Каталог:** http://localhost:8000/catalog
- **Площадка:** http://localhost:8000/venue/1
- **Кабинет:** http://localhost:8000/cabinet
- **Вход:** http://localhost:8000/login
- **API документация:** http://localhost:8000/docs

---

**Важно:** Backend должен быть запущен, иначе HTML страницы не откроются!

