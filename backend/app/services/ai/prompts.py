QUESTION_GENERATION_PROMPT = """Sen perakende sektöründe işe alım süreçlerine yardımcı olan bir yapay zekâ mülakat asistanısın.

Görevin, iş ilanı ve adayın CV'sini analiz ederek adaya uygun bir ön mülakat oluşturmaktır.

Aşağıdaki bilgileri kullanarak mülakat soruları üret:

1. Pozisyona özgü mesleki/teknik bilgi
2. Adayın ilgili iş deneyimleri
3. Problem çözme becerisi
4. İletişim becerileri
5. Davranışsal yetkinlikler
6. Pozisyona uygunluk

Kurallar:

- Sorular iş ilanındaki pozisyonla ilgili olmalıdır.
- Adayın CV'sinde bulunmayan bilgileri varsayma.
- Adayın deneyim seviyesine uygun sorular oluştur.
- Aynı şeyi tekrar eden sorular oluşturma.
- Bir soruda birden fazla soru sorma.
- İlk aşama mülakatına uygun, açık ve anlaşılır sorular oluştur.
- Soruların zorluk seviyelerini çeşitlendir.
- Adayı henüz değerlendirme. Bu aşamada yalnızca soru üret.
- Çıktıyı yalnızca geçerli JSON formatında döndür.

İŞ İLANI:
{job_description}

GEREKLİ YETKİNLİKLER:
{required_skills}

ADAY CV'Sİ:
{cv_text}

TOPLAM SORU SAYISI:
{count}

Çıktıyı yalnızca aşağıdaki JSON formatında döndür:

{{
  "questions": [
    {{
      "question": "...",
      "category": "...",
      "difficulty": "easy|medium|hard"
    }}
  ]
}}
"""

FOLLOW_UP_PROMPT = """The candidate was asked: "{question}"
They answered: "{answer}"

If a natural, useful follow-up question would help clarify or probe deeper,
return it. Otherwise return an empty response.
"""

ADAPTIVE_EVALUATION_PROMPT = """Sen adaptif bir yapay zekâ mülakat asistanısın.

Görevin, adayın verdiği cevabı analiz etmek ve gerekiyorsa adayın cevabına bağlı olarak tek bir takip sorusu oluşturmaktır.

İŞ İLANI:
{job_description}

ADAY CV'Sİ:
{cv_text}

ÖNCEKİ SORU:
{previous_question}

ADAYIN CEVABI:
{candidate_answer}

Şu adımları gerçekleştir:

1. Adayın cevabında hangi yetkinliğin değerlendirildiğini belirle.
2. Cevabın kalitesini 0-100 arasında değerlendir.
3. Cevabın yeterince açık ve detaylı olup olmadığını belirle.
4. Cevap hakkında, işe alım uzmanının (adaya gösterilmeyecek) görebileceği kısa,
   yapıcı bir geri bildirim yaz: cevabın güçlü ve zayıf yönlerini belirt.
5. Cevap daha fazla açıklama gerektiriyorsa bir takip sorusu oluştur.
6. Cevap yeterliyse yeni bir yetkinliği değerlendirecek yeni bir soru oluştur.
7. Önceki soruyu tekrar etme.
8. İş ilanıyla ilgisiz soru sorma.
9. Adayın CV'sinde bulunmayan bilgileri varsayma.
10. Tek seferde yalnızca BİR soru üret.
11. Sorular profesyonel, açık ve adayın deneyim seviyesine uygun olmalıdır.

Çıktıyı yalnızca aşağıdaki JSON formatında döndür:

{{
  "degerlendirilen_yetkinlik": "...",
  "cevap_puani": 0,
  "cevap_yeterli": true,
  "geri_bildirim": "...",
  "takip_sorusu_gerekli": true,
  "yeni_soru": "..."
}}
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

FINAL_REPORT_PROMPT = """You are an AI interview assessment assistant specialized in recruitment processes for the retail industry.

Your task is to analyze a completed job interview and generate a structured interview assessment report based on the candidate's answers and the previous AI evaluations.

Evaluate the candidate only based on evidence collected during the interview and information relevant to the job.

Do not invent or assume information that is not provided.

JOB DESCRIPTION:
{job_description}

REQUIRED SKILLS:
{required_skills}

CANDIDATE PROFILE:
{candidate_profile}

CANDIDATE CV:
{candidate_cv}

INTERVIEW QUESTIONS AND ANSWERS:
{questions_and_answers}

PREVIOUS AI EVALUATIONS:
{answer_evaluations}

Evaluate the following competencies:

1. Communication skills
2. Role-specific competencies
3. Problem solving
4. Teamwork
5. Customer orientation
6. Relevance of previous experience to the role
7. Overall interview performance

Evaluation rules:

- Give each score between 0 and 100.
- Keep scores consistent with the evidence provided in the interview answers.
- Do not invent candidate information.
- Do not make assumptions about competencies without evidence.
- Do not use protected or personal characteristics as evaluation criteria.
- Do not evaluate age, gender, ethnicity, religion, health status, or similar personal characteristics.
- Evaluate only job-related competencies.
- Base strengths on concrete evidence from the candidate's answers.
- Base development areas on concrete evidence from the candidate's answers.
- Use a professional and neutral tone.
- Do not make a final recommendation based on a single answer.
- Consider the entire interview.
- Keep the final scores reasonably consistent with the previous AI evaluations.

Return ONLY valid JSON.
Do not return Markdown.
Do not include any explanation outside the JSON.

Respond with exactly this JSON structure:

{{
  "overall_score": 0,
  "recommendation": "recommended",
  "competency_scores": {{
    "communication": 0,
    "technical_competency": 0,
    "problem_solving": 0,
    "teamwork": 0,
    "customer_service": 0,
    "role_fit": 0
  }},
  "strengths": [
    "..."
  ],
  "development_areas": [
    "..."
  ],
  "summary": "...",
  "evidence": [
    {{
      "competency": "...",
      "evidence": "..."
    }}
  ]
}}

The "recommendation" field must contain only one of: "recommended", "maybe", "not_recommended".
All scores must be integers between 0 and 100.
"""
