"""Add encrypted account-scoped AI credentials, excluded from portable backups."""
from alembic import op
import sqlalchemy as sa

revision = "20260920_0012"
down_revision = "20260829_0011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_ai_settings",
        sa.Column("user_id", sa.String(64), primary_key=True),
        sa.Column("encrypted_api_key", sa.Text(), nullable=False),
        sa.Column("routine_model", sa.String(64), nullable=False),
        sa.Column("planning_model", sa.String(64), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_user_ai_settings_user"),
    )


def downgrade():
    op.drop_table("user_ai_settings")
