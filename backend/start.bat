@echo off
echo ====================================
echo   SportBook Backend - Запуск
echo ====================================
echo.

REM Проверка виртуального окружения
if not exist "venv\Scripts\activate.bat" (
    echo Создаю виртуальное окружение...
    python -m venv venv
    echo.
)

REM Активация виртуального окружения
call venv\Scripts\activate.bat

REM Проверка .env файла
if not exist ".env" (
    echo ОШИБКА: Файл .env не найден!
    echo Скопируйте config.example.env в .env и укажите параметры БД
    echo.
    pause
    exit /b 1
)

REM Установка зависимостей
echo Устанавливаю зависимости...
pip install -q -r requirements.txt

echo.
echo ====================================
echo   Запуск сервера...
echo ====================================
echo.
echo Сервер будет доступен по адресу:
echo http://localhost:8000
echo.
echo Документация API:
echo http://localhost:8000/docs
echo.
echo Для остановки нажмите Ctrl+C
echo.

REM Запуск FastAPI
uvicorn main:app --reload --host 0.0.0.0 --port 8000

pause

