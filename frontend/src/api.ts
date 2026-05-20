const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  if (!response.ok) {
    let message = `请求失败：${response.status}`;
    try {
      const payload = await response.json();
      message = payload.detail || message;
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function downloadCsv(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error(`导出失败：${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
