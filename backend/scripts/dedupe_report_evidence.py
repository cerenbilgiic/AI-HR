"""One-off backfill: removes duplicate evidence quotes from already-generated
interview reports (see report_service._dedupe_evidence, added after local
models were observed citing the exact same quote for more than one
competency). Only touches reports whose evidence actually contains an
exact-text duplicate; everything else is left untouched.

Run with: python -m scripts.dedupe_report_evidence
"""

from app.core.database import SessionLocal
from app.models.ai_score import InterviewReport
from app.schemas.report import EvidenceItem
from app.services.report_service import _dedupe_evidence


def main() -> None:
    db = SessionLocal()
    try:
        reports = db.query(InterviewReport).filter(InterviewReport.evidence.isnot(None)).all()
        changed = 0
        for report in reports:
            if not report.evidence:
                continue
            items = [EvidenceItem.model_validate(e) for e in report.evidence]
            deduped = _dedupe_evidence(items)
            if len(deduped) != len(items):
                report.evidence = [item.model_dump() for item in deduped]
                changed += 1
        db.commit()
        print(f"Scanned {len(reports)} report(s), deduplicated evidence on {changed}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
