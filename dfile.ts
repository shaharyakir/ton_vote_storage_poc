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

type WriteRequest<T> = {
  lastKnownHash: IPFSHash;
  ipfsProvider: IPFSProvider;
  data: T[];
};

type ReadRequest = {
  fromHash: IPFSHash;
  toHash?: IPFSHash;
  ipfsProvider: IPFSProvider;
};

// should use baseX instead of flat out JSON.stringify
// T should be serializable as JSON
export class AppendOnlyDFile {
  // Should generate IPFS hash for outstanding data + prev and return the new hash + content?
  // TODO change API
  static async write<T>({
    lastKnownHash,
    ipfsProvider,
    data,
  }: WriteRequest<T>): Promise<WriteResponse> {
    if (data.length === 0) throw new Error("Empty writes not allowed");
    const fileContents: FileContents<T[]> = {
      data,
      prev: lastKnownHash,
    };
    const h = await ipfsProvider.write(JSON.stringify(fileContents));
    return {
      hash: h,
    };
  }

  static async read<T>({fromHash, toHash, ipfsProvider}: ReadRequest): Promise<T[]> {
    let contents: T[] = [];
    let hashToRead: string | null = fromHash;

    while (hashToRead && hashToRead !== toHash) {
      const s = await ipfsProvider.read(hashToRead);
      const fc = JSON.parse(s) as FileContents<T[]>;
      hashToRead = fc.prev;
      contents = contents.concat(fc.data);
    }

    return contents;
  }
}

// A dictionary, latest version is full and up to date.
// TODO - remove prev
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
    this.#data = { ...this.#data, ...updatedData };
  }

  readLatest(): Record<string, T> {
    // TODO not sure about this in mutable => if (!this.#hash)
    //   throw new Error(
    //     "Cannot read unlocked files. Write this file first or instantiate using MutableDFile.from"
    //   );

    return this.#data;
  }
}
