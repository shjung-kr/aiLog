import type {
  ChatMessageRequest,
  ChatMessageResponse,
  EpisodeListResponse,
  RawLogCreateRequest,
  RawLogResponse,
  SessionCreateRequest,
  SessionListResponse,
  SessionRawLogsResponse,
  SessionResponse,
} from './types';

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function createSession(payload: SessionCreateRequest = {}): Promise<SessionResponse> {
  return request<SessionResponse>('/api/v1/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getSessions(limit = 50): Promise<SessionListResponse> {
  return request<SessionListResponse>(`/api/v1/sessions?limit=${limit}`);
}

export function createRawLog(payload: RawLogCreateRequest): Promise<RawLogResponse> {
  return request<RawLogResponse>('/api/v1/rawlogs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getSessionRawLogs(sessionId: string): Promise<SessionRawLogsResponse> {
  return request<SessionRawLogsResponse>(`/api/v1/sessions/${sessionId}/rawlogs`);
}

export function sendChatMessage(payload: ChatMessageRequest): Promise<ChatMessageResponse> {
  return request<ChatMessageResponse>('/api/v1/chat/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getEpisodes(sourceSessionId?: string, limit = 50): Promise<EpisodeListResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (sourceSessionId) {
    params.set('source_session_id', sourceSessionId);
  }
  return request<EpisodeListResponse>(`/api/v1/episodes?${params.toString()}`);
}
