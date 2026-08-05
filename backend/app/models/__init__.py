from app.models.ai_score import AIScore, InterviewReport
from app.models.candidate import Candidate, CandidateCV, CandidateSkill
from app.models.consent import ConsentRecord
from app.models.interview import CandidateAnswer, InterviewQuestion, InterviewSession
from app.models.job import Job, JobSkill
from app.models.user import Role, User

__all__ = [
    "AIScore",
    "InterviewReport",
    "Candidate",
    "CandidateCV",
    "CandidateSkill",
    "ConsentRecord",
    "CandidateAnswer",
    "InterviewQuestion",
    "InterviewSession",
    "Job",
    "JobSkill",
    "Role",
    "User",
]
