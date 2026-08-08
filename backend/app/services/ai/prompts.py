QUESTION_GENERATION_PROMPT = """You are an interviewer for a retail industry position.
Job description:
{job_description}

Candidate CV:
{cv_text}

Generate {count} interview questions that assess the candidate's fit for this role.
Return one question per line, no numbering.
"""

FOLLOW_UP_PROMPT = """The candidate was asked: "{question}"
They answered: "{answer}"

If a natural, useful follow-up question would help clarify or probe deeper,
return it. Otherwise return an empty response.
"""

ANSWER_EVALUATION_PROMPT = """Job description:
{job_description}

Question: {question}
Candidate answer: {answer}

Evaluate the answer on a 0-10 scale for: technical_competency, communication_skills,
problem_solving, job_role_compatibility, response_quality, confidence.
Respond as JSON with those six keys plus a one-sentence "notes" field.
"""

REPORT_GENERATION_PROMPT = """Job description:
{job_description}

Full interview transcript (question/answer pairs):
{transcript}

Write a short summary of the candidate's performance and a final hire
recommendation (Recommend / Consider / Do Not Recommend) with justification.
Respond as JSON with keys "summary" and "recommendation".
"""

CV_ANALYSIS_PROMPT = """Job description:
{job_description}

Candidate CV:
{cv_text}

Analyze how well this CV fits the job description. Identify the candidate's
strengths and weaknesses (gaps, missing skills or experience) relative to the
role, and write a short overall summary of their fit.
Respond as JSON with keys "strengths" (a list of short strings), "weaknesses"
(a list of short strings), and "summary" (a one-paragraph string).
"""
