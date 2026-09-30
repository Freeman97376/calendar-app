"""Add global schedule proposals and scheduler event provenance.

Revision ID: 20260829_0011
Revises: 20260829_0010
Create Date: 2026-08-29
"""

from alembic import op
import sqlalchemy as sa


revision = "20260829_0011"
down_revision = "20260829_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "schedule_proposals",
        sa.Column("row_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("proposal_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("input_fingerprint", sa.String(64), nullable=False),
        sa.Column("proposal_json", sa.JSON(), nullable=False),
        sa.Column("resolved_at", sa.String(40), nullable=True),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.UniqueConstraint(
            "user_id",
            "proposal_id",
            name="uq_schedule_proposals_user_external",
        ),
    )
    op.create_index(
        "ix_schedule_proposals_user_created",
        "schedule_proposals",
        ["user_id", "created_at"],
    )

    with op.batch_alter_table("action_event_links") as batch:
        batch.add_column(
            sa.Column("managed_by", sa.String(32), nullable=False, server_default="manual")
        )
        batch.add_column(sa.Column("proposal_id", sa.String(64), nullable=True))
        batch.create_foreign_key(
            "fk_action_links_schedule_proposal",
            "schedule_proposals",
            ["user_id", "proposal_id"],
            ["user_id", "proposal_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("action_event_links") as batch:
        batch.drop_constraint("fk_action_links_schedule_proposal", type_="foreignkey")
        batch.drop_column("proposal_id")
        batch.drop_column("managed_by")

    op.drop_index("ix_schedule_proposals_user_created", table_name="schedule_proposals")
    op.drop_table("schedule_proposals")
