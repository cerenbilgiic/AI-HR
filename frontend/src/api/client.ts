import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

function createClient(tokenKey: string, loginPath: string) {
  const client = axios.create({ baseURL })

  client.interceptors.request.use((config) => {
    const token = localStorage.getItem(tokenKey)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        localStorage.removeItem(tokenKey)
        window.location.href = loginPath
      }
      return Promise.reject(error)
    },
  )

  return client
}

const apiClient = createClient('access_token', '/hr/login')
// There's no candidate login page — a candidate only ever gets in via a
// magic link emailed by HR (see pages/candidate/EnterInterview.tsx). If
// their token stops working mid-flow, this is where they land instead.
export const candidateApiClient = createClient('candidate_access_token', '/interview/expired')
// Own token/storage key, distinct from the HR client above — the admin
// panel is a fully separate portal (see components/AdminLayout.tsx,
// pages/admin/*) with its own login, so an admin and an HR staff account
// can be logged in at once without one overwriting the other's token.
export const adminApiClient = createClient('admin_access_token', '/admin/login')

export default apiClient
