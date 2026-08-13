import io

from docx import Document
from pypdf import PdfReader

# CandidateCV.parsed_text is String(10000) — truncate so a long CV never
# fails the DB insert.
MAX_PARSED_TEXT_CHARS = 10000


def extract_cv_text(data: bytes, content_type: str) -> str:
    """Best-effort text extraction for candidate-uploaded CVs.

    Legacy .doc (application/msword) has no reliable pure-Python parser and
    is left unextracted (returns "") rather than failing the upload.
    """
    try:
        if content_type == "application/pdf":
            reader = PdfReader(io.BytesIO(data))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        elif content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            document = Document(io.BytesIO(data))
            text = "\n".join(p.text for p in document.paragraphs)
        else:
            return ""
    except Exception:
        return ""
    return text.strip()[:MAX_PARSED_TEXT_CHARS]
