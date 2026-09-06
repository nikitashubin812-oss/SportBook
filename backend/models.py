"""
Модели SQLAlchemy для базы данных
"""

from sqlalchemy import Column, Integer, String, Text, Date, Time, Numeric, ForeignKey, Enum, TIMESTAMP, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime as _dt
import enum
from database import Base

def dt_utcnow():
    return _dt.utcnow()


# Enum типы
class UserRole(str, enum.Enum):
    RENTER = "renter"
    LANDLORD = "landlord"
    ADMIN = "admin"


class SlotStatus(str, enum.Enum):
    AVAILABLE = "available"
    BOOKED = "booked"
    PENDING = "pending"


class BookingStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_PAYMENT = "pending_payment"
    PAYMENT_UPLOADED = "payment_uploaded"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    DISPUTE = "dispute"


class DisputeStatus(str, enum.Enum):
    OPEN = "open"
    UNDER_REVIEW = "under_review"
    RESOLVED_RENTER = "resolved_renter"
    RESOLVED_LANDLORD = "resolved_landlord"


# Модели таблиц
class User(Base):
    """Пользователи системы"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20))
    role = Column(String(50), nullable=False, default='renter', index=True)
    verification_status = Column(String(20), nullable=False, default='unverified')
    verification_doc_path = Column(String(500))
    verification_comment = Column(Text)

    # Связи
    owned_venues = relationship("Venue", back_populates="owner", foreign_keys="Venue.owner_id")
    bookings = relationship("Booking", back_populates="user", foreign_keys="Booking.user_id")
    reviews = relationship("Review", back_populates="user")
    resolved_disputes = relationship("Dispute", back_populates="resolved_by_user", foreign_keys="Dispute.resolved_by")
    favorite_venues = relationship("FavoriteVenue", back_populates="user", cascade="all, delete-orphan")


class Venue(Base):
    """Спортивные площадки"""
    __tablename__ = "venues"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    address = Column(String(500), nullable=False)
    city = Column(String(100), nullable=False, index=True)
    description = Column(Text)
    sport_types = Column(String(255), nullable=False)
    capacity = Column(Integer, nullable=False)
    area = Column(Numeric(10, 2))
    price_per_hour = Column(Numeric(10, 2), nullable=False)
    rating = Column(Numeric(3, 2), default=0.00, index=True)
    image_path = Column(String(500))
    qr_code_path = Column(String(500))

    # Связи
    owner = relationship("User", back_populates="owned_venues", foreign_keys=[owner_id])
    images = relationship("VenueImage", back_populates="venue", cascade="all, delete-orphan")
    amenities = relationship("Amenity", back_populates="venue", cascade="all, delete-orphan")
    time_slots = relationship("TimeSlot", back_populates="venue", cascade="all, delete-orphan")
    bookings = relationship("Booking", back_populates="venue")
    reviews = relationship("Review", back_populates="venue")
    favorited_by = relationship("FavoriteVenue", back_populates="venue", cascade="all, delete-orphan")

    @property
    def reviews_count(self):
        return len(self.reviews) if self.reviews is not None else 0

    __table_args__ = (
        CheckConstraint('capacity > 0', name='check_capacity_positive'),
        CheckConstraint('area > 0', name='check_area_positive'),
        CheckConstraint('price_per_hour > 0', name='check_price_positive'),
        CheckConstraint('rating >= 0 AND rating <= 5', name='check_rating_range'),
    )


class VenueImage(Base):
    """Фотографии площадок"""
    __tablename__ = "venue_images"

    id = Column(Integer, primary_key=True, index=True)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    image_path = Column(String(500), nullable=False)

    venue = relationship("Venue", back_populates="images")


class Amenity(Base):
    """Удобства площадок"""
    __tablename__ = "amenities"

    id = Column(Integer, primary_key=True, index=True)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)

    # Связи
    venue = relationship("Venue", back_populates="amenities")


class TimeSlot(Base):
    """Временные слоты для бронирования"""
    __tablename__ = "time_slots"

    id = Column(Integer, primary_key=True, index=True)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    status = Column(String(50), nullable=False, default='available', index=True)

    # Связи
    venue = relationship("Venue", back_populates="time_slots")
    bookings = relationship("Booking", back_populates="time_slot")



class Booking(Base):
    """Бронирования площадок"""
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="RESTRICT"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    time_slot_id = Column(Integer, ForeignKey("time_slots.id", ondelete="RESTRICT"), nullable=False)
    booking_date = Column(Date, nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    participants_count = Column(Integer, nullable=False)
    total_price = Column(Numeric(10, 2), nullable=False)
    status = Column(String(50), nullable=False, default='draft', index=True)
    created_at = Column(TIMESTAMP, default=dt_utcnow)
    receipt_path = Column(String(500))
    receipt_uploaded_at = Column(TIMESTAMP)
    rejection_reason = Column(Text)

    # Связи
    venue = relationship("Venue", back_populates="bookings")
    user = relationship("User", back_populates="bookings", foreign_keys=[user_id])
    time_slot = relationship("TimeSlot", back_populates="bookings")
    dispute = relationship("Dispute", back_populates="booking", uselist=False, cascade="all, delete-orphan")
    review = relationship("Review", back_populates="booking", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint('participants_count > 0', name='check_participants_positive'),
        CheckConstraint('total_price > 0', name='check_total_price_positive'),
    )


class Dispute(Base):
    """Споры между арендаторами и арендодателями"""
    __tablename__ = "disputes"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    opened_at = Column(TIMESTAMP, server_default=func.now())
    resolved_at = Column(TIMESTAMP)
    resolved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    status = Column(
        Enum(
            DisputeStatus,
            name='dispute_status',
            native_enum=True,
            create_type=False,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
        ),
        nullable=False,
        default=DisputeStatus.OPEN,
        index=True,
    )
    resolution_text = Column(Text)

    # Связи
    booking = relationship("Booking", back_populates="dispute")
    resolved_by_user = relationship("User", back_populates="resolved_disputes", foreign_keys=[resolved_by])


class Review(Base):
    """Отзывы пользователей о площадках"""
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), unique=True, nullable=False)
    rating = Column(Integer, nullable=False, index=True)
    comment = Column(Text)

    # Связи
    venue = relationship("Venue", back_populates="reviews")
    user = relationship("User", back_populates="reviews")
    booking = relationship("Booking", back_populates="review")

    __table_args__ = (
        CheckConstraint('rating >= 1 AND rating <= 5', name='check_rating_range'),
    )


class FavoriteVenue(Base):
    """Избранные площадки арендатора"""
    __tablename__ = "favorite_venues"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)

    user = relationship("User", back_populates="favorite_venues")
    venue = relationship("Venue", back_populates="favorited_by")

    __table_args__ = (
        UniqueConstraint("user_id", "venue_id", name="uq_favorite_user_venue"),
    )

