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
export const candidateApiClient = createClient('candidate_access_token', '/interview/login')

export default apiClient
