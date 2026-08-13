import io
import os

import reportlab
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.models.candidate import Candidate
from app.models.interview import InterviewSession
from app.models.job import Job
from app.schemas.report import InterviewReportOut

# Bundled with reportlab (Bitstream Vera) — covers Turkish characters
# (ş, ğ, ı, İ, ö, ü, ç), unlike the base PDF fonts (WinAnsi-only).
_FONT_DIR = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
pdfmetrics.registerFont(TTFont("Vera", os.path.join(_FONT_DIR, "Vera.ttf")))
pdfmetrics.registerFont(TTFont("Vera-Bold", os.path.join(_FONT_DIR, "VeraBd.ttf")))

RECOMMENDATION_LABELS = {
    "recommended": "Olumlu",
    "maybe": "Belirsiz",
    "not_recommended": "Olumsuz",
}

COMPETENCY_LABELS = {
    "communication": "İletişim",
    "technical_competency": "Teknik Yetkinlik",
    "problem_solving": "Problem Çözme",
    "teamwork": "Takım Çalışması",
    "customer_service": "Müşteri Odaklılık",
    "role_fit": "Pozisyona Uygunluk",
}


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("title", parent=base["Title"], fontName="Vera-Bold", fontSize=18),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Vera-Bold", fontSize=13, spaceBefore=14),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName="Vera", fontSize=10, leading=14),
        "meta": ParagraphStyle("meta", parent=base["BodyText"], fontName="Vera", fontSize=10, textColor=colors.HexColor("#555555")),
    }


def build_interview_report_pdf(
    candidate: Candidate,
    job: Job | None,
    session: InterviewSession,
    report: InterviewReportOut | None,
) -> io.BytesIO:
    """Exports the same data shown in the HR "Final AI Report" panel
    (InterviewDetail.tsx) as a standalone PDF. `report` is the same
    InterviewReportOut the JSON API returns (see routers/reports.py), not
    the raw ORM model — its evidence/competency_scores are typed objects."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )
    s = _styles()
    story: list = []

    story.append(Paragraph("Mülakat Raporu", s["title"]))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(candidate.full_name, s["h2"]))
    story.append(Paragraph(job.title if job else "Bilinmeyen pozisyon", s["meta"]))
    story.append(Paragraph(f"Mülakat #{session.id} — {session.created_at.strftime('%d.%m.%Y %H:%M')}", s["meta"]))
    story.append(Spacer(1, 6 * mm))

    overall_score = report.overall_score if report else None
    recommendation = report.recommendation if report else None
    hr_decision = report.hr_decision if report else None
    summary_line = [
        ["Genel Puan", f"{overall_score}/100" if overall_score is not None else "—"],
        ["AI Önerisi", RECOMMENDATION_LABELS.get(recommendation, recommendation or "—")],
        ["İK Kararı", RECOMMENDATION_LABELS.get(hr_decision, hr_decision or "Beklemede")],
    ]
    table = Table(summary_line, colWidths=[45 * mm, 100 * mm])
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Vera-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Vera"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(table)

    competency_scores = report.competency_scores if report else None
    if competency_scores:
        story.append(Paragraph("Yetkinlik Puanları", s["h2"]))
        rows = [
            [COMPETENCY_LABELS.get(key, key), str(value)]
            for key, value in competency_scores.model_dump().items()
        ]
        score_table = Table(rows, colWidths=[70 * mm, 30 * mm])
        score_table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), "Vera"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
                ]
            )
        )
        story.append(score_table)

    def _bullet_list(title: str, items: list[str] | None) -> None:
        if not items:
            return
        story.append(Paragraph(title, s["h2"]))
        story.append(
            ListFlowable(
                [ListItem(Paragraph(item, s["body"])) for item in items],
                bulletType="bullet",
                leftIndent=12,
            )
        )

    _bullet_list("Güçlü Yönler", report.strengths if report else None)
    _bullet_list("Gelişim Alanları", report.development_areas if report else None)

    if report and report.summary:
        story.append(Paragraph("Özet", s["h2"]))
        story.append(Paragraph(report.summary, s["body"]))

    if report and report.evidence:
        story.append(Paragraph("Kanıtlar", s["h2"]))
        story.append(
            ListFlowable(
                [
                    ListItem(
                        Paragraph(
                            f'<b>{COMPETENCY_LABELS.get(e.competency, e.competency)}:</b> "{e.evidence}"',
                            s["body"],
                        )
                    )
                    for e in report.evidence
                ],
                bulletType="bullet",
                leftIndent=12,
            )
        )

    doc.build(story)
    buffer.seek(0)
    return buffer
