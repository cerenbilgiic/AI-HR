import axios from 'axios'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import type { Job } from '../../types'

interface SkillDraft {
  name: string
  required_level: string
}

export default function JobCreate() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [department, setDepartment] = useState('')
  const [location, setLocation] = useState('')
  const [skills, setSkills] = useState<SkillDraft[]>([])
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillLevel, setNewSkillLevel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addSkill() {
    if (!newSkillName.trim()) return
    setSkills((s) => [...s, { name: newSkillName.trim(), required_level: newSkillLevel.trim() }])
    setNewSkillName('')
    setNewSkillLevel('')
  }

  function removeSkill(index: number) {
    setSkills((s) => s.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const { data } = await apiClient.post<Job>('/jobs', {
        title: title.trim(),
        description: description.trim(),
        department: department.trim() || null,
        location: location.trim() || null,
        skills: skills.map((s) => ({ name: s.name, required_level: s.required_level || null })),
      })
      navigate(`/hr/jobs/${data.id}`)
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setError(typeof detail === 'string' ? detail : 'İlan oluşturulamadı. Lütfen tekrar deneyin.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-6 text-xl font-semibold text-slate-100">Yeni İş İlanı</h2>

      <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Pozisyon Adı *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ör. Satış Danışmanı"
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Departman</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Ör. Mağaza Operasyonları"
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Lokasyon</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ör. İstanbul"
              className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Açıklama *
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Pozisyonun sorumlulukları, aranan nitelikler..."
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Aranan Beceriler
          </label>
          {skills.length > 0 && (
            <ul className="mb-2 divide-y divide-slate-800 rounded border border-slate-800">
              {skills.map((s, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2 text-sm text-slate-100">
                  <span>
                    {s.name}
                    {s.required_level && <span className="ml-2 text-xs text-slate-500">({s.required_level})</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSkill(i)}
                    className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-800"
                  >
                    Sil
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              placeholder="Beceri adı"
              className="flex-1 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500"
            />
            <input
              type="text"
              value={newSkillLevel}
              onChange={(e) => setNewSkillLevel(e.target.value)}
              placeholder="Seviye (opsiyonel)"
              className="w-36 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={addSkill}
              disabled={!newSkillName.trim()}
              className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-40"
            >
              Ekle
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          İlan oluşturduktan sonra mülakat sorularını ilan detay sayfasından ekleyebilirsiniz.
        </p>

        {error && <p className="text-sm font-medium text-rose-400">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => void handleSubmit()}
            disabled={saving || !title.trim() || !description.trim()}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {saving ? 'Oluşturuluyor…' : 'İlanı Oluştur'}
          </button>
          <button
            onClick={() => navigate('/hr/jobs')}
            className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  )
}
