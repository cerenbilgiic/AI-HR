# Local AI Model Requirements

## Objective

The project should run entirely on a local development environment whenever possible.

The application backend will be developed in Python using FastAPI and will use a locally hosted MySQL database.

The AI model should also be able to run locally for development and demonstration purposes without requiring paid APIs.

---

# Development Environment

Operating System:
- Windows 11

Hardware:
- Intel Core i9 CPU
- NVIDIA GeForce RTX GPU (CUDA supported)
- Sufficient RAM for running local LLMs

Database:
- MySQL Community Server (Localhost)

Backend:
- Python
- FastAPI
- SQLAlchemy
- Alembic

---

# LLM Requirements

Recommend the most suitable FREE local Large Language Model for this project.

Requirements:

- Completely free
- Can run locally
- Optimized for NVIDIA RTX GPUs
- Good instruction-following capability
- Good at interview question generation
- Good reasoning ability
- Good response evaluation
- Supports English (Turkish support is a plus)
- Easy integration with Python
- Compatible with Ollama or LM Studio

Please compare the following models and recommend the best one for this project:

- Qwen 3 8B Instruct
- Llama 3.1 8B Instruct
- Gemma 3 12B
- Mistral 7B Instruct
- Phi-4

For each model provide:

- VRAM usage
- RAM requirements
- Inference speed
- Reasoning quality
- Instruction following
- Interview evaluation quality
- Ease of local deployment

Finally recommend a single model that best fits this project.

---

# Local LLM Runtime

Prefer using one of:

- Ollama
- LM Studio
- vLLM (if appropriate)

Explain why the selected runtime is the best choice.

---

# Database

The project will use:

- MySQL Community Server
- Localhost
- SQLAlchemy ORM
- Alembic for migrations

The architecture should be designed assuming MySQL is running locally.

Provide the recommended folder structure and database configuration for FastAPI + SQLAlchemy + MySQL.

---

# AI Integration

The LLM should be used for:

- CV analysis
- Job description analysis
- Interview question generation
- Dynamic follow-up questions
- Candidate answer evaluation
- Candidate scoring
- Interview summary generation
- HR recommendation report

The AI service should be implemented as an independent service layer so that the local model can later be replaced with OpenAI or another provider with minimal code changes.