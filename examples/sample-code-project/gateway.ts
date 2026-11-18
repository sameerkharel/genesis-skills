import { CommitResult, WalEntry } from './types';
import { WalStorageEngine } from './storage';

export class ReplicatedGateway {
  private highestFenceToken = 0;

  constructor(private readonly storage: WalStorageEngine) {}

  public commitWrite(entry: WalEntry): CommitResult {
    if (entry.fenceToken < this.highestFenceToken) {
      return {
        ok: false,
        index: this.storage.getLatestIndex(),
        fenceToken: this.highestFenceToken,
        reason: 'STALE_FENCE_TOKEN_REJECTED',
      };
    }
    this.highestFenceToken = entry.fenceToken;
    const appended = this.storage.appendEntry(entry);
    return {
      ok: appended,
      index: this.storage.getLatestIndex(),
      fenceToken: this.highestFenceToken,
      reason: appended ? 'COMMITTED' : 'INVALID_CRC_CHECKSUM',
    };
  }
}
