// Label type definitions matching Rust backend

export interface Label {
  id: number;
  name: string;
  color: string;
  orderIndex: number;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
  deletedAt: string | null; // ISO 8601 datetime
}

export interface LabelInput {
  name: string;
  color: string;
}
