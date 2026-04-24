export type SpeakerType = 'user' | 'assistant' | 'system';

export type MessageType = 'question' | 'answer' | 'system' | 'other';

export type SessionCreateRequest = {
  user_id?: string;
  title?: string;
};

export type SessionResponse = {
  session_id: string;
  user_id: string | null;
  title: string | null;
  started_at: string;
  last_activity_at: string;
  status: string;
};

export type SessionListResponse = SessionResponse[];

export type RawLogCreateRequest = {
  session_id: string;
  sequence_no: number;
  speaker_type: SpeakerType;
  content: string;
  occurred_at: string;
  message_type?: MessageType;
  reply_to_rawlog_id?: string | null;
  source_model?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type RawLogResponse = {
  rawlog_id: string;
  session_id: string;
  sequence_no: number;
  speaker_type: SpeakerType;
  content: string;
  occurred_at: string;
  message_type: MessageType | null;
  reply_to_rawlog_id: string | null;
  source_model: string | null;
  stored_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type SessionRawLogsResponse = {
  session_id: string;
  messages: RawLogResponse[];
};

export type ChatMessageRequest = {
  session_id?: string | null;
  user_id?: string;
  title?: string;
  content: string;
};

export type ChatMessageResponse = {
  session_id: string;
  user_message: RawLogResponse;
  assistant_message: RawLogResponse;
};
