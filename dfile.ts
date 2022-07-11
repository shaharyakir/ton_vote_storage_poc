export type IPFSHash = string; // TODO

export interface IPFSProvider {
  write(data: string): Promise<IPFSHash>;
  read(hash: IPFSHash): Promise<string>;
}

type FileContents<T> = {
  data: T;
  prev: IPFSHash | null;
};

type WriteResponse = {
  hash: IPFSHash;
};

/*
TODO(thoughts):

- Consider the lifecycle of the file:
1. One usage for it is to close a block in the mempool
2. Another is to construct the entire linked list from ipfs
3. Another is to construct the entire linked list from ipfs + mempool (which feels like a "close block without persistence")? 
   - do we really need #2?

=> so perhaps there should be a: 
   - static write method, which accepts the entire mempool data and returns the new hash
   - static read method, which accepts a hash and returns the entire linked list. optionally it could accept the mempool data to prepend it?

   so reading a single file feels redundant, and also appending
*/

// should use baseX instead of flat out JSON.stringify
// T should be serializable as JSON
export class AppendOnlyDFile {
  // #prev: IPFSHash | null;
  // #data: T[] = [];
  // #ipfsProvider: IPFSProvider;
  // #hash: IPFSHash | null;

  // constructor(prev: IPFSHash | null, h: IPFSProvider) {
  //   this.#ipfsProvider = h;
  //   this.#prev = prev;
  // }

  // TODO probably should be removed
  // static async from<T>(hash: IPFSHash, h: IPFSProvider): Promise<AppendOnlyDFile<T>> {
  //   const newDFile = new AppendOnlyDFile<T>(null, h);
  //   const fc = await newDFile.#readFile(hash);
  //   newDFile.#data = fc.data;
  //   newDFile.#prev = fc.prev;
  //   newDFile.#hash = hash;
  //   return newDFile;
  // }

  // Should generate IPFS hash for outstanding data + prev and return the new hash + content?
  static async write<T>(previousHash: IPFSHash | null, ...d: T[], ipfsProvider: IPFSProvider): Promise<WriteResponse> {
    const fileContents: FileContents<T[]> = {
      data: d,
      prev: previousHash,
    };
    const h = await ipfsProvider.write(JSON.stringify(fileContents));
    return {
      hash: h,
    };
  }

  // appendData(...d: T[]) {
  //   if (this.#hash) throw new Error("Cannot append data to a locked file");
  //   this.#data = [...d.reverse(), ...this.#data];
  // }

  static async read<T>(previousHash: IPFSHash | null, nonPersistentData?: T[], ipfsProvider: IPFSProvider): Promise<T[]> {
    
    let contents: T[] = nonPersistentData ?? [];
    let hashToRead: string | null = previousHash;

    while (hashToRead) {
      const s = await ipfsProvider.read(hashToRead);
      const fc = JSON.parse(s) as FileContents<T[]>;
      hashToRead = fc.prev;
      contents = contents.concat(fc.data);
    }

    return contents;
  }
}

// A dictionary, latest version is full and up to date.
type MutableFileContents<T> = FileContents<Record<string, T>>;

export class MutableDFile<T> {
  #prev: IPFSHash | null;
  #data: Record<string, T> = {};
  #ipfsProvider: IPFSProvider;
  #hash: IPFSHash | null;

  constructor(prev: IPFSHash | null, h: IPFSProvider) {
    this.#ipfsProvider = h;
    this.#prev = prev;
  }

  static async from<T>(
    hash: IPFSHash,
    h: IPFSProvider
  ): Promise<MutableDFile<T>> {
    const newDFile = new MutableDFile<T>(null, h);
    const fc = await newDFile.#readFile(hash);
    newDFile.#data = fc.data;
    newDFile.#prev = hash;
    return newDFile;
  }

  async #readFile(hash: IPFSHash): Promise<MutableFileContents<T>> {
    const s = await this.#ipfsProvider.read(hash);
    return JSON.parse(s) as MutableFileContents<T>;
  }

  // Should generate IPFS hash for outstanding data + prev and return the new hash + content?
  async write(): Promise<WriteResponse> {
    if (this.#hash) throw new Error("Cannot write an already locked file");
    const fileContents: MutableFileContents<T> = {
      data: this.#data,
      prev: this.#prev,
    };
    const h = await this.#ipfsProvider.write(JSON.stringify(fileContents));
    this.#hash = h;
    return {
      hash: h,
    };
  }

  mergeData(updatedData: Record<string, T>) {
    if (this.#hash) throw new Error("Cannot update a locked file");
    this.#data = {...this.#data, ...updatedData};
  }

  readLatest(): Record<string, T> {
    // TODO not sure about this in mutable => if (!this.#hash)
    //   throw new Error(
    //     "Cannot read unlocked files. Write this file first or instantiate using MutableDFile.from"
    //   );

    return this.#data;
  }
}
