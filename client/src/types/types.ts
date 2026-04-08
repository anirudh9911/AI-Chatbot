// types/types.ts

export interface SearchResult {
  title?: string;
  url?: string;
  [key: string]: unknown;
}

export interface SearchInfo {
  stages: string[];
  query: string;
  urls: (string | SearchResult)[];
  error?: string;
}

export interface Message {
  id: number;
  content: string;
  isUser: boolean;
  type: string;
  isLoading?: boolean;
  searchInfo?: SearchInfo;
}

export interface Conversation {
  thread_id: string;   // matches LangGraph checkpoint ID
  title: string;       // first user message, truncated to 80 chars
  created_at: string;  // ISO 8601 timestamp
  updated_at: string;  // ISO 8601 timestamp — used to sort sidebar
}
