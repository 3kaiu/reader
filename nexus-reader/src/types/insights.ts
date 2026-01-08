/**
 * AI 洞察类型定义
 */

export interface CharacterTie {
  to: string;
  relation: string;
}

export interface Character {
  name: string;
  description: string;
  ties: CharacterTie[];
  role?: 'protagonist' | 'supporting' | 'others';
  isManual?: boolean;
}

export interface ChapterInsight {
  characters: Character[];
  summary?: string;
  mood?: 'ACTION' | 'CALM' | 'TENSION' | 'SAD';
}

export interface InsightCacheItem {
  bookUrl: string;
  chapterIndex: number;
  insight: ChapterInsight;
  timestamp: number;
}
