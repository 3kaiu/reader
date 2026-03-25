export type BookshelfVirtualRow = {
  index: number;
  start: number;
};

export type BookshelfVirtualizer = {
  getTotalSize: () => number;
  getVirtualItems: () => BookshelfVirtualRow[];
};
