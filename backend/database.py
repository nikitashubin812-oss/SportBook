"""
Конфигурация подключения к базе данных PostgreSQL
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# Загрузка переменных окружения из .env файла
load_dotenv()

# URL подключения к базе данных
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/sportbook")

# Создание движка SQLAlchemy
engine = create_engine(DATABASE_URL, echo=True)

# Создание фабрики сессий
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Базовый класс для моделей
Base = declarative_base()

# Dependency для получения сессии БД
def get_db():
    """
    Создает сессию БД для каждого запроса и закрывает её после
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

