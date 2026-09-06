@echo off
chcp 65001 >nul
title SportBook - Запуск сервера

echo =====================================
echo   SportBook - Запуск сервера
echo =====================================
echo.

cd /d "%~dp0backend"

if not exist "venv\Scripts\python.exe" (
    echo [1/3] Создание виртуального окружения...
    python -m venv venv
    if errorlevel 1 (
        echo ОШИБКА: не удалось создать venv. Убедись что Python установлен.
        pause
        exit /b 1
    )
    echo.
)

echo [2/3] Установка зависимостей...
venv\Scripts\python.exe -m pip install -r requirements.txt -q
echo Зависимости установлены.
echo.

echo [3/3] Запуск сервера...
echo.
echo  Сайт: http://127.0.0.1:8000
echo  Остановка: Ctrl+C
echo.
start "" http://127.0.0.1:8000
venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

pause
