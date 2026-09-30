"""Cross-process serialization for one user's compound writes, without a new table."""
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from .database import UserPreferenceRecord


@contextmanager
def user_write_transaction(session_factory, user_id):
    with session_factory() as session:
        try:
            dialect = session.get_bind().dialect.name
            if dialect == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            timestamp = datetime.now(timezone.utc).isoformat()
            values = dict(user_id=user_id, preferences_json={}, created_at=timestamp, updated_at=timestamp)
            if dialect == "mysql":
                statement = mysql_insert(UserPreferenceRecord).values(**values)
                session.execute(statement.on_duplicate_key_update(user_id=statement.inserted.user_id))
            else:
                session.execute(sqlite_insert(UserPreferenceRecord).values(**values).on_conflict_do_nothing(index_elements=["user_id"]))
            session.scalar(select(UserPreferenceRecord).where(UserPreferenceRecord.user_id == user_id).with_for_update())
            yield session
            session.commit()
        except BaseException:
            session.rollback()
            raise
