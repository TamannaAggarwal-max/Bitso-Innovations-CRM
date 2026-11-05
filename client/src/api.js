import axios from "axios";
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api" });
api.interceptors.request.use(config => {
  const token = localStorage.getItem("bitso_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(r => r, error => {
  if (error.response?.status === 401) {
    localStorage.removeItem("bitso_token"); localStorage.removeItem("bitso_user");
    if (window.location.pathname !== "/login") window.location.href = "/login";
  }
  return Promise.reject(error);
});
export default api;
