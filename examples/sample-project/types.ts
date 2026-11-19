export interface WalEntry {
  index: number;
  epoch: number;
  key: string;
  value: string;
}

export interface CommitResult {
  ok: boolean;
  index: number;
  reason: string;
}
