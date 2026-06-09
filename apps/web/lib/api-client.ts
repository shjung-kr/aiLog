import type {
  ChatMessageRequest,
  ChatMessageResponse,
  EpisodeListResponse,
  EpisodeResponse,
  LongTermMemoryResponse,
  PromoteResponse,
  RawLogCreateRequest,
  RawLogResponse,
  RetrievalRequest,
  RetrievalResponse,
  SessionCreateRequest,
  SessionListResponse,
  SessionRawLogsResponse,
  SessionResponse,
} from './types';

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
const apiKey = process.env.NEXT_PUBLIC_AILOG_API_KEY || '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-aiLog-API-Key': apiKey } : {}),
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

export function getEpisode(episodeId: string): Promise<EpisodeResponse> {
  return request<EpisodeResponse>(`/api/v1/episodes/${episodeId}`);
}

export function getEpisodeRawlogs(episodeId: string): Promise<RawLogResponse[]> {
  return request<RawLogResponse[]>(`/api/v1/episodes/${episodeId}/rawlogs`);
}

export function getSession(sessionId: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/api/v1/sessions/${sessionId}`);
}

export function getMemories(limit = 100): Promise<LongTermMemoryResponse[]> {
  return request<LongTermMemoryResponse[]>(`/api/v1/memories?limit=${limit}`);
}

export function promoteMemories(): Promise<PromoteResponse> {
  return request<PromoteResponse>('/api/v1/memories/promote', { method: 'POST' });
}

export function analyzeStyle(): Promise<{ status: string; profile?: Record<string, unknown> }> {
  return request('/api/v1/memories/analyze-style', { method: 'POST' });
}

export function retrieveMemory(payload: RetrievalRequest): Promise<RetrievalResponse> {
  return request<RetrievalResponse>('/api/v1/retrieval', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
