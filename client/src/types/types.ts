// types/types.ts

export interface SearchResult {
  title?: string;
  url?: string;
  [key: string]: any;
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
