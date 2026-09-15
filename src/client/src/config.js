const API_PORT = process.env.REACT_APP_API_PORT || "3001";

export const API_BASE = `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
