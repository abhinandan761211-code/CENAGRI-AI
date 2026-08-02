from pydantic import BaseModel, EmailStr
from typing import Optional, Union
from enum import Enum

class UserType(str, Enum):
    farmer = "farmer"
    buyer = "buyer"
    local_buyer = "local_buyer"
    worker = "worker"
    equipment_owner = "equipment_owner"
    transporter = "transporter"
    store = "store"
    admin = "admin"

class UserBase(BaseModel):
    name: str
    email: EmailStr
    phone: str
    user_type: UserType
    business_name: Optional[str] = None
    location: Optional[str] = None
    gst_number: Optional[str] = None
    vehicle_type: Optional[str] = None
    license_number: Optional[str] = None
    store_type: Optional[str] = None
    farm_size: Optional[float] = None

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: Union[int, str]
    is_active: bool
    created_at: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    operating_system: Optional[str] = None


# response model used by endpoints returning user data
class UserResponse(User):
    """Schema for sending user information in API responses."""
    # inherits all fields from User (which itself extends UserBase)
    # keeping orm_mode allows compatibility with SQLAlchemy models
    pass
