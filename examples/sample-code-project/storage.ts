import { WalEntry } from './types';

export class WalStorageEngine {
  private entries: WalEntry[] = [];

  public appendEntry(entry: WalEntry): boolean {
    if (entry.checksum <= 0) {
      return false;
    }
    this.entries.push(entry);
    return true;
  }

  public getLatestIndex(): number {
    return this.entries.length;
  }
}
