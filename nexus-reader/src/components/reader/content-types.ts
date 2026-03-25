export interface ReaderLoadedChapter {
  index: number;
  title: string;
  formattedContent?: string;
}

export type ReaderContentStyle = Record<string, string | number>;
