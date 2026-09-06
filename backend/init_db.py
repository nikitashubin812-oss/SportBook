"""
Скрипт для инициализации БД и добавления тестовых данных
"""

from database import engine, SessionLocal
import models

def init_database():
    """Создание таблиц в БД"""
    print("Создание таблиц в базе данных...")
    models.Base.metadata.create_all(bind=engine)
    print("Таблицы созданы успешно!")


def add_test_data():
    """Добавление тестовых данных"""
    db = SessionLocal()
    
    try:
        print("\nДобавление тестовых пользователей...")
        
        # Проверка, есть ли уже пользователи
        existing_users = db.query(models.User).count()
        if existing_users > 0:
            print(f"В БД уже есть {existing_users} пользователей. Пропускаем добавление тестовых данных.")
            return
        
        # Администратор
        admin = models.User(
            email="admin@sportbook.ru",
            password="admin123",  # В реальном проекте нужно хешировать!
            full_name="Администратор Системы",
            phone="+79001234567",
            role=models.UserRole.ADMIN,

        )
        db.add(admin)
        
        # Арендодатели
        landlord1 = models.User(
            email="landlord1@example.com",
            password="landlord123",
            full_name="Иван Петров",
            phone="+79009876543",
            role=models.UserRole.LANDLORD,

        )
        db.add(landlord1)
        
        landlord2 = models.User(
            email="landlord2@example.com",
            password="landlord456",
            full_name="Мария Иванова",
            phone="+79001112233",
            role=models.UserRole.LANDLORD,

        )
        db.add(landlord2)
        
        # Арендаторы
        renter1 = models.User(
            email="renter1@example.com",
            password="renter123",
            full_name="Алексей Смирнов",
            phone="+79002223344",
            role=models.UserRole.RENTER,

        )
        db.add(renter1)
        
        renter2 = models.User(
            email="renter2@example.com",
            password="renter456",
            full_name="Ольга Соколова",
            phone="+79003334455",
            role=models.UserRole.RENTER,

        )
        db.add(renter2)
        
        db.commit()
        print("Пользователи добавлены")
        
        # Площадки
        print("\nДобавление тестовых площадок...")
        
        venue1 = models.Venue(
            owner_id=landlord1.id,
            name='Спортивный комплекс "Динамо"',
            address="Московская улица, 1В",
            city="Киров",
            description="Современный спортивный комплекс с качественным покрытием и отличным освещением.",
            sport_types="Футбол, Волейбол",
            capacity=20,
            area=400.00,
            price_per_hour=1200.00,
            qr_code_path="/qr/venue_1.png"
        )
        db.add(venue1)
        
        venue2 = models.Venue(
            owner_id=landlord1.id,
            name='Площадка "Сормовская 2"',
            address="Сормовская улица, 2",
            city="Киров",
            description="Универсальная крытая площадка для игровых видов спорта.",
            sport_types="Баскетбол, Волейбол, Футбол",
            capacity=15,
            area=350.00,
            price_per_hour=800.00,
            qr_code_path="/qr/venue_2.png"
        )
        db.add(venue2)
        
        venue3 = models.Venue(
            owner_id=landlord2.id,
            name='Теннисный корт "Олимп"',
            address="Ленина проспект, 45",
            city="Киров",
            description="Профессиональный теннисный корт с качественным покрытием.",
            sport_types="Теннис",
            capacity=4,
            area=260.00,
            price_per_hour=1500.00,
            qr_code_path="/qr/venue_3.png"
        )
        db.add(venue3)
        
        db.commit()
        print("Площадки добавлены")
        
        # Удобства
        print("\nДобавление удобств...")
        
        amenities = [
            models.Amenity(venue_id=venue1.id, name="Раздевалки"),
            models.Amenity(venue_id=venue1.id, name="Душевые"),
            models.Amenity(venue_id=venue1.id, name="Парковка"),
            models.Amenity(venue_id=venue1.id, name="Wi-Fi"),
            models.Amenity(venue_id=venue1.id, name="Инвентарь"),
            models.Amenity(venue_id=venue2.id, name="Раздевалки"),
            models.Amenity(venue_id=venue2.id, name="Душевые"),
            models.Amenity(venue_id=venue3.id, name="Раздевалки"),
            models.Amenity(venue_id=venue3.id, name="Парковка"),
        ]
        
        for amenity in amenities:
            db.add(amenity)
        
        db.commit()
        print("Удобства добавлены")
        
        print("\n" + "="*50)
        print("База данных успешно инициализирована!")
        print("="*50)
        print("\nТестовые учетные записи:")
        print(f"   Администратор: admin@sportbook.ru / admin123")
        print(f"   Арендодатель 1: landlord1@example.com / landlord123")
        print(f"   Арендодатель 2: landlord2@example.com / landlord456")
        print(f"   Арендатор 1: renter1@example.com / renter123")
        print(f"   Арендатор 2: renter2@example.com / renter456")
        print("\nЗапустите сервер: uvicorn main:app --reload")
        print("Документация API: http://localhost:8000/docs")
        
    except Exception as e:
        print(f"Ошибка: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 50)
    print("Инициализация базы данных SportBook")
    print("=" * 50)
    
    init_database()
    add_test_data()

