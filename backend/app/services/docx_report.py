import io

from docx import Document

from app.models.candidate import Candidate
from app.models.job import Job


def build_cv_analysis_docx(candidate: Candidate, job: Job | None, analysis: dict) -> io.BytesIO:
    document = Document()

    document.add_heading("CV Analysis Report", level=0)
    document.add_paragraph(f"Candidate: {candidate.full_name}")
    document.add_paragraph(f"Job: {job.title if job else 'N/A'}")

    document.add_heading("Strengths", level=1)
    for item in analysis.get("strengths") or []:
        document.add_paragraph(item, style="List Bullet")

    document.add_heading("Areas for Improvement", level=1)
    for item in analysis.get("weaknesses") or []:
        document.add_paragraph(item, style="List Bullet")

    document.add_heading("Summary", level=1)
    document.add_paragraph(analysis.get("summary") or "")

    buffer = io.BytesIO()
    document.save(buffer)
    buffer.seek(0)
    return buffer
