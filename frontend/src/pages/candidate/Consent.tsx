import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { candidateApiClient } from '../../api/client'
import AIAvatar from '../../components/AIAvatar'
import { useAIVoice } from '../../hooks/useAIVoice'
import type { CandidateDetail, Job } from '../../types'

const INTRO_TEXT =
  'Mülakata başlamadan önce, Kişisel Verilerin Korunması Kanunu uyarınca onayınızı almamız ' +
  'gerekiyor. Mülakat sırasında sesiniz ve görüntünüz kaydedilecek ve yapay zeka tarafından ' +
  'işlenecektir. Lütfen aşağıdaki onay maddelerini dikkatlice okuyup kabul ediniz.'

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
  // Kept separate from `accepted` — this isn't part of the KVKK ConsentIn
  // payload sent to the backend, just an extra frontend gate confirming the
  // candidate knows which position they're applying for.
  const [positionConfirmed, setPositionConfirmed] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Device check is a preflight probe only — it acquires and immediately
  // releases the stream, purely to confirm a camera/mic exist and permission
  // is granted. Interview.tsx re-acquires its own stream when the interview
  // actually starts; this doesn't change that.
  const [cameraOk, setCameraOk] = useState(false)
  const [micOk, setMicOk] = useState(false)
  const [testingDevices, setTestingDevices] = useState(false)
  const [deviceError, setDeviceError] = useState<string | null>(null)

  const [cvUploaded, setCvUploaded] = useState(false)
  const [uploadingCv, setUploadingCv] = useState(false)
  const [cvError, setCvError] = useState<string | null>(null)

  const { speak, speaking, muted, setMuted } = useAIVoice()

  async function handleCvSelected(file: File) {
    setUploadingCv(true)
    setCvError(null)
    try {
      const formData = new FormData()
      formData.append('cv', file)
      await candidateApiClient.post('/candidates/me/cv', formData)
      setCvUploaded(true)
    } catch {
      setCvError('Özgeçmiş yüklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setUploadingCv(false)
    }
  }

  async function testDevices() {
    setTestingDevices(true)
    setDeviceError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setCameraOk(stream.getVideoTracks().length > 0)
      setMicOk(stream.getAudioTracks().length > 0)
      stream.getTracks().forEach((track) => track.stop())
    } catch {
      setCameraOk(false)
      setMicOk(false)
      setDeviceError('Kameranıza veya mikrofonunuza erişilemedi. Tarayıcı izinlerini kontrol edip tekrar deneyin.')
    } finally {
      setTestingDevices(false)
    }
  }

  useEffect(() => {
    candidateApiClient
      .get<CandidateDetail>('/candidates/me')
      .then((res) => candidateApiClient.get<Job>(`/jobs/${res.data.job_id}`))
      .then((res) => setJob(res.data))
      .catch(() => setError('Pozisyon bilgisi yüklenemedi. Lütfen tekrar deneyin.'))
  }, [])

  useEffect(() => {
    if (!job) return
    speak(INTRO_TEXT)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job])

  const allAccepted = Object.values(accepted).every(Boolean) && positionConfirmed && cameraOk && micOk

  async function handleContinue() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await candidateApiClient.post(`/candidates/${candidateId}/consent`, accepted)
      navigate(`/interview/${candidateId}/avatar`)
    } catch {
      setError('Onayınız kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!job && !error) return <p className="text-sm text-slate-500">Yükleniyor...</p>

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <AIAvatar speaking={speaking} />
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Mülakat Öncesi Onay</h2>
          <p className="mt-0.5 text-xs text-slate-500">Devam etmeden önce lütfen aşağıdakileri onaylayın.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => speak(INTRO_TEXT)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              🔊 Tekrar dinle
            </button>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              {muted ? '🔇 Sesi aç' : '🔈 Sesi kapat'}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300 shadow-sm">
        <h3 className="mb-2 font-semibold text-slate-100">
          Kişisel Verilerin Korunması Kanunu (KVKK) Aydınlatma Metni
        </h3>
        <p className="mb-2">
          6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, veri sorumlusu sıfatıyla
          şirketimiz tarafından, işe alım sürecini yürütmek amacıyla aşağıda belirtilen kişisel
          verileriniz işlenmektedir.
        </p>
        <p className="mb-1 font-medium text-slate-100">İşlenen Kişisel Veriler</p>
        <p className="mb-2">
          Ad-soyad, iletişim bilgileri, özgeçmiş (CV) içeriği, mülakat sırasında verdiğiniz sesli ve
          görüntülü yanıtlar, bu yanıtların yazıya dökülmüş hali ve yapay zekâ tarafından üretilen
          değerlendirme sonuçları.
        </p>
        <p className="mb-1 font-medium text-slate-100">İşlenme Amacı</p>
        <p className="mb-2">
          Başvurduğunuz pozisyona uygunluğunuzun değerlendirilmesi, ön mülakat sürecinin
          yürütülmesi ve işe alım kararına esas teşkil edecek bir değerlendirme raporunun
          oluşturulması.
        </p>
        <p className="mb-1 font-medium text-slate-100">Verilerin İşlenme ve Saklanma Yöntemi</p>
        <p className="mb-2">
          Ses ve görüntü kayıtlarınız, yapay zekâ değerlendirmesi için sistemimizde yerel olarak
          (üçüncü taraf bulut servislerine gönderilmeksizin) işlenir. Verileriniz, işe alım süreci
          sonuçlanana kadar veya ilgili mevzuatta öngörülen süre boyunca saklanır, bu sürenin sonunda
          silinir veya anonim hale getirilir.
        </p>
        <p className="mb-1 font-medium text-slate-100">Haklarınız</p>
        <p className="mb-2">
          KVKK'nın 11. maddesi uyarınca; verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna
          ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını
          öğrenme, yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış
          işlenmişse düzeltilmesini isteme, kanuni şartlar çerçevesinde silinmesini/yok edilmesini
          isteme ve bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme haklarına
          sahipsiniz. Bu haklarınızı kullanmak için insan kaynakları departmanımızla iletişime
          geçebilirsiniz.
        </p>
        <p className="text-xs text-slate-500">
          Not: Bu metin bir kavram kanıtlama (PoC) ortamı için örnek amaçlı hazırlanmıştır; gerçek
          aday verisi işlenmemektedir.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
        <h3 className="mb-2 font-semibold text-slate-100">Başlamadan Önce</h3>
        <p className="mb-3 text-sm text-slate-300">
          Bu mülakat kameranıza ve mikrofonunuza erişim gerektirir.
        </p>
        <ul className="mb-4 space-y-1 text-sm text-slate-300">
          <li>✓ Kameranız mülakat boyunca kullanılacaktır.</li>
          <li>✓ Mikrofonunuz cevaplarınızı kaydetmek için kullanılacaktır.</li>
          <li>✓ Sesiniz metne dönüştürülebilir.</li>
          <li>✓ Cevaplarınız yapay zekâ mülakat sistemi tarafından analiz edilebilir.</li>
        </ul>
        <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
          <span className={cameraOk ? 'font-medium text-slate-100' : 'text-slate-500'}>
            Kamera: {cameraOk ? '✓ Algılandı' : 'Kontrol edilmedi'}
          </span>
          <span className={micOk ? 'font-medium text-slate-100' : 'text-slate-500'}>
            Mikrofon: {micOk ? '✓ Algılandı' : 'Kontrol edilmedi'}
          </span>
        </div>
        <button
          type="button"
          onClick={testDevices}
          disabled={testingDevices}
          className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {testingDevices ? 'Kontrol ediliyor…' : 'Kamera ve Mikrofonu Test Et'}
        </button>
        {deviceError && <p className="mt-2 text-sm font-medium text-rose-400">{deviceError}</p>}
      </div>

      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
        <h3 className="mb-2 font-semibold text-slate-100">Özgeçmiş (CV)</h3>
        <p className="mb-3 text-sm text-slate-300">
          İsterseniz özgeçmişinizi yükleyebilirsiniz — yapay zekâ mülakat asistanı sorularınızı buna göre
          kişiselleştirebilir. Bu adım isteğe bağlıdır.
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            disabled={uploadingCv}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleCvSelected(file)
              e.target.value = ''
            }}
          />
          {uploadingCv ? 'Yükleniyor…' : cvUploaded ? '✓ Yüklendi — değiştir' : 'Özgeçmiş yükle'}
        </label>
        {cvError && <p className="mt-2 text-sm font-medium text-rose-400">{cvError}</p>}
      </div>

      <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
        <h3 className="mb-1 font-semibold text-amber-300">Mülakat Sırasında Dikkat Edilmesi Gerekenler</h3>
        <p className="text-sm text-slate-300">
          Mülakat başladıktan sonra başka bir sekmeye veya uygulamaya geçmeyiniz. İlk geçişte size bir
          uyarı gösterilir; ikinci kez sekme veya uygulama değiştirirseniz mülakatınız otomatik olarak
          sonlandırılır ve tekrar giriş yapamazsınız. Mülakatı tamamlayana kadar bu sayfada kalınız.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
        {job && (
          <label className="flex items-start gap-2 text-sm text-slate-100">
            <input
              type="checkbox"
              className="mt-0.5 accent-indigo-500"
              checked={positionConfirmed}
              onChange={(e) => setPositionConfirmed(e.target.checked)}
            />
            <span>
              <strong>"{job.title}"</strong> pozisyonuna başvurduğumu onaylıyorum.
            </span>
          </label>
        )}
        {CONSENT_ITEMS.map((item) => (
          <label key={item.key} className="flex items-start gap-2 text-sm text-slate-100">
            <input
              type="checkbox"
              className="mt-0.5 accent-indigo-500"
              checked={accepted[item.key]}
              onChange={(e) => setAccepted((prev) => ({ ...prev, [item.key]: e.target.checked }))}
            />
            {item.label}
          </label>
        ))}
      </div>

      {error && <p className="mt-2 text-sm font-medium text-rose-400">{error}</p>}
      <button
        disabled={!allAccepted || submitting}
        onClick={handleContinue}
        className="mt-6 w-full rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-40"
      >
        {submitting ? 'Kaydediliyor…' : 'Kabul ediyorum, devam et'}
      </button>
    </div>
  )
}
