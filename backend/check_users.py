"""
Проверка пользователей в базе данных
"""
from database import SessionLocal
import models

db = SessionLocal()

try:
    print("=" * 50)
    print("Проверка пользователей в БД")
    print("=" * 50)
    
    users = db.query(models.User).all()
    print(f"\nВсего пользователей: {len(users)}\n")
    
    if len(users) == 0:
        print("БАЗА ДАННЫХ ПУСТАЯ! Нужно добавить тестовых пользователей.")
    else:
        for user in users:
            print(f"ID: {user.id}")
            print(f"Email: {user.email}")
            print(f"Имя: {user.full_name}")
            print(f"Роль: {user.role}")
            print(f"Пароль: {user.password}")
            print("-" * 30)
            
except Exception as e:
    print(f"ОШИБКА: {e}")
    import traceback
    traceback.print_exc()
finally:
    db.close()
