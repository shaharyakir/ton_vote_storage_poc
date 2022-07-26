import { IPFSHash, IPFSProvider, MutableDFile, AppendOnlyDFile } from "./dfile";
import { IPFSClusterMempool } from "./ipfs-cluster-mempool";

// todo str
export type BChainAddress = string;
type BChainData = string;

const memoizeTimeout = (fn: (arg0: any) => Promise<any>, time: number) => {
  let cache: Record<string, any> = {};

  // @ts-ignore
  return async (...args: any) => {
    //Create hash.
    const n = "SHOKO"; // btoa(args);

    //Find in cache or store new values.
    if (!(n in cache)) {
      // console.log("Creating cache");
      // @ts-ignore
      cache[n] = fn(...args).then((r) => {
        //Erase cache.
        setTimeout(() => {
          if (n in cache) {
            delete cache[n];
          }
        }, time);
        return r;
      });
    } else {
      // console.log("Already in cache");
    }
    return cache[n];
  };
};

export interface BChainProvider {
  update(arg0: string, _hash: string): void; // TODO
  readData(contractAddr: BChainAddress): Promise<BChainData>;
}

type MemPoolContents = Record<string, any[]>;

export interface MemPool {
  appendData(topic: string, data: any): Promise<void>;
  dump(): Promise<{ contents: MemPoolContents; onDone: () => Promise<void> }>;
  getContents(): Promise<MemPoolContents>;
  length(): Promise<number>;
}

class InMemoryMemPool implements MemPool {
  async length(): Promise<number> {
    return this.#data.length;
  }

  async getContents(): Promise<MemPoolContents> {
    const dataByTopic: Record<string, any> = {};

    this.#data.forEach(([_, k, v]) => {
      if (!dataByTopic[k]) dataByTopic[k] = [];
      dataByTopic[k].push(JSON.parse(JSON.stringify(v)));
    });

    return dataByTopic;
  }

  #data: any[] = [];

  async appendData(topic: string, data: any) {
    this.#data.push([Date.now(), topic, data]);
  }

  async dump(): Promise<{
    contents: MemPoolContents;
    onDone: () => Promise<void>;
  }> {
    const dataByTopic = await this.getContents();

    // TODO this is a dangerous side effect, we should consider carefully what triggers clearing the mempool
    // especially considering data keeps flowing in (distributed/async etc)
    // this.#data = [];

    const maxTs = this.#data.reduce(
      (prev, curr) => Math.max(prev, curr[0]),
      -1
    );

    const currLength = this.#data.length;

    return {
      contents: dataByTopic,
      onDone: async () => {
        this.#data = this.#data.slice(currLength);
      },
    };
  }
}

export class RootWriter {
  #ipfsProvider: IPFSProvider;
  #bchainProvider: BChainProvider;
  #rootContract: string;
  _hash!: IPFSHash;
  #topicsRootDFile!: MutableDFile<IPFSHash>;
  #mempool: MemPool;
  #topicsDFiles!: { [k: string]: string };
  #memoizedMempool!: (...args: any[]) => Promise<any>;

  constructor(
    ipfsProvider: IPFSProvider,
    bchainProvider: BChainProvider,
    rootContract: BChainAddress
  ) {
    this.#ipfsProvider = ipfsProvider;
    this.#bchainProvider = bchainProvider;
    this.#rootContract = rootContract;
    this.#mempool = new IPFSClusterMempool({
      pinApi: "http://3.16.42.100:9097",
      rpcApi: "http://3.16.42.100:9094",
      gw: "http://3.16.42.100/ipfs",
    });
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
    this.#memoizedMempool = memoizeTimeout(
      this.#mempool.getContents.bind(this.#mempool),
      10
    );
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

    const mempoolContents = (await this.#memoizedMempool())[topic] ?? [];
    const storageContents = await AppendOnlyDFile.read({
      fromHash,
      toHash,
      ipfsProvider: this.#ipfsProvider,
    });
    // console.log(
    //   "topic",
    //   topic,
    //   "fromhash",
    //   fromHash,
    //   "mempool",
    //   mempoolContents.length,
    //   "storage",
    //   storageContents.length
    // );
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
  isInEpoch = false;

  async onEpoch() {
    if (this.isInEpoch) return;
    console.time("In epoch");
    console.timeLog("In epoch", "starting mempool dump");
    this.isInEpoch = true;
    const { contents: mempoolContents, onDone: onMempoolDone } =
      await this.#mempool.dump();

    console.timeLog("In epoch", "mempooldump");

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

      console.timeLog("In epoch", "read topic");

      const { hash } = await this.#topicsRootDFile.write(
        Object.fromEntries(updatedHashes)
      );

      console.timeLog("In epoch", "write master hash " + hash);
      this.#bchainProvider.update(this.#rootContract, hash);
      this._hash = hash;
      this.#topicsDFiles = this.#topicsRootDFile.readLatest();
      console.log(this.#topicsDFiles, "before cleaning mempool");
      await onMempoolDone();
      console.timeLog("In epoch", "clear deadpool");
      console.timeEnd("In epoch");
    }
    this.isInEpoch = false;
  }

  async debugDump() {
    const mempoolLength = await this.#mempool.length();
    const rootHash = await this.#bchainProvider.readData(this.#rootContract);
    return {
      mempoolLength,
      rootHash,
      dfiles: this.#topicsDFiles,
    };
    console.log("================================");
    for (const [topic, hash] of Object.entries(
      this.#topicsRootDFile.readLatest()
    )) {
      const d = await this.getTopicContents(topic);
      console.log(`...${hash.slice(32)}`, topic, JSON.stringify(d.data));
    }
    console.log("================================\n\n");
  }
}

const sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
