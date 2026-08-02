from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.sql import func
from app.database.db import Base

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    phone = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)
    user_type = Column(String, default='farmer')  # farmer, buyer, local_buyer, worker, equipment_owner, transporter, store
    business_name = Column(String, nullable=True)
    location = Column(String, nullable=True)
    gst_number = Column(String, nullable=True)
    vehicle_type = Column(String, nullable=True)  # truck, mini-truck, pickup, tractor, tempo
    license_number = Column(String, nullable=True)
    store_type = Column(String, nullable=True)  # seeds, equipment, pesticides, general, cold-storage
    farm_size = Column(Float, nullable=True)  # in acres
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
