from pydantic import BaseModel


class InvitationOut(BaseModel):
    candidate_id: int
    login_email: str
    # Plaintext, shown only once — the backend never stores or re-exposes
    # it after this response (see invitation_service.issue_credentials).
    password: str


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
