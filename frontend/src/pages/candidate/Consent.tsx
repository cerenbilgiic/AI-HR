import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'

const CONSENT_ITEMS = [
  { key: 'camera_access', label: 'Kameraya erişim izni veriyorum.' },
  { key: 'microphone_access', label: 'Mikrofona erişim izni veriyorum.' },
  { key: 'audio_recording', label: 'Mülakat sırasında ses kaydı alınmasını kabul ediyorum.' },
  { key: 'video_recording', label: 'Mülakat sırasında video kaydı alınmasını kabul ediyorum.' },
  { key: 'ai_evaluation', label: 'Cevaplarımın yapay zekâ tarafından değerlendirilmesini kabul ediyorum.' },
  {
    key: 'kvkk_consent',
    label:
      'Aşağıdaki Aydınlatma Metni\'ni okudum; kişisel verilerimin belirtilen kapsam ve amaçlarla işlenmesine 6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca açık rızam ile onay veriyorum.',
  },
] as const

type ConsentKey = (typeof CONSENT_ITEMS)[number]['key']

export default function Consent() {
  const { candidateId } = useParams()
  const navigate = useNavigate()
  const [accepted, setAccepted] = useState<Record<ConsentKey, boolean>>({
    camera_access: false,
    microphone_access: false,
    audio_recording: false,
    video_recording: false,
    ai_evaluation: false,
    kvkk_consent: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allAccepted = Object.values(accepted).every(Boolean)

  async function handleContinue() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await candidateApiClient.post(`/candidates/${candidateId}/consent`, accepted)
      navigate(`/interview/${candidateId}/start`)
    } catch {
      setError('Onayınız kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Mülakat Öncesi Onay</h2>

      <div className="mb-6 max-h-72 overflow-y-auto rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <h3 className="mb-2 font-semibold text-gray-900">
          Kişisel Verilerin Korunması Kanunu (KVKK) Aydınlatma Metni
        </h3>
        <p className="mb-2">
          6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, veri sorumlusu sıfatıyla
          şirketimiz tarafından, işe alım sürecini yürütmek amacıyla aşağıda belirtilen kişisel
          verileriniz işlenmektedir.
        </p>
        <p className="mb-1 font-medium text-gray-900">İşlenen Kişisel Veriler</p>
        <p className="mb-2">
          Ad-soyad, iletişim bilgileri, özgeçmiş (CV) içeriği, mülakat sırasında verdiğiniz sesli ve
          görüntülü yanıtlar, bu yanıtların yazıya dökülmüş hali ve yapay zekâ tarafından üretilen
          değerlendirme sonuçları.
        </p>
        <p className="mb-1 font-medium text-gray-900">İşlenme Amacı</p>
        <p className="mb-2">
          Başvurduğunuz pozisyona uygunluğunuzun değerlendirilmesi, ön mülakat sürecinin
          yürütülmesi ve işe alım kararına esas teşkil edecek bir değerlendirme raporunun
          oluşturulması.
        </p>
        <p className="mb-1 font-medium text-gray-900">Verilerin İşlenme ve Saklanma Yöntemi</p>
        <p className="mb-2">
          Ses ve görüntü kayıtlarınız, yapay zekâ değerlendirmesi için sistemimizde yerel olarak
          (üçüncü taraf bulut servislerine gönderilmeksizin) işlenir. Verileriniz, işe alım süreci
          sonuçlanana kadar veya ilgili mevzuatta öngörülen süre boyunca saklanır, bu sürenin sonunda
          silinir veya anonim hale getirilir.
        </p>
        <p className="mb-1 font-medium text-gray-900">Haklarınız</p>
        <p className="mb-2">
          KVKK'nın 11. maddesi uyarınca; verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna
          ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını
          öğrenme, yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış
          işlenmişse düzeltilmesini isteme, kanuni şartlar çerçevesinde silinmesini/yok edilmesini
          isteme ve bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme haklarına
          sahipsiniz. Bu haklarınızı kullanmak için insan kaynakları departmanımızla iletişime
          geçebilirsiniz.
        </p>
        <p className="text-xs text-gray-500">
          Not: Bu metin bir kavram kanıtlama (PoC) ortamı için örnek amaçlı hazırlanmıştır; gerçek
          aday verisi işlenmemektedir.
        </p>
      </div>

      <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
        {CONSENT_ITEMS.map((item) => (
          <label key={item.key} className="flex items-start gap-2 text-sm text-gray-900">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={accepted[item.key]}
              onChange={(e) => setAccepted((prev) => ({ ...prev, [item.key]: e.target.checked }))}
            />
            {item.label}
          </label>
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        disabled={!allAccepted || submitting}
        onClick={handleContinue}
        className="mt-6 w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-40"
      >
        {submitting ? 'Kaydediliyor…' : 'Kabul ediyorum, devam et'}
      </button>
    </div>
  )
}
