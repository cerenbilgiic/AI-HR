# AI-Powered Interview Pre-Screening Platform (PoC)

## Project Overview

This project is a **Proof of Concept (PoC)** for an AI-powered interview pre-screening platform developed for the **retail industry**.

The goal is to automate the first stage of the recruitment process by allowing candidates to complete an AI-driven interview before meeting a human recruiter.

The platform is intended to demonstrate how Artificial Intelligence can assist HR departments by evaluating candidates consistently, reducing screening time, and generating structured interview reports.

---

# Scope

This is **not** a production system.

The project will use **mock (synthetic) data** only.

No real company or candidate data will be stored.

The application should be designed with a production-ready architecture while remaining a PoC.

---

# Target Industry

Retail / Fashion Retail

Example roles:

- Sales Associate
- Cashier
- Store Manager
- Assistant Store Manager
- Warehouse Associate
- Inventory Specialist
- Visual Merchandiser
- Customer Experience Specialist
- Supply Chain Analyst
- E-Commerce Operations Specialist

---

# Main Workflow

## HR Side

- Login
- Create Job Posting
- Define required skills
- View candidates
- View interview reports
- Review AI evaluations

---

## Candidate Side

- Open interview invitation link
- Read interview instructions
- Accept consent form
- Grant camera permission
- Grant microphone permission
- Upload CV
- Start AI interview
- Answer AI-generated questions
- Finish interview

---

# Consent Screen

Before the interview begins, the candidate must explicitly accept:

- Camera access
- Microphone access
- Audio recording
- Video recording
- AI evaluation of responses

The interview cannot begin unless the consent is accepted.

---

# AI Interview Features

The AI interviewer should:

- Analyze the uploaded CV
- Read the job description
- Generate interview questions
- Ask follow-up questions dynamically
- Convert speech to text
- Evaluate answers
- Generate interview scores
- Produce structured feedback
- Generate a final recommendation

---

# AI Evaluation Criteria

The AI should evaluate candidates based on:

- Technical competency
- Communication skills
- Problem-solving ability
- Job-role compatibility
- Response quality
- Confidence
- Overall interview performance

---

# HR Dashboard

HR users should be able to see:

- Job postings
- Candidate profiles
- Uploaded CV
- Interview transcript
- AI-generated scores
- AI feedback
- Final recommendation

---

# Technology Stack

## Backend

- Python
- FastAPI
- SQLAlchemy
- Alembic
- JWT Authentication

## Database

- MySQL

## AI

- OpenAI API
- Whisper (Speech-to-Text)

## Frontend

- React
- TypeScript
- Tailwind CSS

---

# Project Architecture

The project should follow a layered architecture.

```
Frontend (React)

↓

FastAPI REST API

↓

Service Layer

↓

AI Services

↓

Database Layer (SQLAlchemy)

↓

MySQL
```

The codebase should be modular, scalable, and maintainable.

---

# Database (High-Level)

Suggested entities:

- Users
- Roles
- Jobs
- Job Skills
- Candidates
- Candidate Skills
- Candidate CVs
- Interview Sessions
- Interview Questions
- Candidate Answers
- AI Scores
- Interview Reports
- Consent Records

---

# Mock Data

The project will include synthetic data for:

- Companies
- Job postings
- Candidates
- CVs
- Skills
- Interview questions
- Interview answers
- AI reports

The database should be automatically populated using seed scripts.

---

# Future Enhancements

Potential future features:

- Emotion analysis
- Facial expression analysis
- Eye contact analysis
- Multiple AI interviewers
- Multi-language interviews
- Real-time HR monitoring
- Video summarization
- ATS integration
- Calendar integration
- Email invitations

---

# Non-Functional Requirements

- Clean Architecture
- RESTful API
- Modular codebase
- Scalable folder structure
- Environment variables
- Docker support (optional)
- Well-documented API
- Maintainable code

---

# Goal

Develop a working Proof of Concept demonstrating how AI can automate the first-stage interview process in the retail industry.

The project should be built as if it were a real SaaS product rather than a university assignment.