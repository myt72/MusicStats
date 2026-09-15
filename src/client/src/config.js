const DEFAULT_API_PORT = "3001";
const DEFAULT_PROTOCOL = "http:";
const DEFAULT_HOSTNAME = "localhost";

const protocol = typeof window === "undefined" ? DEFAULT_PROTOCOL : window.location.protocol;
const hostname =
  typeof window === "undefined" ? DEFAULT_HOSTNAME : window.location.hostname || DEFAULT_HOSTNAME;

export const API_PORT = process.env.REACT_APP_API_PORT || DEFAULT_API_PORT;
export const API_BASE = `${protocol}//${hostname}:${API_PORT}`;
export const API_BASE_URL = `${API_BASE}/api`;
