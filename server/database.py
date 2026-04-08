import os
import pathlib
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Session

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/inquiro.db")

# check_same_thread=False is required for SQLite when FastAPI dispatches
# async handlers across multiple threads.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)


class Base(DeclarativeBase):
    pass


class Conversation(Base):
    __tablename__ = "conversations"

    thread_id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)  # first user message, truncated to 80 chars
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


def create_tables():
    """Create all tables. Called once at server startup."""
    if "sqlite" in DATABASE_URL:
        # Ensure the data directory exists (important inside Docker)
        db_path = DATABASE_URL.replace("sqlite:///", "")
        pathlib.Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_db():
    """Yield a SQLAlchemy session. Use next(get_db()) inside generators."""
    with Session(engine) as session:
        yield session
