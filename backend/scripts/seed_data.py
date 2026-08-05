"""Populate the local database with synthetic mock data (jobs, candidates, CVs, interviews).

All data is hand-written/synthetic, not AI-generated -- no call to the AI
provider is made here. Seeded HR users can log in with password
"Password123!".

Run with: python -m scripts.seed_data
"""

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.ai_score import AIScore, InterviewReport
from app.models.candidate import Candidate, CandidateCV, CandidateSkill
from app.models.consent import ConsentRecord
from app.models.interview import CandidateAnswer, InterviewQuestion, InterviewSession
from app.models.job import Job, JobSkill
from app.models.user import Role, User

SEED_PASSWORD = "Password123!"

JOBS = [
    {
        "title": "Sales Associate",
        "department": "Sales Floor",
        "location": "Istanbul - Zorlu Center",
        "description": (
            "Assist customers on the shop floor, process transactions, restock "
            "merchandise, and help meet store sales targets while delivering "
            "excellent customer service."
        ),
        "skills": [("Customer Service", "Intermediate"), ("POS Systems", "Beginner"), ("Teamwork", "Intermediate")],
    },
    {
        "title": "Cashier",
        "department": "Front End",
        "location": "Ankara - Kizilay",
        "description": (
            "Operate the point-of-sale system, handle cash and card transactions "
            "accurately, and provide a friendly checkout experience for customers."
        ),
        "skills": [("Cash Handling", "Intermediate"), ("Attention to Detail", "Intermediate"), ("Customer Service", "Beginner")],
    },
    {
        "title": "Store Manager",
        "department": "Management",
        "location": "Izmir - Alsancak",
        "description": (
            "Oversee daily store operations, manage staff schedules, drive sales "
            "performance, and ensure a high standard of customer experience."
        ),
        "skills": [("Leadership", "Advanced"), ("Inventory Management", "Intermediate"), ("Sales Strategy", "Advanced")],
    },
    {
        "title": "Assistant Store Manager",
        "department": "Management",
        "location": "Istanbul - Bagdat Caddesi",
        "description": (
            "Support the Store Manager in daily operations, supervise sales "
            "associates, handle scheduling, and resolve customer or staffing issues."
        ),
        "skills": [("Team Leadership", "Intermediate"), ("Scheduling", "Intermediate"), ("Problem Solving", "Intermediate")],
    },
    {
        "title": "Warehouse Associate",
        "department": "Logistics",
        "location": "Kocaeli - Gebze",
        "description": (
            "Receive, sort, and store incoming merchandise, prepare outgoing "
            "shipments, and maintain accurate inventory records in the warehouse."
        ),
        "skills": [("Inventory Handling", "Intermediate"), ("Forklift Operation", "Beginner"), ("Physical Stamina", "Advanced")],
    },
    {
        "title": "Visual Merchandiser",
        "department": "Marketing",
        "location": "Istanbul - Nisantasi",
        "description": (
            "Design and maintain visually appealing product displays and store "
            "layouts that align with brand guidelines and drive customer engagement."
        ),
        "skills": [("Creativity", "Advanced"), ("Visual Design", "Intermediate"), ("Attention to Detail", "Advanced")],
    },
]

