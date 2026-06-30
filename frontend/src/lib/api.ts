/**
 * Cliente HTTP centralizado para la API de Futuro Antioquia.
 * Usa axios con interceptors para manejar tokens automáticamente.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const api: AxiosInstance = axios.create({
  baseURL:         API_URL,
  withCredentials: true, // Envía cookie httpOnly del refresh token
  timeout:         15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── REQUEST: adjuntar access token ───────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ── RESPONSE: renovar token si expira ────────────────────────
let renovando = false;
let cola: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as any;

    if (
      error.response?.status === 401 &&
      (error.response.data as any)?.code === 'TOKEN_EXPIRED' &&
      !original._reintento
    ) {
      original._reintento = true;

      if (renovando) {
        return new Promise((resolve) => {
          cola.push((nuevoToken: string) => {
            original.headers.Authorization = `Bearer ${nuevoToken}`;
            resolve(api(original));
          });
        });
      }

      renovando = true;
      try {
        const { data } = await api.post('/auth/refresh');
        const nuevoToken = data.accessToken;
        localStorage.setItem('accessToken', nuevoToken);

        cola.forEach((cb) => cb(nuevoToken));
        cola = [];
        renovando = false;

        original.headers.Authorization = `Bearer ${nuevoToken}`;
        return api(original);
      } catch {
        renovando = false;
        cola = [];
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
