const AUTH_STORAGE_KEY = "clip-operator:site-password";

export function getStoredSitePassword(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return sessionStorage.getItem(AUTH_STORAGE_KEY);
}

export function storeSitePassword(password: string) {
  sessionStorage.setItem(AUTH_STORAGE_KEY, password);
}

export function clearSitePassword() {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export function authHeaders(): HeadersInit {
  const password = getStoredSitePassword();
  if (!password) {
    return {};
  }

  const encoded = btoa(`clip-operator:${password}`);
  return { Authorization: `Basic ${encoded}` };
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const auth = authHeaders();

  for (const [key, value] of Object.entries(auth)) {
    headers.set(key, value);
  }

  return fetch(input, { ...init, headers });
}
