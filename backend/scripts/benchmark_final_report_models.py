"""Compares LocalOllamaProvider.generate_final_report's output and latency
across local models on a fixed set of realistic retail-interview scenarios
-- step 5 of the AI-evaluation-quality plan (see steps 1-4: the 3-stage
extraction/scoring/synthesis split in local_llm.py). Test scenarios reuse
seed_data.py's existing strong/average/weak answer tiers rather than
inventing new sample data, so results are directly comparable to what HR
already sees in seeded demo interviews.

Not a pytest suite -- run directly against a real Ollama instance and read
the JSON report to compare models by eye (scores, evidence quality,
recommendation, elapsed time per model).

Run with: python -m scripts.benchmark_final_report_models
Optionally restrict models: python -m scripts.benchmark_final_report_models qwen2.5:7b
"""

import json
import sys
import time

from app.services.ai.local_llm import LocalOllamaProvider
from scripts.seed_data import CV_TEMPLATES, GENERIC_ANSWERS, JOBS

DEFAULT_MODELS = ["qwen2.5:7b", "qwen3:8b"]
JOB = JOBS[1]  # Kasiyer -- same job used in the earlier one-off pipeline check
TIERS = ["strong", "average", "weak"]
NO_PRIOR_EVALUATIONS = "Bu mülakat için önceki bir yapay zeka değerlendirmesi bulunmuyor."


def _required_skills(job: dict) -> str:
    return ", ".join(f"{name} ({level})" for name, level in job["skills"])


def _answers_for(job: dict, tier: str) -> list[str]:
    return job["strong_answers"] if tier == "strong" else GENERIC_ANSWERS[tier]


def _questions_and_answers(job: dict, tier: str) -> str:
    answers = _answers_for(job, tier)
    blocks = [f"S{i}: {q}\nC{i}: {a}" for i, (q, a) in enumerate(zip(job["questions"], answers), start=1)]
    return "\n\n".join(blocks)


def run_case(provider: LocalOllamaProvider, job: dict, tier: str) -> dict:
    t0 = time.time()
    result = provider.generate_final_report(
        job_description=job["description"],
        required_skills=_required_skills(job),
        candidate_profile=f"Ad Soyad: Test Adayı ({tier} tier)",
        candidate_cv=CV_TEMPLATES[tier].format(job=job["title"], skills=_required_skills(job)),
        questions_and_answers=_questions_and_answers(job, tier),
        answer_evaluations=NO_PRIOR_EVALUATIONS,
        evaluation_criteria="",
    )
    elapsed = time.time() - t0
    return {"elapsed_seconds": round(elapsed, 1), "result": result}


OUT_PATH = "benchmark_final_report_out.json"


def _save(report: dict) -> None:
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)


def main() -> None:
    models = sys.argv[1:] or DEFAULT_MODELS
    report: dict = {"job": JOB["title"], "models": {}}
    for model in models:
        provider = LocalOllamaProvider(model=model)
        report["models"][model] = {}
        for tier in TIERS:
            # Plain ASCII only -- stdout on a default Windows console is
            # cp1252, and a stray non-ASCII char here previously crashed the
            # run *after* the (slow) LLM call had already succeeded, losing
            # that result. Save after every case for the same reason: a
            # later failure shouldn't discard everything before it.
            print(f"Running {model} / {tier} ...", flush=True)
            case_result = run_case(provider, JOB, tier)
            report["models"][model][tier] = case_result
            avg = sum(case_result["result"]["competency_scores"].values()) / 6
            print(f"  -> {case_result['elapsed_seconds']}s, overall~{avg:.0f}", flush=True)
            _save(report)

    print(f"Done -> {OUT_PATH}")


if __name__ == "__main__":
    main()
