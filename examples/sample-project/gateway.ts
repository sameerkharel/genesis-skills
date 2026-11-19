import { WalEntry, CommitResult } from './types';
import { WalStorage } from './storage';

export class ReplicatedGateway {
  private highWaterEpoch: number = 100;
  private readonly storage: WalStorage;

  constructor(storage: WalStorage) {
    this.storage = storage;
  }

  public commitWrite(entry: WalEntry): CommitResult {
    if (entry.epoch < this.highWaterEpoch) {
      return { ok: false, index: -1, reason: 'STALE_FENCE_TOKEN_REJECTED' };
    }
    this.highWaterEpoch = entry.epoch;
    const index = this.storage.append(entry);
    return { ok: true, index, reason: 'COMMITTED' };
  }
}
