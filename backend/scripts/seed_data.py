"""Populate the local database with synthetic mock data (jobs, candidates, CVs, interviews).

Run with: python -m scripts.seed_data
"""

from app.core.database import SessionLocal


def run() -> None:
    db = SessionLocal()
    try:
        pass  # TODO: insert mock companies, jobs, candidates, CVs, interview data
    finally:
        db.close()


if __name__ == "__main__":
    run()