# Two candidates per job (same order as JOBS). The first of each pair has
# completed an interview (with full scores/report); the second is still
# earlier in the funnel (invited, no consent/interview yet).
CANDIDATES = [
    # -- Sales Associate --
    {
        "job_index": 0,
        "full_name": "Ayse Yilmaz",
        "email": "ayse.yilmaz@example.com",
        "phone": "+90 532 111 2233",
        "skills": ["Customer Service", "Teamwork"],
        "cv_text": (
            "2 years of experience as a cashier at a supermarket chain. Handled "
            "customer complaints, worked in a fast-paced environment, trained two "
            "new cashiers. Comfortable with POS systems and basic inventory tracking."
        ),
        "interview": {
            "qa": [
                ("Tell me about a time you helped a difficult customer.", "A customer once complained that a product was defective. I stayed calm, apologized, and offered an exchange, which resolved it quickly and she left happy."),
                ("How do you handle a busy shop floor during peak hours?", "I prioritize customers who look lost first, keep transactions quick, and ask a colleague to restock while I focus on the floor."),
                ("Why do you want to work in retail sales?", "I enjoy talking to people and helping them find what they need, and I like the fast pace of a sales floor."),
                ("How would you meet a monthly sales target?", "I'd focus on suggestive selling, remembering regular customers' preferences, and tracking my numbers weekly to adjust."),
            ],
            "scores": {
                "technical_competency": 7.0, "communication_skills": 8.5, "problem_solving": 7.5,
                "job_role_compatibility": 8.0, "response_quality": 7.5, "confidence": 8.0, "overall_score": 7.75,
            },
            "summary": "Ayse has solid customer-facing experience and communicates clearly and confidently. Her answers show she can stay calm under pressure and prioritize well during busy periods.",
            "recommendation": "Recommend",
        },
    },
    {
        "job_index": 0,
        "full_name": "Mert Aydin",
        "email": "mert.aydin@example.com",
        "phone": "+90 533 222 3344",
        "skills": ["Customer Service"],
        "cv_text": "Recent high school graduate, part-time experience helping at a family-owned shop on weekends.",
        "interview": None,
    },
    # -- Cashier --
    {
        "job_index": 1,
        "full_name": "Zeynep Kaya",
        "email": "zeynep.kaya@example.com",
        "phone": "+90 534 333 4455",
        "skills": ["Cash Handling", "Attention to Detail"],
        "cv_text": (
            "3 years as a cashier at a convenience store chain. Balanced the till "
            "daily with zero discrepancies, processed returns, and handled loyalty "
            "card sign-ups."
        ),
        "interview": {
            "qa": [
                ("Describe your experience balancing a cash register.", "I closed my till every night for three years and never had a discrepancy over 5 lira, I always double count before closing."),
                ("What would you do if a customer's card was declined?", "I'd quietly offer another payment method and keep the line moving so they don't feel embarrassed."),
                ("How do you stay accurate during a rush?", "I slow down slightly on the actual scanning and totals even when the line is long, because mistakes cost more time than they save."),
                ("Tell me about a time you caught a pricing error.", "I noticed a promotion wasn't applying correctly at checkout and flagged it to my supervisor before it affected more customers."),
            ],
            "scores": {
                "technical_competency": 8.5, "communication_skills": 7.5, "problem_solving": 8.0,
                "job_role_compatibility": 8.5, "response_quality": 8.0, "confidence": 7.5, "overall_score": 8.0,
            },
            "summary": "Zeynep has strong, directly relevant cash-handling experience and a clear attention to accuracy. She communicates practically and gives concrete examples.",
            "recommendation": "Recommend",
        },
    },
    {
        "job_index": 1,
        "full_name": "Burak Sahin",
        "email": "burak.sahin@example.com",
        "phone": "+90 535 444 5566",
        "skills": [],
        "cv_text": "No prior retail experience, worked as a delivery courier for one year.",
        "interview": None,
    },
    # -- Store Manager --
    {
        "job_index": 2,
        "full_name": "Elif Demir",
        "email": "elif.demir@example.com",
        "phone": "+90 536 555 6677",
        "skills": ["Leadership", "Inventory Management"],
        "cv_text": (
            "5 years in retail, last 2 as Assistant Store Manager for a clothing "
            "brand. Managed a team of 8, ran monthly inventory counts, and improved "
            "store sales by 12% year over year."
        ),
        "interview": {
            "qa": [
                ("How do you motivate an underperforming team member?", "I sit down with them privately, understand what's blocking them, and set small achievable goals together."),
                ("Walk me through how you'd handle a stock shortage during a sale event.", "I'd check nearby store inventory for transfers first, then communicate clearly to customers about restock timing."),
                ("What's your approach to scheduling during holiday season?", "I look at last year's traffic data and overstaff slightly during peak hours, with backup on-call staff."),
                ("How do you measure your store's success beyond sales numbers?", "Customer return rate, staff turnover, and mystery shopper scores all matter to me as much as revenue."),
            ],
            "scores": {
                "technical_competency": 7.5, "communication_skills": 7.0, "problem_solving": 7.0,
                "job_role_compatibility": 7.0, "response_quality": 6.5, "confidence": 7.5, "overall_score": 7.08,
            },
            "summary": "Elif has relevant management experience and gives reasonable, if somewhat generic, answers. Her leadership examples are believable but lack specific measurable outcomes.",
            "recommendation": "Consider",
        },
    },
    {
        "job_index": 2,
        "full_name": "Can Ozturk",
        "email": "can.ozturk@example.com",
        "phone": "+90 537 666 7788",
        "skills": ["Leadership"],
        "cv_text": "3 years as a Sales Associate, no formal management experience yet.",
        "interview": None,
    },
    # -- Assistant Store Manager --
    {
        "job_index": 3,
        "full_name": "Deniz Celik",
        "email": "deniz.celik@example.com",
        "phone": "+90 538 777 8899",
        "skills": ["Team Leadership", "Scheduling"],
        "cv_text": (
            "4 years in retail, 1 year as a shift supervisor. Created weekly staff "
            "schedules for a team of 6 and handled day-to-day customer escalations."
        ),
        "interview": {
            "qa": [
                ("How do you balance staff availability with store needs when scheduling?", "I collect availability in advance, prioritize covering peak hours first, then fit in preferences where possible."),
                ("Describe a time you resolved a conflict between two team members.", "Two associates disagreed over break times, I heard both sides separately then set a clear rotating schedule to remove the ambiguity."),
                ("What would you do if the Store Manager was unreachable during an emergency?", "I'd follow the store's escalation procedure and make the safest call I could, then report everything once they're reachable."),
                ("How do you keep the team motivated during a slow sales period?", "I focus on training and small process improvements so the time still feels productive."),
            ],
            "scores": {
                "technical_competency": 7.0, "communication_skills": 7.5, "problem_solving": 7.5,
                "job_role_compatibility": 7.5, "response_quality": 7.0, "confidence": 7.0, "overall_score": 7.25,
            },
            "summary": "Deniz shows practical supervisory experience and handles interpersonal conflict examples well. Answers are grounded and specific.",
            "recommendation": "Recommend",
        },
    },
    {
        "job_index": 3,
        "full_name": "Selin Arslan",
        "email": "selin.arslan@example.com",
        "phone": "+90 539 888 9900",
        "skills": ["Scheduling"],
        "cv_text": "2 years as a Cashier, expressed interest in moving into a supervisory role.",
        "interview": None,
    },
    # -- Warehouse Associate --
    {
        "job_index": 4,
        "full_name": "Emre Dogan",
        "email": "emre.dogan@example.com",
        "phone": "+90 541 999 0011",
        "skills": ["Inventory Handling", "Physical Stamina"],
        "cv_text": (
            "2 years working in a distribution center, experienced with barcode "
            "scanners and pallet organization, licensed forklift operator."
        ),
        "interview": {
            "qa": [
                ("What safety precautions do you follow when operating a forklift?", "I always do a pre-shift inspection, keep to marked lanes, and sound the horn at blind corners."),
                ("How do you keep track of inventory accuracy?", "I scan every item in and out and do spot counts at the end of each shift to catch discrepancies early."),
                ("Describe a time you had to work under time pressure to get a shipment out.", "During a holiday rush we had a truck leaving early, I reorganized the loading order to get priority pallets out first."),
                ("How do you handle repetitive physical work over a full shift?", "I pace myself, use proper lifting technique, and rotate tasks with teammates when possible."),
            ],
            "scores": {
                "technical_competency": 7.5, "communication_skills": 6.0, "problem_solving": 6.5,
                "job_role_compatibility": 8.0, "response_quality": 6.5, "confidence": 6.5, "overall_score": 6.83,
            },
            "summary": "Emre has directly relevant warehouse experience and solid safety awareness. Communication is a bit terse but answers are technically sound.",
            "recommendation": "Consider",
        },
    },
    {
        "job_index": 4,
        "full_name": "Gizem Kilic",
        "email": "gizem.kilic@example.com",
        "phone": "+90 542 000 1122",
        "skills": [],
        "cv_text": "No warehouse experience, worked in food service for 1 year.",
        "interview": None,
    },
    # -- Visual Merchandiser --
    {
        "job_index": 5,
        "full_name": "Cem Aksoy",
        "email": "cem.aksoy@example.com",
        "phone": "+90 543 111 2233",
        "skills": ["Creativity", "Visual Design"],
        "cv_text": "1 year as a Sales Associate with an interest in store design, self-taught in basic visual merchandising principles.",
        "interview": {
            "qa": [
                ("How would you design a window display for a new seasonal collection?", "I'd probably use bright colors and put the newest items in the front."),
                ("How do you decide what products to feature together?", "Things that look good together colorwise, I guess."),
                ("Tell me about a display you're proud of.", "I rearranged a shelf once and my manager said it looked nicer."),
                ("How do you measure whether a display is working?", "I'm not totally sure, maybe if people stop and look at it."),
            ],
            "scores": {
                "technical_competency": 4.5, "communication_skills": 5.5, "problem_solving": 5.0,
                "job_role_compatibility": 5.0, "response_quality": 4.5, "confidence": 5.0, "overall_score": 4.92,
            },
            "summary": "Cem shows genuine interest but lacks concrete visual merchandising experience or vocabulary. Answers are vague and would benefit from a stronger portfolio or training background.",
            "recommendation": "Do Not Recommend",
        },
    },
    {
        "job_index": 5,
        "full_name": "Buse Yildiz",
        "email": "buse.yildiz@example.com",
        "phone": "+90 544 222 3344",
        "skills": ["Creativity"],
        "cv_text": "Graphic design student, no retail experience yet.",
        "interview": None,
    },
]


