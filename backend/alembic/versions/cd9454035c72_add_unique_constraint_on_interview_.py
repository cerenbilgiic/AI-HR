"""add unique constraint on interview_reports and ai_scores session_id

Revision ID: cd9454035c72
Revises: 1011a7882442
Create Date: 2026-08-12 17:02:27.332986

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cd9454035c72'
down_revision: Union[str, None] = '1011a7882442'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint('uq_ai_scores_session_id', 'ai_scores', ['session_id'])
    op.create_unique_constraint('uq_interview_reports_session_id', 'interview_reports', ['session_id'])


def downgrade() -> None:
    op.drop_constraint('uq_interview_reports_session_id', 'interview_reports', type_='unique')
    op.drop_constraint('uq_ai_scores_session_id', 'ai_scores', type_='unique')
