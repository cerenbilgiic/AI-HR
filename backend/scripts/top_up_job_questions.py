"""One-off backfill: tops every job posting up to 5 interview questions.

Run with: python -m scripts.top_up_job_questions

Only adds questions to jobs that have fewer than 5 — jobs already at 5+ are
left untouched. New questions are appended after any existing ones (order
continues from the current max), so nothing already authored is reordered
or overwritten.
"""

from app.core.database import SessionLocal
from app.models.job import Job, JobQuestion

TARGET_COUNT = 5

# Role-specific, situational/behavioral questions matching this project's
# existing seed-question style — keyed by job title (see scripts/seed_data.py
# for the canonical retail job titles this PoC ships with).
NEW_QUESTIONS: dict[str, list[str]] = {
    "Satış Danışmanı": [
        "Bir müşteri aradığı ürünü bulamadığında ona nasıl yardımcı olursunuz?",
        "Aynı anda birden fazla müşteriye hizmet vermeniz gerektiğinde önceliklendirmeyi nasıl yaparsınız?",
        "Bir müşteriye ihtiyacından fazla ürün satmaya çalışmadan, doğru ürünü önermek için nasıl bir yaklaşım izlersiniz?",
        "Satış hedeflerinizi tutturamadığınız bir dönemde kendinizi nasıl motive edersiniz?",
        "Daha önce bir müşteriyi memnun etmek için beklenenin ötesine geçtiğiniz bir deneyiminizi anlatır mısınız?",
    ],
    "Mağaza Müdürü": [
        "Envanter sayımında sistemle fiziksel stok arasında sürekli fark çıkıyorsa bu sorunu nasıl araştırıp çözersiniz?",
        "Yoğun bir sezonda (örneğin indirim dönemi) ekibinizin vardiya planlamasını nasıl yaparsınız?",
    ],
    "Mağaza Müdür Yardımcısı": [
        "Mağaza Müdürü izinliyken beklenmedik bir personel eksikliği yaşanırsa nasıl bir çözüm üretirsiniz?",
        "Vardiya planlaması yaparken çalışanların taleplerini ve mağazanın ihtiyaçlarını nasıl dengelersiniz?",
        "Bir satış danışmanının performansında düşüş fark ederseniz nasıl yaklaşırsınız?",
        "Aynı anda hem bir müşteri şikâyetini hem de personel arasındaki bir anlaşmazlığı çözmeniz gerekirse önceliği nasıl belirlersiniz?",
        "Ekip içinde liderlik rolü üstlendiğiniz bir durumu ve sonucunu anlatır mısınız?",
    ],
    "Depo Elemanı": [
        "Gelen bir sevkiyatta hasarlı veya eksik ürün fark ederseniz nasıl bir yol izlersiniz?",
        "Yoğun bir sevkiyat gününde işleri önceliklendirmeyi nasıl yaparsınız?",
        "Fiziksel olarak yorucu ve tekrarlayan işlerde uzun vadede motivasyonunuzu nasıl korursunuz?",
        "Forklift veya benzer ekipman kullanırken güvenliğe nasıl dikkat edersiniz?",
        "Depo düzeninde veya envanter kayıtlarında bir hata fark ettiğinizde ne yaparsınız?",
    ],
    "Vitrin ve Görsel Mağazacılık Uzmanı": [
        "Yeni bir vitrin tasarlarken marka kimliğine uygunluğu nasıl sağlarsınız?",
        "Sınırlı bir bütçe veya malzemeyle etkileyici bir görsel düzenleme yapmanız gerekirse nasıl bir yol izlersiniz?",
        "Vitrin/mağaza düzenlemesinin satışları nasıl etkilediğini gözlemlediğiniz bir deneyiminizi anlatır mısınız?",
        "Yaratıcı bir fikriniz mağaza müdürü tarafından reddedilirse nasıl tepki verirsiniz?",
        "Sezonluk kampanya veya indirim dönemlerinde vitrin güncellemelerini ne sıklıkla ve nasıl planlarsınız?",
    ],
    "Envanter Uzmanı": [
        "Fiziksel sayımla sistem kayıtları arasında fark bulduğunuzda bu farkın kaynağını nasıl araştırırsınız?",
        "Stok tükenmesi riski taşıyan bir ürünü fark ettiğinizde hangi adımları izlersiniz?",
        "Yoğun bir stok sayım döneminde doğruluğu korurken hızlı çalışmayı nasıl başarırsınız?",
        "Envanter yönetim sistemlerinde daha önce hangi araçları kullandınız, veri girişinde hata payını nasıl azaltırsınız?",
        "Depo ekibiyle koordinasyon gerektiren bir stok tamamlama sürecini nasıl yönetirsiniz?",
    ],
    "Müşteri Deneyimi Uzmanı": [
        "Öfkeli veya memnuniyetsiz bir müşteriyle telefonda konuşurken sakinliğinizi nasıl korursunuz?",
        "Aynı şikâyetin tekrar tekrar geldiğini fark ettiğinizde bunu nasıl raporlar veya çözüme kavuşturursunuz?",
        "Bir müşteri talebini çözemeyeceğinizi anladığınızda ne yaparsınız?",
        "CRM veya benzer bir müşteri yönetim yazılımı kullanma deneyiminizi anlatır mısınız?",
        "Müşteri geri bildirimlerini toplayıp bunları mağaza/departman süreçlerine nasıl yansıtırsınız?",
    ],
    "Tedarik Zinciri Analisti": [
        "Tedarik zincirinde bir verimsizlik tespit ettiğinizde bunu nasıl analiz edip çözüm önerirsiniz?",
        "Talep tahmini yaparken hangi verileri ve yöntemleri kullanırsınız?",
        "Excel veya benzer araçlarla büyük veri setleri üzerinde çalışma deneyiminizi anlatır mısınız?",
        "Birden fazla mağaza lokasyonu arasında tedarik koordinasyonu yaparken karşılaştığınız zorluklar nelerdir?",
        "Bir tedarikçiyle teslimat gecikmesi yaşandığında bu durumu nasıl yönetirsiniz?",
    ],
    "E-Ticaret Operasyon Uzmanı": [
        "Online bir siparişte hata (yanlış ürün, eksik parça vb.) fark ettiğinizde süreci nasıl yönetirsiniz?",
        "Depo ekibiyle sevkiyat doğruluğunu sağlamak için nasıl bir koordinasyon kurarsınız?",
        "Ürün listelemelerini güncel ve doğru tutmak için nasıl bir çalışma disiplini uygularsınız?",
        "Yoğun bir kampanya döneminde (örneğin Black Friday) sipariş hacmindeki artışı nasıl yönetirsiniz?",
        "Online mağaza performansını takip ederken hangi metriklere odaklanırsınız?",
    ],
}


def main() -> None:
    db = SessionLocal()
    try:
        jobs = db.query(Job).all()
        added_total = 0
        for job in jobs:
            existing = (
                db.query(JobQuestion)
                .filter(JobQuestion.job_id == job.id)
                .order_by(JobQuestion.order)
                .all()
            )
            missing = TARGET_COUNT - len(existing)
            if missing <= 0:
                print(f"{job.title}: already has {len(existing)}, skipped")
                continue

            pool = NEW_QUESTIONS.get(job.title)
            if not pool:
                print(f"{job.title}: no question pool defined, skipped")
                continue

            next_order = (existing[-1].order + 1) if existing else 0
            for i, text in enumerate(pool[:missing]):
                db.add(JobQuestion(job_id=job.id, text=text, order=next_order + i))
            added_total += min(missing, len(pool))
            print(f"{job.title}: added {min(missing, len(pool))} (had {len(existing)})")

        db.commit()
        print(f"Done. Added {added_total} question(s) total.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
