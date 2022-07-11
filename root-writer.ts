import { IPFSHash, IPFSProvider, MutableDFile, AppendOnlyDFile } from "./dfile";

// todo str
export type BChainAddress = string;
type BChainData = string;

export interface BChainProvider {
  update(arg0: string,_hash: string);
  readData(contractAddr: BChainAddress): Promise<BChainData>;
}

class MemPool {
  #data: any[] = [];

  async updateTopic(key: string, value: any) {
    this.#data.push([new Date().getTime(), key, value]);
  }

  dump() {
    return this.#data;
  }
}

export class RootWriter {
  #ipfsProvider: IPFSProvider;
  #bchainProvider: BChainProvider;
  #rootContract: string;
  _hash: IPFSHash;
  #topicsRootDFile: MutableDFile<IPFSHash>;
  #mempool: MemPool;
  #topicsDFiles: { [k: string]: AppendOnlyDFile<any> };

  constructor(
    ipfsProvider: IPFSProvider,
    bchainProvider: BChainProvider,
    rootContract: BChainAddress
  ) {
    this.#ipfsProvider = ipfsProvider;
    this.#bchainProvider = bchainProvider;
    this.#rootContract = rootContract;
  }

  // TODO perhaps should be static .of() and avoid constructor
  async loadTopics() {
    // TODO should throw for unpersisted data? "if isModified"

    this._hash = (await this.#bchainProvider.readData(
      this.#rootContract
    )) as IPFSHash;

    // TODO Do we need a reference for this? mmm..
    this.#topicsRootDFile = await MutableDFile.from<IPFSHash>(
      this._hash,
      this.#ipfsProvider
    );

    this.#topicsDFiles = Object.fromEntries(
      Object.entries(this.#topicsRootDFile.readLatest()).map(([k, v]) => [
        k,
        new AppendOnlyDFile(v, this.#ipfsProvider),
      ])
    );

    this.#mempool = new MemPool();
  }

  getTopicsByPrefix(pfx: string) {
    return Object.fromEntries(
      Object.entries(this.#topicsDFiles).filter(([k]) =>
        k.toLowerCase().startsWith(pfx.toLowerCase())
      )
    );
  }

  updateTopic(key: string, value: any) {
    this.#mempool.updateTopic(key, value);
  }

  // TODO if changed etc.
  async closeBlock() {
    const newStuff: Record<string, AppendOnlyDFile<any>> = {};
    const mempoolContents = this.#mempool.dump();

    mempoolContents.forEach(([t, k, v]) => {
      if (!newStuff[k]) {
        newStuff[k] = new AppendOnlyDFile(
          this.#topicsRootDFile.readLatest()[k],
          this.#ipfsProvider
        );
      }
      newStuff[k].appendData(v);
    });

    // throw new Error(JSON.stringify(newStuff))

    const updatedHashes = await Promise.all(
      Object.entries(newStuff).map(([k, v]) => {
        // TODO presumably only if changed, though unchanged dfiles should result in the same_hash :)
        return v.write().then(({ hash }) => [k, hash]);
      })
    );

    this.#topicsRootDFile.mergeData(Object.fromEntries(updatedHashes));
    const { hash } = await this.#topicsRootDFile.write();
    this.#bchainProvider.update(this.#rootContract, hash);
    await this.loadTopics(); // TODO improve perf etc.
  }
}
