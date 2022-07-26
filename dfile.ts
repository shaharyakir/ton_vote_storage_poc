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
  lastKnownHash: IPFSHash | null;
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
      data: data.slice().reverse(),
      prev: lastKnownHash,
    };
    const h = await ipfsProvider.write(JSON.stringify(fileContents));
    return {
      hash: h,
    };
  }

  static async read<T>({
    fromHash,
    toHash,
    ipfsProvider,
  }: ReadRequest): Promise<T[]> {
    let contents: T[] = [];
    let hashToRead: string | null = fromHash;

    // let i = 0;

    while (hashToRead && hashToRead !== toHash) {
      // i += 1;
      const s = await ipfsProvider.read(hashToRead);
      // const fc = JSON.parse(s) as FileContents<T[]>;
      // @ts-ignore
      const fc = s as FileContents<T[]>;
      // @ts-ignore
      // const idx = fc.data.findIndex(x => x.sig === '827.61926663285681658472219854')
      // if (i === 6 ||i === 7) {
      //   // @ts-ignore
      //   console.log(fc.data.map(d => parseFloat(d.sig)).sort((a,b) => a-b))
      // }
      hashToRead = fc.prev;
      contents = contents.concat(fc.data);
    }

    return contents;
  }
}

// A dictionary, latest version is full and up to date.
// TODO - remove prev?
type MutableFileContents<T> = FileContents<Record<string, T>>;

export class MutableDFile<T> {
  #ipfsProvider: IPFSProvider;
  #contents: MutableFileContents<T>;
  #currentHash: IPFSHash;

  constructor(
    currentHash: IPFSHash,
    contents: MutableFileContents<T>,
    h: IPFSProvider
  ) {
    this.#ipfsProvider = h;
    this.#contents = contents;
    this.#currentHash = currentHash;
  }

  static async from<T>(
    hash: IPFSHash,
    ipfsProvider: IPFSProvider
  ): Promise<MutableDFile<T>> {
    const rawData = await ipfsProvider.read(hash);
    // const fc = JSON.parse(rawData) as MutableFileContents<T>;
    // @ts-ignore
    const fc = rawData as MutableFileContents<T>;
    return new MutableDFile<T>(hash, fc, ipfsProvider);
  }

  // Should generate IPFS hash for outstanding data + prev and return the new hash + content?
  async write(dataToMerge: Record<string, T>): Promise<WriteResponse> {
    // console.log(JSON.stringify(this.#contents.data), JSON.stringify(dataToMerge))
    this.#contents = {
      data: { ...this.#contents.data, ...dataToMerge },
      prev: this.#currentHash,
    };
    const h = await this.#ipfsProvider.write(JSON.stringify(this.#contents));
    this.#currentHash = h;
    return {
      hash: h,
    };
  }

  readLatest(): Record<string, T> {
    return this.#contents.data;
  }
}
