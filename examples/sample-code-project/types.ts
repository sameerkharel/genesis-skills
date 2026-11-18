export interface WalEntry {
  index: number;
  fenceToken: number;
  payload: string;
  checksum: number;
}

export interface CommitResult {
  ok: boolean;
  index: number;
  fenceToken: number;
  reason: string;
}
