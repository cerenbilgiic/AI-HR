"""Populate the local database with synthetic mock data (jobs, candidates, CVs, interviews).

All data is hand-written/synthetic, not AI-generated -- no call to the AI
provider is made here. Rerunning this script resets the seeded tables
before inserting fresh data. Seeded HR users and candidates can all log
in with password "Password123!" (HR via /auth/login, candidates via
/auth/candidate-login). Seed content (job postings, interview Q&A, names)
is in Turkish; code/comments stay in English per the rest of the codebase.

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

_ASCII_MAP = {
    "ı": "i", "İ": "i", "I": "i",
    "ş": "s", "Ş": "s",
    "ğ": "g", "Ğ": "g",
    "ç": "c", "Ç": "c",
    "ö": "o", "Ö": "o",
    "ü": "u", "Ü": "u",
}


def _ascii(text: str) -> str:
    return "".join(_ASCII_MAP.get(ch, ch) for ch in text).lower()


# Each candidate slot for a job is filled with one of these tiers, in order:
# 3 completed interviews of varying quality, 1 interview in progress
# (consented + questions generated, not yet answered), 1 not started yet
# (no consent, no session -- just applied).
TIER_ORDER = ["strong", "average", "weak", "in_progress", "not_started"]

TIER_SCORES = {
    "strong": {
        "technical_competency": 8.0, "communication_skills": 8.5, "problem_solving": 8.0,
        "job_role_compatibility": 8.5, "response_quality": 8.0, "confidence": 8.5,
    },
    "average": {
        "technical_competency": 6.0, "communication_skills": 6.5, "problem_solving": 6.0,
        "job_role_compatibility": 6.5, "response_quality": 6.0, "confidence": 6.5,
    },
    "weak": {
        "technical_competency": 4.0, "communication_skills": 4.5, "problem_solving": 3.5,
        "job_role_compatibility": 4.0, "response_quality": 3.5, "confidence": 4.5,
    },
}
TIER_RECOMMENDATION = {"strong": "Öneriyorum", "average": "Değerlendirilebilir", "weak": "Önermiyorum"}
TIER_SKILL_COUNT = {"strong": 3, "average": 1, "weak": 0, "in_progress": 1, "not_started": 0}

GENERIC_ANSWERS = {
    "average": [
        "Sakin kalıp durumu yönetmeye çalışırım, gerekirse bir meslektaşımdan veya yöneticimden yardım isterim.",
        "Elimden geleni yapıp işlerin sorunsuz ilerlemesini sağlamaya çalışırım, ama başlangıçta biraz yönlendirmeye ihtiyacım olabilir.",
        "Bu pozisyonun deneyimime makul ölçüde uygun olduğunu düşünüyorum ve öğrenmeye hazırım.",
        "Standart süreci takip eder ve düzenli olarak yöneticimle iletişimde kalırım.",
    ],
    "weak": [
        "Tam olarak emin değilim, muhtemelen anlık karar veririm.",
        "Bunu daha önce hiç düşünmemiştim.",
        "Sanırım ilerledikçe çözerim.",
        "Emin değilim, belki ekipten birine sorarım.",
    ],
}

CV_TEMPLATES = {
    "strong": "{job} pozisyonuyla doğrudan ilgili 3-5 yıllık deneyime sahip; {skills} konularında pratik becerileri var.",
    "average": "{job} pozisyonuyla doğrudan ilgili olmasa da bir miktar perakende deneyimi var; {skills} konularının temellerine aşina.",
    "weak": "{job} pozisyonuyla ilgili deneyimi sınırlı veya hiç yok; temel perakende becerilerini henüz geliştiriyor.",
    "in_progress": "{job} pozisyonu için başvurusu sistemde kayıtlı; mülakat şu anda devam ediyor.",
    "not_started": "{job} pozisyonuna yakın zamanda başvurdu; özgeçmişi sistemde, mülakat henüz planlanmadı.",
}

SUMMARY_TEMPLATES = {
    "strong": "{name}, {job} pozisyonuyla net şekilde örtüşen, spesifik ve role uygun örnekler vererek açık bir iletişim sergiledi.",
    "average": "{name}, {job} pozisyonu için makul ama oldukça genel cevaplar verdi; yeterli ama somut detaylardan yoksun.",
    "weak": "{name}, {job} pozisyonu için somut ve kendinden emin cevaplar vermekte zorlandı; büyük olasılıkla ciddi bir oryantasyon desteğine ihtiyaç duyacaktır.",
}

JOBS = [
    {
        "title": "Satış Danışmanı",
        "department": "Satış Katı",
        "location": "İstanbul - Zorlu Center",
        "description": "Mağaza katı müşterilerine yardımcı olmak, satış işlemlerini gerçekleştirmek, ürün stoklarını düzenlemek ve mükemmel müşteri hizmeti sunarak mağaza satış hedeflerine ulaşılmasına katkı sağlamak.",
        "skills": [("Müşteri Hizmetleri", "Orta"), ("POS Sistemleri", "Başlangıç"), ("Takım Çalışması", "Orta")],
        "questions": [
            "Zor bir müşteriye yardımcı olduğunuz bir deneyimi anlatır mısınız?",
            "Yoğun saatlerde mağaza katını nasıl yönetirsiniz?",
            "Neden perakende satışta çalışmak istiyorsunuz?",
            "Aylık satış hedefine nasıl ulaşırsınız?",
        ],
        "strong_answers": [
            "Bir müşteri satın aldığı üründe kusur olduğunu söyleyerek şikayette bulunmuştu. Sakin kalıp özür diledim ve ürünü değiştirmeyi teklif ettim, sorun hızla çözüldü ve müşteri memnun ayrıldı.",
            "Öncelikle kaybolmuş görünen müşterilere yönelirim, işlemleri hızlı tutarım ve rafların doldurulması için bir meslektaşımdan yardım isteyip kendim müşteri katına odaklanırım.",
            "İnsanlarla iletişim kurmayı ve onlara aradıklarını bulmada yardımcı olmayı seviyorum, mağaza katının hızlı temposunu da seviyorum.",
            "Ek ürün önerileri sunarak, düzenli müşterilerin tercihlerini hatırlayarak ve haftalık olarak rakamlarımı takip edip buna göre ayarlama yaparak hedefe ulaşmaya çalışırım.",
        ],
    },
    {
        "title": "Kasiyer",
        "department": "Kasa Bölümü",
        "location": "Ankara - Kızılay",
        "description": "Kasa sistemini çalıştırmak, nakit ve kart işlemlerini eksiksiz gerçekleştirmek ve müşterilere hızlı, güler yüzlü bir ödeme deneyimi sunmak.",
        "skills": [("Kasa Yönetimi", "Orta"), ("Detaylara Dikkat", "Orta"), ("Müşteri Hizmetleri", "Başlangıç")],
        "questions": [
            "Kasa dengeleme konusundaki deneyiminizi anlatır mısınız?",
            "Bir müşterinin kartı reddedilirse ne yaparsınız?",
            "Yoğunlukta doğruluğunuzu nasıl korursunuz?",
            "Bir fiyat hatasını fark ettiğiniz bir durumu anlatır mısınız?",
        ],
        "strong_answers": [
            "Üç yıl boyunca her akşam kasamı kapattım ve hiçbir zaman 5 liradan fazla fark olmadı, kapatmadan önce her zaman çift kontrol yaparım.",
            "Müşteriyi utandırmadan sessizce başka bir ödeme yöntemi teklif eder ve sırayı aksatmadan devam ederim.",
            "Sıra uzun olsa bile ürün okutma ve toplam kontrolünde biraz yavaşlarım, çünkü hatalar kazandırdığından daha fazla zaman kaybettirir.",
            "Kasada bir kampanyanın doğru uygulanmadığını fark ettim ve daha fazla müşteriyi etkilemeden durumu yöneticime bildirdim.",
        ],
    },
    {
        "title": "Mağaza Müdürü",
        "department": "Yönetim",
        "location": "İzmir - Alsancak",
        "description": "Mağazanın günlük operasyonlarını yönetmek, personel vardiyalarını planlamak, satış performansını artırmak ve yüksek standartta müşteri deneyimi sağlamak.",
        "skills": [("Liderlik", "İleri"), ("Envanter Yönetimi", "Orta"), ("Satış Stratejisi", "İleri")],
        "questions": [
            "Performansı düşük bir ekip üyesini nasıl motive edersiniz?",
            "Bir kampanya döneminde stok yetersizliğini nasıl yönetirsiniz?",
            "Tatil sezonunda vardiya planlamasına yaklaşımınız nedir?",
            "Mağazanızın başarısını satış rakamları dışında nasıl ölçersiniz?",
        ],
        "strong_answers": [
            "Onunla özel olarak otururum, neyin engel olduğunu anlarım ve birlikte küçük, ulaşılabilir hedefler belirleriz.",
            "Önce yakın mağazalardan transfer imkanını kontrol ederim, ardından yeniden stoklama zamanı konusunda müşterilerle açık iletişim kurarım.",
            "Geçen yılın yoğunluk verilerine bakarım ve yoğun saatlerde yedek çağrılabilir personelle biraz fazla kadro bulundururum.",
            "Müşteri iade oranı, personel devir hızı ve gizli müşteri puanları benim için ciro kadar önemli.",
        ],
    },
    {
        "title": "Mağaza Müdür Yardımcısı",
        "department": "Yönetim",
        "location": "İstanbul - Bağdat Caddesi",
        "description": "Mağaza Müdürüne günlük operasyonlarda destek olmak, satış danışmanlarını denetlemek, vardiya planlaması yapmak ve müşteri ya da personel kaynaklı sorunları çözmek.",
        "skills": [("Takım Liderliği", "Orta"), ("Vardiya Planlama", "Orta"), ("Problem Çözme", "Orta")],
        "questions": [
            "Vardiya planlarken personel müsaitliğini mağaza ihtiyaçlarıyla nasıl dengelersiniz?",
            "İki ekip üyesi arasındaki bir anlaşmazlığı çözdüğünüz bir durumu anlatır mısınız?",
            "Bir acil durumda Mağaza Müdürüne ulaşamazsanız ne yaparsınız?",
            "Durgun bir satış döneminde ekibi nasıl motive tutarsınız?",
        ],
        "strong_answers": [
            "Önceden müsaitlik bilgisi toplarım, önce yoğun saatlerin kapsanmasına öncelik veririm, sonra mümkün olduğunca tercihlere yer açarım.",
            "İki danışman mola saatleri konusunda anlaşamamıştı, iki tarafı da ayrı ayrı dinledim ve belirsizliği ortadan kaldıracak net bir rotasyon planı oluşturdum.",
            "Mağazanın acil durum prosedürünü takip eder, alabileceğim en güvenli kararı alır ve kendisine ulaşır ulaşmaz her şeyi raporlarım.",
            "Eğitim ve küçük süreç iyileştirmelerine odaklanırım, böylece geçen zaman yine de verimli hissettirir.",
        ],
    },
    {
        "title": "Depo Elemanı",
        "department": "Lojistik",
        "location": "Kocaeli - Gebze",
        "description": "Gelen ürünleri teslim almak, ayrıştırmak ve depolamak, giden sevkiyatları hazırlamak ve depo envanter kayıtlarının doğruluğunu sağlamak.",
        "skills": [("Envanter Elleçleme", "Orta"), ("Forklift Kullanımı", "Başlangıç"), ("Fiziksel Dayanıklılık", "İleri")],
        "questions": [
            "Forklift kullanırken hangi güvenlik önlemlerine dikkat edersiniz?",
            "Envanter doğruluğunu nasıl takip edersiniz?",
            "Bir sevkiyatı zamanında yetiştirmek için zaman baskısı altında çalıştığınız bir durumu anlatır mısınız?",
            "Tüm vardiya boyunca tekrarlayan fiziksel işleri nasıl yönetirsiniz?",
        ],
        "strong_answers": [
            "Her zaman vardiya öncesi kontrol yaparım, işaretli koridorlara sadık kalırım ve kör noktalarda klakson çalarım.",
            "Giren ve çıkan her ürünü okuturum ve farkları erken yakalamak için her vardiya sonunda örnek sayımlar yaparım.",
            "Bayram öncesi yoğunlukta bir kamyonun erken kalkması gerekiyordu, öncelikli paletlerin önce çıkması için yükleme sırasını yeniden düzenledim.",
            "Kendimi doğru tempoda tutarım, uygun kaldırma tekniği kullanırım ve mümkün olduğunda görevleri ekip arkadaşlarımla rotasyonlu yaparım.",
        ],
    },
    {
        "title": "Vitrin ve Görsel Mağazacılık Uzmanı",
        "department": "Pazarlama",
        "location": "İstanbul - Nişantaşı",
        "description": "Marka kimliğine uygun, görsel açıdan etkileyici ürün vitrinleri ve mağaza düzenleri tasarlamak ve bunları güncel tutarak müşteri ilgisini artırmak.",
        "skills": [("Yaratıcılık", "İleri"), ("Görsel Tasarım", "Orta"), ("Detaylara Dikkat", "İleri")],
        "questions": [
            "Yeni bir sezon koleksiyonu için vitrin tasarımını nasıl kurgularsınız?",
            "Hangi ürünleri birlikte sergileyeceğinize nasıl karar verirsiniz?",
            "Gurur duyduğunuz bir vitrin tasarımını anlatır mısınız?",
            "Bir vitrinin işe yarayıp yaramadığını nasıl ölçersiniz?",
        ],
        "strong_answers": [
            "Vitrini tek bir sezonluk tema etrafında kurgularım, en yeni parçaları odak noktası yaparım ve tazeliğini korumak için stoğu iki haftada bir döndürüyorum.",
            "Ürünleri renk uyumu ve kullanım amacına göre gruplarım, böylece vitrin müşterinin anında anlayabileceği hızlı bir görsel hikaye anlatır.",
            "Ön vitrini tek renk temalı olarak yeniden tasarladım ve yaya trafiği fotoğrafları insanların belirgin şekilde daha fazla durup baktığını gösterdi.",
            "Vitrin önünde geçirilen süreyi ve öne çıkan ürünlerdeki satış artışını önceki iki haftayla karşılaştırarak takip ederim.",
        ],
    },
    {
        "title": "Envanter Uzmanı",
        "department": "Envanter Kontrol",
        "location": "Bursa - Nilüfer",
        "description": "Stok seviyelerini takip etmek, düzenli sayım yapmak, fiziksel stok ile sistem kayıtları arasındaki farkları gidermek ve depo ekibiyle koordineli şekilde stok tamamlama süreçlerini yürütmek.",
        "skills": [("Envanter Sistemleri", "Orta"), ("Veri Girişi", "Orta"), ("Analitik Düşünme", "Orta")],
        "questions": [
            "Envanter sayımlarının zamanla doğru kalmasını nasıl sağlarsınız?",
            "Sistem ile fiziksel stok arasında bir tutarsızlık bulduğunuz bir durumu anlatır mısınız?",
            "Excel veya envanter yazılımlarıyla çalışma konusunda kendinizi ne kadar yeterli görüyorsunuz?",
            "Yoğun bir haftada hangi ürünleri önce yeniden sayacağınıza nasıl karar verirsiniz?",
        ],
        "strong_answers": [
            "Yüksek devir hızına sahip ürünlerde düzenli döngüsel sayımlar yaparım ve farkları küçük hatalar birikmeden aynı gün gideririm.",
            "Bir kere sistemde 40 adet görünen bir üründen rafta sadece 25 adet olduğunu fark ettim, yanlış okutulmuş bir iade olduğunu tespit edip kaydı düzelttim.",
            "Çok rahatım, envanter yönetim yazılımlarını günlük olarak kullandım ve fark takibi için temel Excel formülleri oluşturabiliyorum.",
            "Önce yüksek değerli ve hızlı hareket eden ürünlerle başlarım çünkü buradaki tutarsızlıkların mağazaya etkisi en büyük olur.",
        ],
    },
    {
        "title": "Müşteri Deneyimi Uzmanı",
        "department": "Müşteri Hizmetleri",
        "location": "Antalya - Lara",
        "description": "Mağaza içi ve telefonla gelen müşteri taleplerini karşılamak, şikayetleri çözmek, müşteri geri bildirimlerini toplamak ve mağazada yüksek memnuniyet seviyesini korumaya katkı sağlamak.",
        "skills": [("İletişim", "İleri"), ("Çatışma Yönetimi", "Orta"), ("CRM Yazılımları", "Başlangıç")],
        "questions": [
            "İade politikasına kızgın bir müşteriyi nasıl yönetirsiniz?",
            "Müşteri geri bildirimlerini nasıl toplar ve buna göre hareket edersiniz?",
            "Olumsuz bir deneyimi olumluya çevirdiğiniz bir durumu anlatır mısınız?",
            "Tekrarlayan şikayetler karşısında sabrınızı nasıl korursunuz?",
        ],
        "strong_answers": [
            "Önce sözünü kesmeden tamamen dinlerim, hayal kırıklığını kabul ederim, sonra politikayı net şekilde açıklar ve sunabileceğim esneklikleri ararım.",
            "Tekrar eden şikayetlerin basit bir kaydını tutarım ve sadece bireysel vakaları değil kök nedenleri çözebilmemiz için ayda bir yöneticimle paylaşırım.",
            "Bir müşteri gecikmiş siparişi için üzgündü, bir sonraki alışverişinde indirim teklif ettim ve kişisel olarak takip ettim, sonrasında sadık bir müşteri haline geldi.",
            "Müşterinin bana kişisel olarak kızmadığını hatırlarım ve tonuna değil, çözmem gereken spesifik soruna odaklanırım.",
        ],
    },
    {
        "title": "Tedarik Zinciri Analisti",
        "department": "Tedarik Zinciri",
        "location": "İstanbul - Maslak (Genel Merkez)",
        "description": "Envanter ve sevkiyat verilerini analiz ederek tedarik zincirindeki verimsizlikleri tespit etmek, talep tahmini yapmak ve birden fazla mağaza lokasyonu için tedarikçi koordinasyonuna destek olmak.",
        "skills": [("Veri Analizi", "İleri"), ("Excel/Tablolama", "İleri"), ("Tedarik Zinciri Planlama", "Orta")],
        "questions": [
            "Tedarik zincirinde bir darboğazı nasıl tespit edersiniz?",
            "Sevkiyat veya envanter verilerini analiz etmek için hangi araçları kullanıyorsunuz?",
            "Sezonluk bir ürün için talep tahminine nasıl yaklaşırsınız?",
            "Analizinizin bir iş kararını değiştirdiği bir durumu anlatır mısınız?",
        ],
        "strong_answers": [
            "Tedarikçiden mağazaya kadar her aşamada teslim sürelerine ve doluluk oranlarına bakarım, hedeften en çok sapan aşamayı işaretlerim.",
            "Pivot tablolar ve temel modelleme için Excel'i rahatlıkla kullanıyorum, tedarikçi performansını zaman içinde takip etmek için dashboard araçları da kullandım.",
            "Son iki-üç yılın sezonluk satış verilerine bakarım, kampanyalara göre düzeltme yaparım ve talep artışları için bir tampon payı bırakırım.",
            "Analizim bir tedarikçinin sürekli sevkiyat gecikmesine neden olduğunu gösterdi, verileri sunduktan sonra siparişlerin bir kısmını yedek tedarikçiye kaydırdık ve gecikmeler belirgin şekilde azaldı.",
        ],
    },
    {
        "title": "E-Ticaret Operasyon Uzmanı",
        "department": "E-Ticaret",
        "location": "İstanbul - Maslak (Genel Merkez)",
        "description": "Online siparişlerin doğru şekilde karşılanmasını yönetmek, sevkiyat doğruluğu için depo ekibiyle koordinasyon sağlamak, ürün listelemelerini güncellemek ve online mağaza performansını takip etmek.",
        "skills": [("E-Ticaret Platformları", "Orta"), ("Sipariş Yönetimi", "Orta"), ("Detaylara Dikkat", "Orta")],
        "questions": [
            "Online siparişlerin doğru şekilde karşılanmasını nasıl sağlarsınız?",
            "Bir online ürün ilanında yanlış bilgi olduğunu fark ederseniz ne yaparsınız?",
            "Bir kampanya döneminde sipariş yoğunluğunu nasıl yönetirsiniz?",
            "Kargo sorunlarında depo ekibiyle nasıl koordine olursunuz?",
        ],
        "strong_answers": [
            "Sipariş kargoya çıkmadan önce detaylarını paket fişiyle karşılaştırırım ve stokla uyuşmayan siparişler için uyarılar kurarım.",
            "Hemen düzeltirim, son siparişlerin bundan etkilenip etkilenmediğini kontrol ederim, etkilenmişse ilgili müşterileri bilgilendiririm.",
            "Siparişleri önce kargo son teslim tarihine göre önceliklendiririm, stoğu azalan ürünleri işaretleyerek fazla satışı önlerim.",
            "Yoğun dönemlerde her sabah depo sorumlusuyla görüşürüm ve takılan siparişler için ortak bir takip listesi tutarım.",
        ],
    },
]

# 5 unique (first, last) display names per job, positionally aligned with TIER_ORDER.
NAMES_BY_JOB = [
    [("Ayşe", "Yılmaz"), ("Deniz", "Özkan"), ("Mert", "Aydın"), ("Barış", "Kurt"), ("Nazlı", "Şimşek")],
    [("Zeynep", "Kaya"), ("Umut", "Bulut"), ("Burak", "Şahin"), ("Ece", "Polat"), ("Serkan", "Taş")],
    [("Elif", "Demir"), ("Yusuf", "Özdemir"), ("Can", "Öztürk"), ("Sıla", "Çetin"), ("Onur", "Güler")],
    [("Deniz", "Çelik"), ("Aylin", "Erdoğan"), ("Selin", "Arslan"), ("Kerem", "Aslan"), ("İrem", "Koç")],
    [("Emre", "Doğan"), ("Ceyda", "Turan"), ("Gizem", "Kılıç"), ("Berk", "Yıldız"), ("Nazlı", "Kurt")],
    [("Cem", "Aksoy"), ("Buse", "Yıldız"), ("Onur", "Aksoy"), ("Ece", "Şimşek"), ("Kerem", "Bulut")],
    [("Barış", "Özdemir"), ("Sıla", "Aydın"), ("Umut", "Çelik"), ("İrem", "Taş"), ("Can", "Bulut")],
    [("Ece", "Aksoy"), ("Berk", "Demir"), ("Nazlı", "Öztürk"), ("Yusuf", "Kaya"), ("Selin", "Doğan")],
    [("Onur", "Erdoğan"), ("Aylin", "Kılıç"), ("Kerem", "Özkan"), ("Ceyda", "Yılmaz"), ("Burak", "Güler")],
    [("Sıla", "Polat"), ("Deniz", "Aksoy"), ("Emre", "Şimşek"), ("Zeynep", "Özdemir"), ("Mert", "Güler")],
]


def _phone(i: int) -> str:
    return f"+90 5{30 + i % 10} {100 + (i * 37) % 900} {1000 + (i * 91) % 9000}"


def _overall(scores: dict) -> float:
    return round(sum(scores.values()) / len(scores), 2)


def _clear_existing_data(db) -> None:
    for model in [
        CandidateAnswer, InterviewQuestion, AIScore, InterviewReport, InterviewSession,
        ConsentRecord, CandidateSkill, CandidateCV, Candidate, JobSkill, Job, User, Role,
    ]:
        db.query(model).delete()
    db.commit()


def run() -> None:
    db = SessionLocal()
    try:
        _clear_existing_data(db)

        # Three tiers: hr (day-to-day work, no management screens), hr_manager
        # (manages hr-role accounts via the Employees screen), admin (manages
        # everyone incl. other managers, plus the Audit Log — logs in at the
        # separate /admin/login, not /hr/login).
        hr_role = Role(name="hr")
        hr_manager_role = Role(name="hr_manager")
        admin_role = Role(name="admin")
        db.add_all([hr_role, hr_manager_role, admin_role])
        db.flush()

        hr_user = User(
            email="hr@retailco.example.com",
            hashed_password=hash_password(SEED_PASSWORD),
            full_name="Elif Kaya",
            role_id=hr_role.id,
        )
        hr_user_2 = User(
            email="hr2@retailco.example.com",
            hashed_password=hash_password(SEED_PASSWORD),
            full_name="Kadir Şen",
            role_id=hr_role.id,
        )
        hr_manager_user = User(
            email="admin@retailco.example.com",
            hashed_password=hash_password(SEED_PASSWORD),
            full_name="Mehmet Yıldırım",
            role_id=hr_manager_role.id,
        )
        admin_user = User(
            email="sysadmin@retailco.example.com",
            hashed_password=hash_password(SEED_PASSWORD),
            full_name="Sistem Yöneticisi",
            role_id=admin_role.id,
        )
        db.add_all([hr_user, hr_user_2, hr_manager_user, admin_user])
        db.flush()

        candidate_index = 0
        total_candidates = 0

        for job_index, job_data in enumerate(JOBS):
            job = Job(
                title=job_data["title"],
                description=job_data["description"],
                department=job_data["department"],
                location=job_data["location"],
                created_by_id=hr_user.id if job_index % 2 == 0 else hr_user_2.id,
                skills=[JobSkill(name=name, required_level=level) for name, level in job_data["skills"]],
            )
            db.add(job)
            db.flush()

            for tier, (first, last) in zip(TIER_ORDER, NAMES_BY_JOB[job_index]):
                full_name = f"{first} {last}"
                skill_names = [name for name, _level in job_data["skills"][: TIER_SKILL_COUNT[tier]]]
                cv_text = CV_TEMPLATES[tier].format(
                    job=job_data["title"],
                    skills=", ".join(name for name, _level in job_data["skills"]),
                )

                candidate = Candidate(
                    full_name=full_name,
                    email=f"{_ascii(first)}.{_ascii(last)}@example.com",
                    phone=_phone(candidate_index),
                    # Seed candidates get a login (assigned, not their
                    # personal email — see invitation_service.py) up front
                    # so they're testable without a separate invite step.
                    login_email=f"{_ascii(first)}.{_ascii(last)}@aday.mulakat.internal",
                    hashed_password=hash_password(SEED_PASSWORD),
                    job_id=job.id,
                    skills=[CandidateSkill(name=name) for name in skill_names],
                    cvs=[CandidateCV(file_path=f"/mock-cvs/{_ascii(first)}-{_ascii(last)}.pdf", parsed_text=cv_text)],
                )
                db.add(candidate)
                db.flush()
                candidate_index += 1
                total_candidates += 1

                if tier == "not_started":
                    continue

                db.add(ConsentRecord(
                    candidate_id=candidate.id,
                    camera_access=True,
                    microphone_access=True,
                    audio_recording=True,
                    video_recording=True,
                    ai_evaluation=True,
                ))

                session_status = "completed" if tier != "in_progress" else "in_progress"
                session = InterviewSession(candidate_id=candidate.id, job_id=job.id, status=session_status)
                db.add(session)
                db.flush()

                for order, question_text in enumerate(job_data["questions"]):
                    question = InterviewQuestion(session_id=session.id, text=question_text, order=order)
                    db.add(question)
                    db.flush()

                    if tier == "in_progress":
                        continue

                    answer_text = (
                        job_data["strong_answers"][order] if tier == "strong" else GENERIC_ANSWERS[tier][order]
                    )
                    db.add(CandidateAnswer(session_id=session.id, question_id=question.id, transcript=answer_text))

                if tier in TIER_SCORES:
                    scores = TIER_SCORES[tier]
                    db.add(AIScore(session_id=session.id, **scores, overall_score=_overall(scores)))
                    db.add(InterviewReport(
                        session_id=session.id,
                        summary=SUMMARY_TEMPLATES[tier].format(name=full_name, job=job_data["title"]),
                        recommendation=TIER_RECOMMENDATION[tier],
                    ))

        db.commit()
        print(f"Seeded {len(JOBS)} jobs and {total_candidates} candidates (4 users).")
        print(f"HR login (/hr/login): hr@retailco.example.com / {SEED_PASSWORD}")
        print(f"HR manager login (/hr/login): admin@retailco.example.com / {SEED_PASSWORD}")
        print(f"Admin login (/admin/login): sysadmin@retailco.example.com / {SEED_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
