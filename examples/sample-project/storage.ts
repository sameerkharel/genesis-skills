import { WalEntry } from './types';

export class WalStorage {
  private readonly records: WalEntry[] = [];

  public append(entry: WalEntry): number {
    this.records.push(entry);
    return this.records.length - 1;
  }

  public count(): number {
    return this.records.length;
  }
}
