// =============================================================================
// API CLIENT - HTTP REST WRAPPER
// =============================================================================

import { API_BASE } from '../core/constants.js';

export class ApiClient {
  static async get(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Lỗi máy chủ' }));
      throw new Error(err.detail || 'Lỗi gọi API');
    }
    return await res.json();
  }

  static async post(endpoint, data = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Lỗi máy chủ' }));
      throw new Error(err.detail || 'Lỗi gọi API');
    }
    return await res.json();
  }
}
