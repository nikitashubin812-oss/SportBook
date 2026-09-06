"""
Pydantic схемы для валидации данных API
"""

from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional, List, Literal
from datetime import date, time, datetime
from decimal import Decimal


# ==================== USER SCHEMAS ====================

class UserBase(BaseModel):
    email: EmailStr = Field(..., max_length=100)
    full_name: str = Field(..., min_length=2, max_length=20)
    phone: Optional[str] = Field(None, max_length=20)


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=20)
    role: Literal['renter', 'landlord'] = 'renter'


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class User(UserBase):
    id: int
    role: str

    model_config = ConfigDict(from_attributes=True)


# Схема для ответов API — без строгих ограничений длины (данные уже в БД)
class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    role: str
    verification_status: Optional[str] = None
    verification_doc_path: Optional[str] = None
    verification_comment: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== VERIFICATION SCHEMAS ====================

class VerificationUpload(BaseModel):
    pass


class VerificationDecision(BaseModel):
    approved: bool
    comment: Optional[str] = None


class VerificationRequest(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    verification_status: str
    verification_doc_path: Optional[str] = None
    verification_comment: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== VENUE SCHEMAS ====================

class VenueBase(BaseModel):
    name: str = Field(..., min_length=3, max_length=100)
    address: str = Field(..., max_length=500)
    city: str = Field(..., min_length=2, max_length=50)
    description: Optional[str] = None
    sport_types: str = Field(..., min_length=2, max_length=255)
    capacity: int = Field(..., ge=1, le=5000)
    area: Optional[Decimal] = Field(None, ge=10, le=100000)
    price_per_hour: Decimal = Field(..., ge=1, le=10000000)
    image_path: Optional[str] = None
    qr_code_path: Optional[str] = None


class VenueCreate(VenueBase):
    amenities: List[str] = []  # Список названий удобств


class VenueUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=100)
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, min_length=2, max_length=50)
    description: Optional[str] = None
    sport_types: Optional[str] = Field(None, min_length=2, max_length=255)
    capacity: Optional[int] = Field(None, ge=1, le=5000)
    area: Optional[Decimal] = Field(None, ge=10, le=100000)
    price_per_hour: Optional[Decimal] = Field(None, ge=1, le=10000000)
    image_path: Optional[str] = None
    qr_code_path: Optional[str] = None
    amenities: Optional[List[str]] = None


class AmenityResponse(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class VenueImageResponse(BaseModel):
    id: int
    image_path: str

    model_config = ConfigDict(from_attributes=True)


class Venue(VenueBase):
    id: int
    owner_id: int
    rating: Decimal
    reviews_count: int = 0
    amenities: List[AmenityResponse] = []
    images: List[VenueImageResponse] = []
    owner: Optional['User'] = None

    model_config = ConfigDict(from_attributes=True)


class FavoriteVenueIdsResponse(BaseModel):
    venue_ids: List[int] = []


# ==================== TIME SLOT SCHEMAS ====================

class TimeSlotBase(BaseModel):
    date: date
    start_time: time
    end_time: time


class TimeSlotCreate(TimeSlotBase):
    venue_id: int


class TimeSlot(TimeSlotBase):
    id: int
    venue_id: int
    status: str

    model_config = ConfigDict(from_attributes=True)


# ==================== BOOKING SCHEMAS ====================

class BookingBase(BaseModel):
    venue_id: int
    time_slot_id: int
    booking_date: date
    start_time: time
    end_time: time
    participants_count: int = Field(..., gt=0)


class BookingCreate(BookingBase):
    pass


class BookingCreateFlexible(BaseModel):
    """Бронирование без time_slot_id — слот создаётся автоматически"""
    venue_id: int
    booking_date: date
    start_time: time
    end_time: time
    participants_count: int = Field(..., gt=0)


class BookingUpdate(BaseModel):
    status: Optional[str] = None
    receipt_path: Optional[str] = None


class Booking(BookingBase):
    id: int
    user_id: int
    total_price: Decimal
    status: str
    receipt_path: Optional[str] = None
    rejection_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BookingWithDetails(BaseModel):
    """Бронирование с деталями площадки и арендатора"""
    id: int
    venue_id: int
    venue_name: str
    venue_address: str
    renter_name: str
    renter_email: str
    booking_date: date
    start_time: time
    end_time: time
    participants_count: int
    total_price: Decimal
    status: str
    created_at: Optional[datetime] = None
    receipt_path: Optional[str] = None
    receipt_uploaded_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== DISPUTE SCHEMAS ====================

class DisputeCreate(BaseModel):
    booking_id: int


class DisputeResolve(BaseModel):
    status: str
    resolution_text: str


class Dispute(BaseModel):
    id: int
    booking_id: int
    opened_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[int] = None
    status: str
    resolution_text: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DisputeWithDetails(BaseModel):
    id: int
    booking_id: int
    status: str
    opened_at: datetime
    resolved_at: Optional[datetime] = None
    resolution_text: Optional[str] = None
    resolved_by_name: Optional[str] = None
    # Данные бронирования
    venue_id: int
    venue_name: str
    venue_address: str
    booking_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    total_price: Optional[Decimal] = None
    receipt_path: Optional[str] = None
    # Участники
    renter_name: str
    renter_email: str
    landlord_name: str
    landlord_email: str
    # Причина отклонения от арендодателя
    rejection_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== REVIEW SCHEMAS ====================

class ReviewCreate(BaseModel):
    booking_id: int
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


class Review(ReviewCreate):
    id: int
    venue_id: int
    user_id: int

    model_config = ConfigDict(from_attributes=True)


class ReviewWithDetails(BaseModel):
    id: int
    venue_id: int
    venue_name: str
    user_id: int
    author_name: str
    booking_id: int
    booking_date: Optional[date] = None
    rating: int
    comment: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== TOKEN SCHEMAS ====================

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class TokenData(BaseModel):
    email: Optional[str] = None

