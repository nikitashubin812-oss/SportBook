"""
Главный файл FastAPI приложения
"""

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse, Response
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import timedelta, datetime as dt
import os
import uuid
import shutil
from pathlib import Path

import json as _json
from sqlalchemy.orm import joinedload

import models
import schemas
import auth
from database import engine, get_db

# НЕ создаём таблицы автоматически - используем уже созданную БД через database_postgresql.sql
# models.Base.metadata.create_all(bind=engine)

# Определяем абсолютные пути к папкам проекта
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "prototype"
HTML_DIR = STATIC_DIR / "html"

# Создание приложения FastAPI
app = FastAPI(
    title="SportBook API",
    description="API для системы бронирования спортивных площадок",
    version="1.0.0"
)

# Подключение статических файлов (HTML, CSS, JS из prototype)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Настройка CORS для фронтенда
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== АУТЕНТИФИКАЦИЯ ====================

@app.post("/api/auth/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    """
    Регистрация нового пользователя
    """
    # Проверка, существует ли пользователь
    existing_user = auth.get_user_by_email(db, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже существует"
        )
    
    # Создание нового пользователя
    db_user = models.User(
        email=user_data.email,
        password=auth.get_password_hash(user_data.password),
        full_name=user_data.full_name,
        phone=user_data.phone,
        role=user_data.role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user


@app.post("/api/auth/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Вход пользователя (получение токена)
    """
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Создание токена
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@app.get("/api/auth/me", response_model=schemas.UserResponse)
def get_current_user_info(current_user: models.User = Depends(auth.get_current_user)):
    """
    Получение информации о текущем пользователе
    """
    return current_user


# ==================== ПЛОЩАДКИ ====================

@app.get("/api/venues", response_model=List[schemas.Venue])
def get_venues(
    city: str = None,
    sport_type: str = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Получение списка площадок с фильтрацией
    """
    query = db.query(models.Venue)
    
    if city:
        query = query.filter(models.Venue.city == city)
    if sport_type:
        query = query.filter(models.Venue.sport_types.contains(sport_type))
    
    venues = query.offset(skip).limit(limit).all()
    return venues


@app.get("/api/venues/{venue_id}", response_model=schemas.Venue)
def get_venue(venue_id: int, db: Session = Depends(get_db)):
    """
    Получение информации о конкретной площадке
    """
    venue = db.query(models.Venue).options(
        joinedload(models.Venue.owner)
    ).filter(models.Venue.id == venue_id).first()
    
    if not venue:
        raise HTTPException(status_code=404, detail="Площадка не найдена")
    return venue


# ==================== ИЗБРАННОЕ (арендатор) ====================

@app.get("/api/favorites/ids", response_model=schemas.FavoriteVenueIdsResponse)
def get_favorite_venue_ids(
    current_user: models.User = Depends(auth.get_current_renter),
    db: Session = Depends(get_db),
):
    """Список id избранных площадок текущего арендатора"""
    rows = (
        db.query(models.FavoriteVenue.venue_id)
        .filter(models.FavoriteVenue.user_id == current_user.id)
        .all()
    )
    return schemas.FavoriteVenueIdsResponse(venue_ids=[r[0] for r in rows])


@app.get("/api/favorites", response_model=List[schemas.Venue])
def list_favorite_venues(
    current_user: models.User = Depends(auth.get_current_renter),
    db: Session = Depends(get_db),
):
    """Полные данные избранных площадок (новые записи сверху)"""
    fav_rows = (
        db.query(models.FavoriteVenue)
        .filter(models.FavoriteVenue.user_id == current_user.id)
        .order_by(models.FavoriteVenue.id.desc())
        .all()
    )
    if not fav_rows:
        return []
    venue_ids = [f.venue_id for f in fav_rows]
    venues = (
        db.query(models.Venue)
        .options(joinedload(models.Venue.owner), joinedload(models.Venue.amenities))
        .filter(models.Venue.id.in_(venue_ids))
        .all()
    )
    by_id = {v.id: v for v in venues}
    return [by_id[i] for i in venue_ids if i in by_id]


@app.post("/api/favorites/{venue_id}", status_code=status.HTTP_201_CREATED)
def add_favorite_venue(
    venue_id: int,
    current_user: models.User = Depends(auth.get_current_renter),
    db: Session = Depends(get_db),
):
    """Добавить площадку в избранное"""
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Площадка не найдена")
    exists = (
        db.query(models.FavoriteVenue)
        .filter(
            models.FavoriteVenue.user_id == current_user.id,
            models.FavoriteVenue.venue_id == venue_id,
        )
        .first()
    )
    if not exists:
        db.add(models.FavoriteVenue(user_id=current_user.id, venue_id=venue_id))
        db.commit()
    return {"venue_id": venue_id}


@app.delete("/api/favorites/{venue_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite_venue(
    venue_id: int,
    current_user: models.User = Depends(auth.get_current_renter),
    db: Session = Depends(get_db),
):
    """Удалить площадку из избранного"""
    db.query(models.FavoriteVenue).filter(
        models.FavoriteVenue.user_id == current_user.id,
        models.FavoriteVenue.venue_id == venue_id,
    ).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/venues", response_model=schemas.Venue, status_code=status.HTTP_201_CREATED)
def create_venue(
    venue_data: schemas.VenueCreate,
    current_user: models.User = Depends(auth.get_current_landlord),
    db: Session = Depends(get_db)
):
    """
    Создание новой площадки (только для верифицированных арендодателей)
    """
    if current_user.verification_status != 'verified':
        raise HTTPException(
            status_code=403,
            detail="Добавление площадок доступно только после прохождения верификации. Загрузите документы в личном кабинете."
        )
    if not venue_data.qr_code_path:
        raise HTTPException(status_code=422, detail="QR-код для оплаты обязателен.")
    # Создание площадки
    db_venue = models.Venue(
        owner_id=current_user.id,
        name=venue_data.name,
        address=venue_data.address,
        city=venue_data.city,
        description=venue_data.description,
        sport_types=venue_data.sport_types,
        capacity=venue_data.capacity,
        area=venue_data.area,
        price_per_hour=venue_data.price_per_hour,
        image_path=venue_data.image_path,
        qr_code_path=venue_data.qr_code_path
    )
    db.add(db_venue)
    db.commit()
    db.refresh(db_venue)
    
    # Добавление удобств
    for amenity_name in venue_data.amenities:
        db_amenity = models.Amenity(venue_id=db_venue.id, name=amenity_name)
        db.add(db_amenity)
    
    db.commit()
    db.refresh(db_venue)
    
    return db_venue


@app.put("/api/venues/{venue_id}", response_model=schemas.Venue)
def update_venue(
    venue_id: int,
    venue_data: schemas.VenueUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Редактирование площадки (только владелец или администратор)
    """
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Площадка не найдена")

    if venue.owner_id != current_user.id and current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Нет прав для редактирования этой площадки")

    update_fields = venue_data.model_dump(exclude_unset=True)
    amenities_list = update_fields.pop('amenities', None)

    for field, value in update_fields.items():
        setattr(venue, field, value)

    if amenities_list is not None:
        db.query(models.Amenity).filter(models.Amenity.venue_id == venue_id).delete()
        for amenity_name in amenities_list:
            db.add(models.Amenity(venue_id=venue_id, name=amenity_name))

    db.commit()
    db.refresh(venue)
    return venue


@app.delete("/api/venues/{venue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_venue(
    venue_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Удаление площадки (только владелец или администратор)
    """
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Площадка не найдена")

    if venue.owner_id != current_user.id and current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Нет прав для удаления этой площадки")

    try:
        # Удаляем связанные записи вручную (обход FK-ограничений)
        # Отзывы → привязаны к бронированиям
        bookings = db.query(models.Booking).filter(models.Booking.venue_id == venue_id).all()
        for booking in bookings:
            db.query(models.Review).filter(models.Review.booking_id == booking.id).delete()
            db.query(models.Dispute).filter(models.Dispute.booking_id == booking.id).delete()
        db.query(models.Booking).filter(models.Booking.venue_id == venue_id).delete()
        db.query(models.TimeSlot).filter(models.TimeSlot.venue_id == venue_id).delete()
        db.query(models.Amenity).filter(models.Amenity.venue_id == venue_id).delete()

        db.delete(venue)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка при удалении: {str(e)}")


@app.get("/api/venues/{venue_id}/time-slots", response_model=List[schemas.TimeSlot])
def get_venue_time_slots(
    venue_id: int,
    date: str = None,
    db: Session = Depends(get_db)
):
    """
    Получение временных слотов для площадки
    """
    query = db.query(models.TimeSlot).filter(models.TimeSlot.venue_id == venue_id)
    
    if date:
        query = query.filter(models.TimeSlot.date == date)
    
    slots = query.all()
    return slots


# ==================== ЗАГРУЗКА ФАЙЛОВ ====================

UPLOAD_DIR = STATIC_DIR / "images" / "venues"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB

@app.post("/api/upload/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Загрузка изображения площадки (только для арендодателей и админов)
    """
    if current_user.role not in ['landlord', 'admin']:
        raise HTTPException(status_code=403, detail="Нет прав для загрузки файлов")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый формат файла. Разрешены: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Читаем файл и проверяем размер
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Файл слишком большой. Максимум 5 МБ")

    # Генерируем уникальное имя файла
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_name

    with open(file_path, "wb") as f:
        f.write(contents)

    public_url = f"/static/images/venues/{unique_name}"
    return {"url": public_url, "filename": unique_name}


@app.post("/api/venues/{venue_id}/images")
async def add_venue_image(
    venue_id: int,
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Добавить фотографию к площадке"""
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Площадка не найдена")
    if venue.owner_id != current_user.id and current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Нет прав")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Недопустимый формат. Разрешены: {', '.join(ALLOWED_EXTENSIONS)}")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Файл слишком большой. Максимум 5 МБ")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(contents)

    public_url = f"/static/images/venues/{unique_name}"
    count = db.query(models.VenueImage).filter(models.VenueImage.venue_id == venue_id).count()
    img = models.VenueImage(venue_id=venue_id, image_path=public_url)
    db.add(img)
    db.commit()
    db.refresh(img)
    return {"id": img.id, "image_path": img.image_path}


@app.delete("/api/venues/{venue_id}/images/{image_id}", status_code=204)
def delete_venue_image(
    venue_id: int,
    image_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Удалить фотографию площадки"""
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue or (venue.owner_id != current_user.id and current_user.role != 'admin'):
        raise HTTPException(status_code=403, detail="Нет прав")

    img = db.query(models.VenueImage).filter(
        models.VenueImage.id == image_id,
        models.VenueImage.venue_id == venue_id
    ).first()
    if not img:
        raise HTTPException(status_code=404, detail="Фото не найдено")

    # Удаляем файл с диска
    file_name = Path(img.image_path).name
    file_path = UPLOAD_DIR / file_name
    if file_path.exists():
        file_path.unlink()

    db.delete(img)
    db.commit()


# ==================== БРОНИРОВАНИЯ ====================

@app.get("/api/bookings/my", response_model=List[schemas.BookingWithDetails])
def get_my_bookings(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Получение бронирований текущего пользователя с деталями площадки"""
    _check_and_auto_cancel_bookings(db)
    _check_and_auto_open_disputes(db)
    bookings = db.query(models.Booking).filter(
        models.Booking.user_id == current_user.id
    ).order_by(models.Booking.id.desc()).all()

    result = []
    for b in bookings:
        result.append(schemas.BookingWithDetails(
            id=b.id,
            venue_id=b.venue_id,
            venue_name=b.venue.name if b.venue else f'Площадка #{b.venue_id}',
            venue_address=b.venue.address if b.venue else '—',
            renter_name=current_user.full_name,
            renter_email=current_user.email,
            booking_date=b.booking_date,
            start_time=b.start_time,
            end_time=b.end_time,
            participants_count=b.participants_count,
            total_price=b.total_price,
            status=b.status,
            created_at=getattr(b, 'created_at', None),
            receipt_path=b.receipt_path,
            receipt_uploaded_at=getattr(b, 'receipt_uploaded_at', None),
            rejection_reason=b.rejection_reason
        ))
    return result


def _create_booking_from_data(
    db: Session,
    current_user: models.User,
    venue_id: int,
    booking_date,
    start_time,
    end_time,
    participants_count: int,
    total_price
):
    """Найти или создать слот и создать бронирование"""
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Площадка не найдена")

    # Ищем существующий слот с такими же параметрами
    time_slot = db.query(models.TimeSlot).filter(
        models.TimeSlot.venue_id == venue_id,
        models.TimeSlot.date == booking_date,
        models.TimeSlot.start_time == start_time,
        models.TimeSlot.end_time == end_time
    ).first()

    if not time_slot:
        time_slot = models.TimeSlot(
            venue_id=venue_id,
            date=booking_date,
            start_time=start_time,
            end_time=end_time,
            status='available'
        )
        db.add(time_slot)
        db.flush()

    if time_slot.status != 'available':
        raise HTTPException(status_code=400, detail="Слот уже занят")

    db_booking = models.Booking(
        venue_id=venue_id,
        user_id=current_user.id,
        time_slot_id=time_slot.id,
        booking_date=booking_date,
        start_time=start_time,
        end_time=end_time,
        participants_count=participants_count,
        total_price=total_price,
        status='draft'
    )
    db.add(db_booking)
    time_slot.status = 'booked'
    db.commit()
    db.refresh(db_booking)
    return db_booking


@app.post("/api/bookings", response_model=schemas.Booking, status_code=status.HTTP_201_CREATED)
def create_booking(
    booking_data: schemas.BookingCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Создание бронирования по ID слота (legacy)"""
    time_slot = db.query(models.TimeSlot).filter(
        models.TimeSlot.id == booking_data.time_slot_id
    ).first()
    if not time_slot:
        raise HTTPException(status_code=404, detail="Временной слот не найден")
    if time_slot.status != 'available':
        raise HTTPException(status_code=400, detail="Слот недоступен для бронирования")
    venue = db.query(models.Venue).filter(models.Venue.id == booking_data.venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Площадка не найдена")
    if venue.capacity and booking_data.participants_count > venue.capacity:
        raise HTTPException(status_code=400, detail=f"Количество участников превышает вместимость площадки ({venue.capacity} чел.)")
    hours = (booking_data.end_time.hour - booking_data.start_time.hour) + (
        (booking_data.end_time.minute - booking_data.start_time.minute) / 60
    )
    total_price = float(venue.price_per_hour) * max(1, hours)
    db_booking = models.Booking(
        venue_id=booking_data.venue_id,
        user_id=current_user.id,
        time_slot_id=booking_data.time_slot_id,
        booking_date=booking_data.booking_date,
        start_time=booking_data.start_time,
        end_time=booking_data.end_time,
        participants_count=booking_data.participants_count,
        total_price=total_price,
        status='draft'
    )
    db.add(db_booking)
    time_slot.status = 'booked'
    db.commit()
    db.refresh(db_booking)
    return db_booking


@app.post("/api/bookings/flexible", response_model=schemas.Booking, status_code=status.HTTP_201_CREATED)
def create_booking_flexible(
    booking_data: schemas.BookingCreateFlexible,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Создание бронирования по дате и времени (слот создаётся автоматически)"""
    venue = db.query(models.Venue).filter(models.Venue.id == booking_data.venue_id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Площадка не найдена")
    if venue.capacity and booking_data.participants_count > venue.capacity:
        raise HTTPException(status_code=400, detail=f"Количество участников превышает вместимость площадки ({venue.capacity} чел.)")
    hours = (booking_data.end_time.hour - booking_data.start_time.hour) + (
        (booking_data.end_time.minute - booking_data.start_time.minute) / 60
    )
    total_price = float(venue.price_per_hour) * max(1, hours)
    return _create_booking_from_data(
        db, current_user,
        booking_data.venue_id,
        booking_data.booking_date,
        booking_data.start_time,
        booking_data.end_time,
        booking_data.participants_count,
        total_price
    )


@app.get("/api/bookings/landlord", response_model=List[schemas.BookingWithDetails])
def get_landlord_bookings(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Все бронирования площадок арендодателя"""
    if current_user.role not in ['landlord', 'admin']:
        raise HTTPException(status_code=403, detail="Нет прав")
    _check_and_auto_cancel_bookings(db)
    _check_and_auto_open_disputes(db)

    landlord_venue_ids = [v.id for v in db.query(models.Venue.id).filter(
        models.Venue.owner_id == current_user.id
    ).all()]

    if not landlord_venue_ids:
        return []

    bookings = db.query(models.Booking).filter(
        models.Booking.venue_id.in_(landlord_venue_ids)
    ).order_by(models.Booking.id.desc()).all()

    result = []
    for b in bookings:
        result.append(schemas.BookingWithDetails(
            id=b.id,
            venue_id=b.venue_id,
            venue_name=b.venue.name if b.venue else '—',
            venue_address=b.venue.address if b.venue else '—',
            renter_name=b.user.full_name if b.user else '—',
            renter_email=b.user.email if b.user else '—',
            booking_date=b.booking_date,
            start_time=b.start_time,
            end_time=b.end_time,
            participants_count=b.participants_count,
            total_price=b.total_price,
            status=b.status,
            created_at=getattr(b, 'created_at', None),
            receipt_path=b.receipt_path,
            receipt_uploaded_at=getattr(b, 'receipt_uploaded_at', None)
        ))
    return result


@app.post("/api/bookings/{booking_id}/confirm", response_model=schemas.Booking)
def confirm_booking(
    booking_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Подтверждение бронирования арендодателем"""
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Бронирование не найдено")
    venue = db.query(models.Venue).filter(models.Venue.id == booking.venue_id).first()
    if not venue or (venue.owner_id != current_user.id and current_user.role != 'admin'):
        raise HTTPException(status_code=403, detail="Нет прав")
    booking.status = 'confirmed'
    db.commit()
    db.refresh(booking)
    return booking


@app.post("/api/bookings/{booking_id}/cancel", response_model=schemas.Booking)
def cancel_booking_by_renter(
    booking_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Отмена бронирования арендатором (до загрузки чека). Освобождает слот."""
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Бронирование не найдено")
    if booking.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет прав")
    if booking.status not in ('draft', 'pending_payment'):
        raise HTTPException(status_code=400, detail="Отменить можно только бронирование в процессе (до загрузки чека)")
    if booking.receipt_path:
        raise HTTPException(status_code=400, detail="Бронирование с загруженным чеком нельзя отменить")

    booking.status = 'cancelled'
    if booking.time_slot_id:
        slot = db.query(models.TimeSlot).filter(models.TimeSlot.id == booking.time_slot_id).first()
        if slot:
            slot.status = 'available'
    db.commit()
    db.refresh(booking)
    return booking


class RejectBookingRequest(BaseModel):
    reason: Optional[str] = None

@app.post("/api/bookings/{booking_id}/reject", response_model=schemas.Booking)
def reject_booking(
    booking_id: int,
    data: RejectBookingRequest = RejectBookingRequest(),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Отклонение бронирования арендодателем. При наличии чека — автоматически открывается спор."""
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Бронирование не найдено")
    venue = db.query(models.Venue).filter(models.Venue.id == booking.venue_id).first()
    if not venue or (venue.owner_id != current_user.id and current_user.role != 'admin'):
        raise HTTPException(status_code=403, detail="Нет прав")

    if data.reason:
        booking.rejection_reason = data.reason.strip()

    if booking.receipt_path and not db.query(models.Dispute).filter(models.Dispute.booking_id == booking_id).first():
        db.add(models.Dispute(booking_id=booking_id, status='open'))
        booking.status = 'dispute'
    else:
        booking.status = 'cancelled'
    if booking.time_slot_id and booking.status == 'cancelled':
        slot = db.query(models.TimeSlot).filter(models.TimeSlot.id == booking.time_slot_id).first()
        if slot:
            slot.status = 'available'
    db.commit()
    db.refresh(booking)
    return booking


@app.post("/api/bookings/{booking_id}/receipt")
async def upload_booking_receipt(
    booking_id: int,
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Загрузка чека об оплате арендатором"""
    booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Бронирование не найдено")
    if booking.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет прав")

    ext = Path(file.filename).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".pdf"}:
        raise HTTPException(status_code=400, detail="Недопустимый формат файла")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой. Максимум 5 МБ")

    receipts_dir = STATIC_DIR / "images" / "receipts"
    receipts_dir.mkdir(parents=True, exist_ok=True)

    unique_name = f"receipt_{booking_id}_{uuid.uuid4().hex}{ext}"
    file_path = receipts_dir / unique_name
    with open(file_path, "wb") as f:
        f.write(contents)

    public_url = f"/static/images/receipts/{unique_name}"
    try:
        booking.receipt_path = public_url
        booking.receipt_uploaded_at = dt.utcnow()
        booking.status = 'payment_uploaded'  # допустимое значение ENUM в БД
        db.commit()
        db.refresh(booking)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка сохранения в БД: {str(e)}")

    return {"url": public_url, "booking_id": booking_id, "status": booking.status}


# ==================== СТАТИЧЕСКИЕ СТРАНИЦЫ ====================

@app.get("/")
def index():
    """Главная страница"""
    return FileResponse(str(HTML_DIR / "index.html"))


@app.get("/index.html")
def index_html():
    return RedirectResponse(url="/", status_code=301)


@app.get("/catalog")
def catalog():
    """Каталог площадок"""
    return FileResponse(str(HTML_DIR / "catalog.html"))


@app.get("/catalog.html")
def catalog_html():
    return RedirectResponse(url="/catalog", status_code=301)


@app.get("/venue/{venue_id}")
def venue_page(venue_id: int):
    """Страница площадки"""
    return FileResponse(str(HTML_DIR / "venue.html"))


@app.get("/cabinet")
def cabinet():
    """Личный кабинет"""
    return FileResponse(str(HTML_DIR / "cabinet.html"))


@app.get("/cabinet.html")
def cabinet_html():
    return RedirectResponse(url="/cabinet", status_code=301)


@app.get("/login")
def login_page():
    """Страница входа"""
    return FileResponse(str(HTML_DIR / "login.html"))


@app.get("/login.html")
def login_html():
    return RedirectResponse(url="/login", status_code=301)


@app.get("/about")
def about_page():
    """Страница о нас"""
    return FileResponse(str(HTML_DIR / "about.html"))


# ==================== ВЕРИФИКАЦИЯ АРЕНДОДАТЕЛЕЙ ====================

@app.post("/api/verification/upload")
async def upload_verification_doc(
    file: UploadFile = File(...),
    reset: bool = False,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Арендодатель загружает документ для верификации"""
    if current_user.role != 'landlord':
        raise HTTPException(status_code=403, detail="Только для арендодателей")
    if current_user.verification_status == 'verified':
        raise HTTPException(status_code=400, detail="Вы уже верифицированы")

    allowed = {'image/jpeg', 'image/png', 'image/webp', 'application/pdf'}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Допустимые форматы: JPG, PNG, PDF")

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
    filename = f"verify_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    # Сохраняем в prototype/images/venues/verification/ — эта папка уже раздаётся через /static/
    upload_dir = STATIC_DIR / "images" / "venues" / "verification"
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / filename

    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    public_url = f"/static/images/venues/verification/{filename}"

    # Если reset=True (первый файл новой отправки) — сбрасываем старые пути
    if reset:
        existing_paths = []
    else:
        existing_raw = current_user.verification_doc_path or '[]'
        try:
            existing_paths = _json.loads(existing_raw)
            if not isinstance(existing_paths, list):
                existing_paths = [existing_raw]
        except Exception:
            existing_paths = [existing_raw] if existing_raw and existing_raw != '[]' else []

    existing_paths.append(public_url)
    current_user.verification_doc_path = _json.dumps(existing_paths, ensure_ascii=False)
    current_user.verification_status = 'pending'
    current_user.verification_comment = None
    db.commit()
    return {"status": "pending", "doc_path": public_url}


@app.get("/api/admin/verifications", response_model=List[schemas.VerificationRequest])
def get_verifications(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Список заявок на верификацию для администратора"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Нет прав")
    users = db.query(models.User).filter(
        models.User.role == 'landlord',
        models.User.verification_status.in_(['pending', 'verified', 'rejected'])
    ).order_by(models.User.id.desc()).all()
    return users


@app.post("/api/admin/verifications/{user_id}/decide")
def decide_verification(
    user_id: int,
    data: schemas.VerificationDecision,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Администратор одобряет или отклоняет верификацию"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Нет прав")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or user.role != 'landlord':
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    user.verification_status = 'verified' if data.approved else 'rejected'
    user.verification_comment = data.comment
    db.commit()
    return {"status": user.verification_status}


# ==================== СПОРЫ ====================

def _check_and_auto_cancel_bookings(db: Session):
    """Автоматически отменяет бронирования без чека, если прошло более 24ч с момента создания"""
    threshold = dt.utcnow() - timedelta(hours=24)
    overdue = db.query(models.Booking).filter(
        models.Booking.status.in_(['draft', 'pending_payment']),
        models.Booking.receipt_path.is_(None),
        models.Booking.created_at.isnot(None),
        models.Booking.created_at <= threshold
    ).all()
    for b in overdue:
        # Освобождаем слот
        if b.time_slot:
            b.time_slot.status = 'available'
        b.status = 'cancelled'
    if overdue:
        db.commit()


def _check_and_auto_open_disputes(db: Session):
    """Автоматически открывает споры по бронированиям, где чек загружен более 24ч назад и арендодатель не подтвердил"""
    threshold = dt.utcnow() - timedelta(hours=24)
    overdue = db.query(models.Booking).filter(
        models.Booking.status == 'payment_uploaded',
        models.Booking.receipt_path.isnot(None),
        models.Booking.receipt_uploaded_at.isnot(None),
        models.Booking.receipt_uploaded_at <= threshold
    ).all()
    for b in overdue:
        if db.query(models.Dispute).filter(models.Dispute.booking_id == b.id).first():
            continue
        db.add(models.Dispute(booking_id=b.id, status='open'))
        b.status = 'dispute'
    if overdue:
        db.commit()


def _build_dispute_detail(d: models.Dispute) -> schemas.DisputeWithDetails:
    b = d.booking
    venue = b.venue if b else None
    renter = b.user if b else None
    landlord = venue.owner if venue else None
    return schemas.DisputeWithDetails(
        id=d.id,
        booking_id=d.booking_id,
        status=d.status,
        opened_at=d.opened_at,
        resolved_at=d.resolved_at,
        resolution_text=d.resolution_text,
        resolved_by_name=d.resolved_by_user.full_name if d.resolved_by_user else None,
        venue_id=venue.id if venue else 0,
        venue_name=venue.name if venue else '—',
        venue_address=venue.address if venue else '—',
        booking_date=b.booking_date if b else None,
        start_time=b.start_time if b else None,
        end_time=b.end_time if b else None,
        total_price=b.total_price if b else None,
        receipt_path=b.receipt_path if b else None,
        renter_name=renter.full_name if renter else '—',
        renter_email=renter.email if renter else '—',
        landlord_name=landlord.full_name if landlord else '—',
        landlord_email=landlord.email if landlord else '—',
        rejection_reason=b.rejection_reason if b else None,
    )


@app.post("/api/disputes", response_model=schemas.DisputeWithDetails, status_code=status.HTTP_201_CREATED)
def open_dispute(
    dispute_data: schemas.DisputeCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Открытие спора арендатором"""
    if current_user.role != 'renter':
        raise HTTPException(status_code=403, detail="Споры могут открывать только арендаторы")

    booking = db.query(models.Booking).filter(
        models.Booking.id == dispute_data.booking_id,
        models.Booking.user_id == current_user.id
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Бронирование не найдено")
    if not booking.receipt_path:
        raise HTTPException(status_code=400, detail="Нельзя открыть спор без загруженного чека")
    if booking.status not in ('cancelled', 'payment_uploaded'):
        raise HTTPException(status_code=400, detail="Спор можно открыть только при отменённом или неподтверждённом бронировании")

    existing = db.query(models.Dispute).filter(models.Dispute.booking_id == dispute_data.booking_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Спор по этому бронированию уже открыт")

    dispute = models.Dispute(booking_id=dispute_data.booking_id, status='open')
    booking.status = 'dispute'
    db.add(dispute)
    db.commit()
    db.refresh(dispute)
    return _build_dispute_detail(dispute)


@app.get("/api/disputes", response_model=List[schemas.DisputeWithDetails])
def get_disputes(
    status_filter: str = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Список споров (только для администратора)"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Только для администраторов")
    _check_and_auto_open_disputes(db)

    query = db.query(models.Dispute)
    if status_filter:
        query = query.filter(models.Dispute.status == status_filter)
    disputes = query.order_by(models.Dispute.id.desc()).all()
    return [_build_dispute_detail(d) for d in disputes]


@app.post("/api/disputes/{dispute_id}/resolve", response_model=schemas.DisputeWithDetails)
def resolve_dispute(
    dispute_id: int,
    resolve_data: schemas.DisputeResolve,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Разрешение спора администратором"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Только для администраторов")

    dispute = db.query(models.Dispute).filter(models.Dispute.id == dispute_id).first()
    if not dispute:
        raise HTTPException(status_code=404, detail="Спор не найден")
    if dispute.status != 'open':
        raise HTTPException(status_code=400, detail="Спор уже закрыт")

    if resolve_data.status not in ('resolved_renter', 'resolved_landlord'):
        raise HTTPException(status_code=400, detail="Некорректный статус решения")

    dispute.status = resolve_data.status
    dispute.resolution_text = resolve_data.resolution_text
    dispute.resolved_by = current_user.id
    dispute.resolved_at = dt.utcnow()

    booking = dispute.booking
    if booking:
        if resolve_data.status == 'resolved_renter':
            booking.status = 'confirmed'
        else:
            booking.status = 'cancelled'
            if booking.time_slot_id:
                slot = db.query(models.TimeSlot).filter(models.TimeSlot.id == booking.time_slot_id).first()
                if slot:
                    slot.status = 'available'

    db.commit()
    db.refresh(dispute)
    return _build_dispute_detail(dispute)


# ==================== ОТЗЫВЫ ====================

@app.get("/api/venues/{venue_id}/reviews", response_model=List[schemas.ReviewWithDetails])
def get_venue_reviews(venue_id: int, db: Session = Depends(get_db)):
    """Получение отзывов о площадке"""
    reviews = db.query(models.Review).filter(
        models.Review.venue_id == venue_id
    ).order_by(models.Review.id.desc()).all()

    result = []
    for r in reviews:
        result.append(schemas.ReviewWithDetails(
            id=r.id,
            venue_id=r.venue_id,
            venue_name=r.venue.name if r.venue else '—',
            user_id=r.user_id,
            author_name=r.user.full_name if r.user else 'Пользователь',
            booking_id=r.booking_id,
            booking_date=r.booking.booking_date if r.booking else None,
            rating=r.rating,
            comment=r.comment
        ))
    return result


@app.get("/api/reviews/my", response_model=List[schemas.ReviewWithDetails])
def get_my_reviews(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Мои отзывы"""
    reviews = db.query(models.Review).filter(
        models.Review.user_id == current_user.id
    ).order_by(models.Review.id.desc()).all()

    result = []
    for r in reviews:
        result.append(schemas.ReviewWithDetails(
            id=r.id,
            venue_id=r.venue_id,
            venue_name=r.venue.name if r.venue else '—',
            user_id=r.user_id,
            author_name=current_user.full_name,
            booking_id=r.booking_id,
            booking_date=r.booking.booking_date if r.booking else None,
            rating=r.rating,
            comment=r.comment
        ))
    return result


@app.post("/api/reviews", response_model=schemas.ReviewWithDetails, status_code=status.HTTP_201_CREATED)
def create_review(
    review_data: schemas.ReviewCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Создание отзыва (только для арендаторов с подтверждённым бронированием)"""
    if current_user.role != 'renter':
        raise HTTPException(status_code=403, detail="Отзывы могут оставлять только арендаторы")

    booking = db.query(models.Booking).filter(
        models.Booking.id == review_data.booking_id,
        models.Booking.user_id == current_user.id,
        models.Booking.status == 'confirmed'
    ).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Подтверждённое бронирование не найдено")

    existing = db.query(models.Review).filter(
        models.Review.booking_id == review_data.booking_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Вы уже оставили отзыв на это бронирование")

    review = models.Review(
        venue_id=booking.venue_id,
        user_id=current_user.id,
        booking_id=review_data.booking_id,
        rating=review_data.rating,
        comment=review_data.comment
    )
    db.add(review)

    # Обновляем средний рейтинг площадки
    all_ratings = [r.rating for r in db.query(models.Review).filter(
        models.Review.venue_id == booking.venue_id
    ).all()] + [review_data.rating]
    venue = db.query(models.Venue).filter(models.Venue.id == booking.venue_id).first()
    if venue:
        venue.rating = round(sum(all_ratings) / len(all_ratings), 2)

    db.commit()
    db.refresh(review)
    return schemas.ReviewWithDetails(
        id=review.id,
        venue_id=review.venue_id,
        venue_name=venue.name if venue else '—',
        user_id=review.user_id,
        author_name=current_user.full_name,
        booking_id=review.booking_id,
        booking_date=booking.booking_date,
        rating=review.rating,
        comment=review.comment
    )


@app.delete("/api/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(
    review_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Удаление отзыва: арендатор — свой, администратор — любой"""
    review = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Отзыв не найден")

    if current_user.role == 'admin':
        pass
    elif current_user.role == 'renter' and review.user_id == current_user.id:
        pass
    else:
        raise HTTPException(status_code=403, detail="Нет прав для удаления этого отзыва")

    venue_id = review.venue_id
    db.delete(review)
    db.commit()

    # Пересчитываем рейтинг площадки
    remaining = db.query(models.Review).filter(models.Review.venue_id == venue_id).all()
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if venue:
        if remaining:
            venue.rating = round(sum(r.rating for r in remaining) / len(remaining), 2)
        else:
            venue.rating = 0
        db.commit()


@app.get("/api/reviews", response_model=List[schemas.ReviewWithDetails])
def get_all_reviews(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Все отзывы (только для администратора)"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещён")

    reviews = db.query(models.Review).order_by(models.Review.id.desc()).all()
    result = []
    for r in reviews:
        booking = db.query(models.Booking).filter(models.Booking.id == r.booking_id).first()
        venue = db.query(models.Venue).filter(models.Venue.id == r.venue_id).first()
        author = db.query(models.User).filter(models.User.id == r.user_id).first()
        result.append(schemas.ReviewWithDetails(
            id=r.id,
            venue_id=r.venue_id,
            venue_name=venue.name if venue else '—',
            user_id=r.user_id,
            author_name=author.full_name if author else '—',
            booking_id=r.booking_id,
            booking_date=booking.booking_date if booking else None,
            rating=r.rating,
            comment=r.comment
        ))
    return result


# ==================== ЗДОРОВЬЕ API ====================

@app.get("/health")
def health_check():
    """
    Проверка здоровья приложения
    """
    return {"status": "healthy", "message": "SportBook API работает!"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)

