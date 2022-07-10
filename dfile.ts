type IPFSHash = string; // TODO

export interface HashProvider {
    hash(data: string): IPFSHash
}

// T should be serializable as JSON
export class DFile<T> {
  #prev: IPFSHash | null;
  #data: [T?] = [];

  constructor(prev: IPFSHash | null) {
    this.#prev = prev;
  }

  // Should generate IPFS hash for outstanding data + prev and return the new hash + content?
  write() {

  }

  appendData(d: T) {
    this.#data.push(d);
  }
}


