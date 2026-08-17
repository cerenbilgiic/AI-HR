import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

DecisionLiteral = str  # "recommended" | "maybe" | "not_recommended" — see schemas/report.py's RecommendationEnum


def _html_from_paragraphs(paragraphs: list[str]) -> str:
    """Wraps plain-text paragraphs in a minimal, readable HTML shell.
    `paragraphs` stays pure plain text throughout (used as-is for the
    text/plain MIME part and for the preview endpoint) — a paragraph that's
    exactly a bare URL is rendered here as a styled button instead of a
    plain link, everything else as an ordinary paragraph. Never inject raw
    HTML into the paragraph list itself, or it leaks as literal tags into
    plain-text clients and the preview.
    """
    parts = []
    for p in paragraphs:
        if p.startswith("http://") or p.startswith("https://"):
            parts.append(
                f'<p style="margin:0 0 14px;"><a href="{p}" '
                'style="display:inline-block;background:#4f46e5;color:#ffffff;'
                'padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">'
                "Mülakata Başla</a></p>"
            )
        else:
            parts.append(f'<p style="margin:0 0 14px;line-height:1.6;color:#1b2333;">{p}</p>')
    return (
        '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">'
        f"{''.join(parts)}"
        "</div>"
    )


def send_email(to_email: str, subject: str, text_paragraphs: list[str]) -> None:
    """Sends a real email over SMTP. Raises RuntimeError with a clear
    message if SMTP isn't configured (blank username/password) rather than
    silently no-op'ing — a "sent" invitation that never arrives is worse
    than a visible error HR can act on.
    """
    if not settings.smtp_username or not settings.smtp_password or not settings.smtp_from_email:
        raise RuntimeError(
            "SMTP is not configured — set SMTP_USERNAME, SMTP_PASSWORD and SMTP_FROM_EMAIL in .env before sending email."
        )

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message.attach(MIMEText("\n\n".join(text_paragraphs), "plain", "utf-8"))
    message.attach(MIMEText(_html_from_paragraphs(text_paragraphs), "html", "utf-8"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_username, settings.smtp_password)
        server.sendmail(settings.smtp_from_email, [to_email], message.as_string())


def build_invitation_email(candidate_name: str, job_title: str, interview_link: str) -> tuple[str, list[str]]:
    """Returns (subject, paragraphs) — the invitation email sent when HR
    clicks "Davet gönder" (see invitation_service.send_interview_link).
    The link is a one-time magic link, not a login — no password involved.
    The last paragraph is deliberately just the bare URL — see
    _html_from_paragraphs, which turns exactly that shape into a button.
    """
    subject = f"{job_title} pozisyonu için mülakat davetiniz"
    paragraphs = [
        f"Merhaba {candidate_name},",
        f"{job_title} pozisyonuna başvurunuz için sizi yapay zekâ destekli ön mülakatımıza davet ediyoruz. "
        "Mülakat sesli veya yazılı olarak cevaplayabileceğiniz birkaç sorudan oluşuyor ve genellikle 10-15 dakika sürüyor.",
        "Başlamadan önce kamera ve mikrofonunuza erişim izni vermeniz istenecek — mülakat kayıt altına alınır. "
        "Aşağıdaki bağlantı yalnızca size özeldir, kimseyle paylaşmayınız.",
        # Gmail's compose-URL body param is plain text only (see
        # invitation_service's module docstring — invitations open as a
        # Gmail draft, not a backend-sent HTML email), so an actual clickable
        # button isn't possible here — this lead-in line is the closest
        # plain-text equivalent, making the link read as a clear
        # call-to-action instead of a bare URL buried in a paragraph.
        "👉 Mülakata başlamak için aşağıdaki bağlantıya tıklayın:",
        interview_link,
        "İyi şanslar dileriz.",
    ]
    return subject, paragraphs


_DECISION_CONTENT: dict[str, tuple[str, list[str]]] = {
    "recommended": (
        "Mülakat Sonucunuz — Sonraki Adım",
        [
            "yaptığınız mülakatı değerlendirdik ve başvurunuzu olumlu buluyoruz. "
            "İşe alım ekibimiz sonraki adımlar için sizinle en kısa sürede iletişime geçecektir.",
            "İlginiz için teşekkür ederiz.",
        ],
    ),
    "maybe": (
        "Mülakat Sonucunuz — Değerlendirme Devam Ediyor",
        [
            "yaptığınız mülakatı değerlendirdik. Başvurunuz için değerlendirme sürecimiz devam ediyor; "
            "bir sonraki adım netleştiğinde sizinle iletişime geçeceğiz.",
            "Sabrınız için teşekkür ederiz.",
        ],
    ),
    "not_recommended": (
        "Mülakat Sonucunuz",
        [
            "yaptığınız mülakat için teşekkür ederiz. Bu pozisyon için şu anda süreci sizinle "
            "ilerletmeme kararı aldık.",
            "Gösterdiğiniz ilgi için tekrar teşekkür eder, başarılarınızın devamını dileriz.",
        ],
    ),
}


def build_decision_email(candidate_name: str, job_title: str, decision: DecisionLiteral) -> tuple[str, list[str]]:
    """Returns (subject, paragraphs) matching HR's final decision
    (InterviewReport.hr_decision) — see routers/interviews.py's
    decision-email-preview/send-decision-email. Raises ValueError for an
    unrecognized decision value rather than guessing a tone."""
    if decision not in _DECISION_CONTENT:
        raise ValueError(f"Unknown decision: {decision}")
    title, body_paragraphs = _DECISION_CONTENT[decision]
    paragraphs = [f"Merhaba {candidate_name},", f"{job_title} pozisyonu için {body_paragraphs[0]}", *body_paragraphs[1:]]
    return title, paragraphs
