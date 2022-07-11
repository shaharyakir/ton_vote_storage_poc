export type IPFSHash = string; // TODO

export interface IPFSProvider {
  write(data: string): Promise<IPFSHash>;
  read(hash: IPFSHash): Promise<string>;
}

type FileContents<T> = {
  data: T[];
  prev: IPFSHash | null;
};

type WriteResponse<T> = {
  contents: FileContents<T>;
  hash: IPFSHash;
};

// T should be serializable as JSON
export class DFile<T> {
  #prev: IPFSHash | null;
  #data: T[] = [];
  #ipfsProvider: IPFSProvider;
  #hash: IPFSHash | null;

  constructor(prev: IPFSHash | null, h: IPFSProvider) {
    this.#ipfsProvider = h;
    this.#prev = prev;
  }

  static async from<T>(hash: IPFSHash, h: IPFSProvider): Promise<DFile<T>> {
    const newDFile = new DFile<T>(null, h);
    const fc = await newDFile.#readFile(hash);
    newDFile.#data = fc.data;
    newDFile.#prev = fc.prev;
    newDFile.#hash = hash;
    return newDFile;
  }

  async #readFile(hash: IPFSHash): Promise<FileContents<T>> {
    const s = await this.#ipfsProvider.read(hash);
    return JSON.parse(s) as FileContents<T>;
  }

  // Should generate IPFS hash for outstanding data + prev and return the new hash + content?
  async write(): Promise<WriteResponse<T>> {
    if (this.#hash) throw new Error("File was already locked");
    const fileContents: FileContents<T> = {
      data: this.#data,
      prev: this.#prev,
    };
    const h = await this.#ipfsProvider.write(JSON.stringify(fileContents));
    this.#hash = h;
    return {
      hash: h,
      contents: fileContents,
    };
  }

  appendData(d: T) {
    if (this.#hash) throw new Error("File was already locked");
    this.#data.unshift(d);
  }

  async readMerge(): Promise<T[]> {
    if (!this.#hash)
      throw new Error(
        "Cannot read unlocked files. Write this file first or instantiate using DFile.from"
      );
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
