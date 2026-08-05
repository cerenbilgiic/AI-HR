"""Manual smoke test for the local AI provider (Ollama-backed).

Exercises generate_questions / evaluate_answer / generate_report against a
real running Ollama instance with sample retail-interview data. Not a pytest
suite -- run directly to eyeball whether the local model produces usable
output and valid JSON where expected.

Run with: python -m scripts.test_ai_provider
"""

import json

from app.services.ai.local_llm import LocalOllamaProvider

JOB_DESCRIPTION = """
Sales Associate - Fashion Retail
We are looking for a friendly, energetic Sales Associate to join our store team.
Responsibilities: greet customers, help them find products, operate the POS
system, restock shelves, and meet monthly sales targets. Requires strong
communication skills and the ability to stay calm during busy periods.
"""

CV_TEXT = """
Ayse Yilmaz
2 years of experience as a cashier at a supermarket chain.
Handled customer complaints, worked in a fast-paced environment, trained two
new cashiers. Comfortable with POS systems and basic inventory tracking.
"""


def main() -> None:
    provider = LocalOllamaProvider()

    print("=== generate_questions ===")
    questions = provider.generate_questions(CV_TEXT, JOB_DESCRIPTION, count=3)
    for q in questions:
        print("-", q)

    if not questions:
        print("No questions generated, stopping here.")
        return

    sample_answer = (
        "I worked as a cashier for two years, so I'm used to handling busy "
        "periods and dealing with customer complaints calmly."
    )

    print("\n=== evaluate_answer ===")
    try:
        evaluation = provider.evaluate_answer(questions[0], sample_answer, JOB_DESCRIPTION)
        print(json.dumps(evaluation, indent=2))
    except json.JSONDecodeError as e:
        print("FAILED to parse JSON from model:", e)

    print("\n=== generate_report ===")
    transcript = [{"question": q, "answer": sample_answer} for q in questions]
    try:
        report = provider.generate_report(transcript, JOB_DESCRIPTION)
        print(json.dumps(report, indent=2))
    except json.JSONDecodeError as e:
        print("FAILED to parse JSON from model:", e)


if __name__ == "__main__":
    main()
