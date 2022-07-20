import { IPFSHash, IPFSProvider, MutableDFile, AppendOnlyDFile } from "./dfile";

// todo str
export type BChainAddress = string;
type BChainData = string;

export interface BChainProvider {
  update(arg0: string, _hash: string);
  readData(contractAddr: BChainAddress): Promise<BChainData>;
}

type MemPoolContents = Record<string, any[]>;

export interface MemPool {
  appendData(topic: string, data: any): Promise<void>;
  dump(): Promise<MemPoolContents>;
  getContents(): Promise<MemPoolContents>;
}

class InMemoryMemPool implements MemPool {
  async getContents(): Promise<MemPoolContents> {
    const dataByTopic = {};

    this.#data.forEach(([_, k, v]) => {
      if (!dataByTopic[k]) dataByTopic[k] = [];
      dataByTopic[k].push(v);
    });

    return dataByTopic;
  }

  #data: any[] = [];

  async appendData(topic: string, data: any) {
    this.#data.push([new Date().getTime(), topic, data]);
  }

  async dump(): Promise<MemPoolContents> {
    const dataByTopic = await this.getContents();

    // TODO this is a dangerous side effect, we should consider carefully what triggers clearing the mempool
    // especially considering data keeps flowing in (distributed/async etc)
    this.#data = [];

    return dataByTopic;
  }
}

export class RootWriter {
  #ipfsProvider: IPFSProvider;
  #bchainProvider: BChainProvider;
  #rootContract: string;
  _hash: IPFSHash;
  #topicsRootDFile: MutableDFile<IPFSHash>;
  #mempool: InMemoryMemPool;
  #topicsDFiles: { [k: string]: string };

  constructor(
    ipfsProvider: IPFSProvider,
    bchainProvider: BChainProvider,
    rootContract: BChainAddress
  ) {
    this.#ipfsProvider = ipfsProvider;
    this.#bchainProvider = bchainProvider;
    this.#rootContract = rootContract;
    this.#mempool = new InMemoryMemPool();
  }

  static async init(
    ipfsProvider: IPFSProvider,
    bchainProvider: BChainProvider,
    rootContract: BChainAddress
  ) {
    const rw = new RootWriter(ipfsProvider, bchainProvider, rootContract);
    await rw.init();
    return rw;
  }

  async init() {
    // TODO should throw for unpersisted data? "if isModified"
    this._hash = (await this.#bchainProvider.readData(
      this.#rootContract
    )) as IPFSHash;

    this.#topicsRootDFile = await MutableDFile.from<IPFSHash>(
      this._hash,
      this.#ipfsProvider
    );
    this.#topicsDFiles = this.#topicsRootDFile.readLatest();
  }

  // TODO if fromHash==toHash
  async getTopicContents(
    topic: string,
    toHash?: IPFSHash
  ): Promise<{
    data: any[];
    hash: string;
  }> {
    const fromHash = this.#topicsDFiles[topic];
    const storageContents = await AppendOnlyDFile.read({
      fromHash,
      toHash,
      ipfsProvider: this.#ipfsProvider,
    });
    const mempoolContents = (await this.#mempool.getContents())[topic] ?? [];
    return {
      data: [...storageContents, ...mempoolContents],
      hash: fromHash,
    };
  }

  async appendData(topic: string, data: any) {
    await this.#mempool.appendData(topic, data);
  }

  // TODO election etc
  // TODO flow: 1. initialize, 2. fetch data (i'm not the leader), 3. close data (i'm the leader)
  async onEpoch() {
    const mempoolContents = await this.#mempool.dump();
    if (Object.keys(mempoolContents).length > 0) {
      const latestTopics = this.#topicsRootDFile.readLatest();

      const updatedHashes = await Promise.all(
        Object.entries(mempoolContents).map(async ([k, v]) => {
          // TODO presumably only if changed, though unchanged dfiles should result in the same_hash :)
          const { hash } = await AppendOnlyDFile.write({
            lastKnownHash: latestTopics[k],
            ipfsProvider: this.#ipfsProvider,
            data: v,
          });
          return [k, hash];
        })
      );

      this.#topicsRootDFile.mergeData(Object.fromEntries(updatedHashes));
      const { hash } = await this.#topicsRootDFile.write();
      this.#bchainProvider.update(this.#rootContract, hash);
      this._hash = hash;
      this.#topicsDFiles = this.#topicsRootDFile.readLatest();
    }
  }
}
