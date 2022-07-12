import { IPFSHash, IPFSProvider, MutableDFile, AppendOnlyDFile } from "./dfile";

// todo str
export type BChainAddress = string;
type BChainData = string;

export interface BChainProvider {
  update(arg0: string, _hash: string);
  readData(contractAddr: BChainAddress): Promise<BChainData>;
}

class MemPool {
  #data: any[] = [];

  async updateTopic(key: string, value: any) {
    this.#data.push([new Date().getTime(), key, value]);
  }

  dump(): Record<string, any[]> {
    const dataByTopic = {};

    this.#data.forEach(([_, k, v]) => {
      if (!dataByTopic[k]) dataByTopic[k] = [];
      dataByTopic[k].push(v);
    });

    return dataByTopic;
  }
}

export class RootWriter {
  #ipfsProvider: IPFSProvider;
  #bchainProvider: BChainProvider;
  #rootContract: string;
  _hash: IPFSHash;
  #topicsRootDFile: MutableDFile<IPFSHash>;
  #mempool: MemPool;
  #topicsDFiles: { [k: string]: string };

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

    this.#topicsDFiles = this.#topicsRootDFile.readLatest();
    this.#mempool = new MemPool();
  }

  // TODO if fromHash==toHash
  async getTopicContents(topic: string, toHash?: IPFSHash) {
    const fromHash = this.#topicsDFiles[topic];
    const storageContents = await AppendOnlyDFile.read({
      fromHash,
      toHash,
      ipfsProvider: this.#ipfsProvider
    });
    const mempoolContents = this.#mempool.dump()[topic] ?? [];
    return {
      data: [...storageContents, ...mempoolContents],
      hash: fromHash
    };
  }

  updateTopic(key: string, value: any) {
    this.#mempool.updateTopic(key, value);
  }

  // TODO if changed etc.
  async closeBlock() {
    const mempoolContents = this.#mempool.dump();
    if (Object.keys(mempoolContents).length === 0) return;

    const latestTopics = this.#topicsRootDFile.readLatest();

    const updatedHashes = await Promise.all(
      Object.entries(mempoolContents).map(([k, v]) => {
        // TODO presumably only if changed, though unchanged dfiles should result in the same_hash :)
        return AppendOnlyDFile.write({
          lastKnownHash: latestTopics[k],
          ipfsProvider: this.#ipfsProvider,
          data: v,
        }).then(({ hash }) => [k, hash]);
      })
    );

    this.#topicsRootDFile.mergeData(Object.fromEntries(updatedHashes));
    const { hash } = await this.#topicsRootDFile.write();
    this.#bchainProvider.update(this.#rootContract, hash);
    await this.loadTopics(); // TODO improve perf etc.
  }
}