def run() -> None:
    db = SessionLocal()
    try:
        if db.query(Role).count() > 0:
            print("Database already seeded, skipping.")
            return

        hr_role = Role(name="hr")
        admin_role = Role(name="admin")
        db.add_all([hr_role, admin_role])
        db.flush()

        hr_user = User(
            email="hr@retailco.example.com",
            hashed_password=hash_password(SEED_PASSWORD),
            full_name="Elif Kaya",
            role_id=hr_role.id,
        )
        admin_user = User(
            email="admin@retailco.example.com",
            hashed_password=hash_password(SEED_PASSWORD),
            full_name="Mehmet Yildirim",
            role_id=admin_role.id,
        )
        db.add_all([hr_user, admin_user])
        db.flush()

        jobs = []
        for job_data in JOBS:
            job = Job(
                title=job_data["title"],
                description=job_data["description"],
                department=job_data["department"],
                location=job_data["location"],
                created_by_id=hr_user.id,
                skills=[JobSkill(name=name, required_level=level) for name, level in job_data["skills"]],
            )
            db.add(job)
            jobs.append(job)
        db.flush()

        for candidate_data in CANDIDATES:
            job = jobs[candidate_data["job_index"]]
            candidate = Candidate(
                full_name=candidate_data["full_name"],
                email=candidate_data["email"],
                phone=candidate_data["phone"],
                job_id=job.id,
                skills=[CandidateSkill(name=name) for name in candidate_data["skills"]],
                cvs=[CandidateCV(
                    file_path=f"/mock-cvs/{candidate_data['email'].split('@')[0]}.pdf",
                    parsed_text=candidate_data["cv_text"],
                )],
            )
            db.add(candidate)
            db.flush()

            interview = candidate_data["interview"]
            if interview is None:
                continue

            db.add(ConsentRecord(
                candidate_id=candidate.id,
                camera_access=True,
                microphone_access=True,
                audio_recording=True,
                video_recording=True,
                ai_evaluation=True,
            ))

            session = InterviewSession(candidate_id=candidate.id, job_id=job.id, status="completed")
            db.add(session)
            db.flush()

            for order, (question_text, answer_text) in enumerate(interview["qa"]):
                question = InterviewQuestion(session_id=session.id, text=question_text, order=order)
                db.add(question)
                db.flush()
                db.add(CandidateAnswer(session_id=session.id, question_id=question.id, transcript=answer_text))

            db.add(AIScore(session_id=session.id, **interview["scores"]))
            db.add(InterviewReport(
                session_id=session.id,
                summary=interview["summary"],
                recommendation=interview["recommendation"],
            ))

        db.commit()
        print(f"Seeded {len(jobs)} jobs and {len(CANDIDATES)} candidates.")
        print(f"HR login: hr@retailco.example.com / {SEED_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
