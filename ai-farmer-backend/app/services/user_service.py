from sqlalchemy.orm import Session
from app.models import user as user_model
from app.schemas import user as user_schema


def create_user(db: Session, user: user_schema.UserCreate):
    db_user = user_model.User(
        name=user.name,
        email=user.email,
        phone=user.phone,
        location=user.location,
        password=user.password  # should hash
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user
