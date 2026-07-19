"""Authentication throttles and integrity quarantine.

Revision ID: 20260715_0006
Revises: 20260714_0005
Create Date: 2026-07-15
"""

from alembic import op
import sqlalchemy as sa


revision = "20260715_0006"
down_revision = "20260714_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_throttle_buckets",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("scope", sa.String(16), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("window_started_at", sa.String(40), nullable=False),
        sa.Column("blocked_until", sa.String(40), nullable=True),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.UniqueConstraint("scope", "key_hash", name="uq_auth_throttle_scope_key"),
    )
    op.create_table(
        "data_integrity_quarantine",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("source_table", sa.String(80), nullable=False),
        sa.Column("external_id", sa.String(128), nullable=False),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("quarantined_at", sa.String(40), nullable=False),
    )
    op.create_index("ix_integrity_quarantine_user", "data_integrity_quarantine", ["user_id"])


def downgrade() -> None:
    op.drop_table("data_integrity_quarantine")
    op.drop_table("auth_throttle_buckets")
