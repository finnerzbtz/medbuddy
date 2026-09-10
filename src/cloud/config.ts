const authUrl = import.meta.env.VITE_NEON_AUTH_URL ?? '';
const dataUrl = import.meta.env.VITE_NEON_DATA_URL ?? '';
export const cloudConfig = { authUrl, dataUrl, enabled: Boolean(authUrl && dataUrl) };
