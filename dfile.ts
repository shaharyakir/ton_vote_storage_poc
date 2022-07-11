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

// T should be serializable as JSON
export class AppendOnlyDFile<T> {
  #prev: IPFSHash | null;
  #data: T[] = [];
  #ipfsProvider: IPFSProvider;
  #hash: IPFSHash | null;

  constructor(prev: IPFSHash | null, h: IPFSProvider) {
    this.#ipfsProvider = h;
    this.#prev = prev;
  }

  // TODO probably should be removed
  static async from<T>(hash: IPFSHash, h: IPFSProvider): Promise<AppendOnlyDFile<T>> {
    const newDFile = new AppendOnlyDFile<T>(null, h);
    const fc = await newDFile.#readFile(hash);
    newDFile.#data = fc.data;
    newDFile.#prev = fc.prev;
    newDFile.#hash = hash;
    return newDFile;
  }

  async #readFile(hash: IPFSHash): Promise<FileContents<T[]>> {
    const s = await this.#ipfsProvider.read(hash);
    return JSON.parse(s) as FileContents<T[]>;
  }

  // Should generate IPFS hash for outstanding data + prev and return the new hash + content?
  async write(): Promise<WriteResponse> {
    if (this.#hash) throw new Error("Cannot write an already locked file");
    const fileContents: FileContents<T[]> = {
      data: this.#data,
      prev: this.#prev,
    };
    const h = await this.#ipfsProvider.write(JSON.stringify(fileContents));
    this.#hash = h;
    return {
      hash: h,
    };
  }

  appendData(...d: T[]) {
    if (this.#hash) throw new Error("Cannot append data to a locked file");
    this.#data = [...d.reverse(), ...this.#data];
  }

  async readMerge(): Promise<T[]> {
    // TODO not sure about this if (!this.#hash)
    //   throw new Error(
    //     "Cannot read unlocked files. Write this file first or instantiate using DFile.from"
    //   );

    let contents: T[] = this.#data;
    let hashToRead: string | null = this.#prev;

    while (hashToRead) {
      const fc = await this.#readFile(hashToRead);
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
