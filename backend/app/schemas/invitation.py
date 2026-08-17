from pydantic import BaseModel


class InvitationOut(BaseModel):
    candidate_id: int
    sent_to: str


class InvitationEmailOut(BaseModel):
    """The invitation-email draft — see GET /candidates/{id}/invite-email
    (preview, no side effects) and POST /candidates/{id}/invite (the actual
    send). `body` is plain text, paragraphs already joined — the single
    source of truth for both the HR-facing preview and the sent email (see
    invitation_service.preview_interview_link_email)."""

    to: str
    subject: str
    body: str


class ImportRowError(BaseModel):
    row: int
    message: str


class ImportRowDuplicate(BaseModel):
    row: int
    email: str


class CandidateImportSummary(BaseModel):
    created: int
    errors: list[ImportRowError]
    duplicates: list[ImportRowDuplicate]
