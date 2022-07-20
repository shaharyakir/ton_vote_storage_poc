import { AppendOnlyDFile, IPFSHash, IPFSProvider, MutableDFile } from "./dfile";
import { of } from "ipfs-only-hash";

class DummyIPFSProvider implements IPFSProvider {
  myData = {};

  async write(data: string): Promise<IPFSHash> {
    const h = (await of(data)) as IPFSHash;
    this.myData[h] = data;
    return h;
  }
  read(hash: IPFSHash): Promise<string> {
    return this.myData[hash];
  }
}

type VoteData = {
  voteContent: string;
  sig: string;
};

const allVotes = [
  { voteContent: "hi", sig: "bo" },
  { voteContent: "no", sig: "b123" },
  { voteContent: "hi", sig: "b456" },
  { voteContent: "hi", sig: "b799" },
  { voteContent: "hi", sig: "b994" },
];

describe("AppendOnlyDFile", () => {
  async function writeAndReadFromStorage(
    voteData: VoteData[],
    previousHash: IPFSHash | null,
    ipfsProvider: IPFSProvider
  ) {
    const { hash } = await AppendOnlyDFile.write({
      data: voteData,
      ipfsProvider: ipfsProvider,
      lastKnownHash: previousHash,
    });

    return {
      storedData: await AppendOnlyDFile.read({ fromHash: hash, ipfsProvider }),
      hash,
    };
  }

  it("Reads and merges from storage", async () => {
    const ipfsProv = new DummyIPFSProvider();

    const { storedData: df1, hash: h1 } = await writeAndReadFromStorage(
      allVotes.slice(0, 2),
      null,
      ipfsProv
    );

    expect(df1).toEqual(allVotes.slice(0, 2).reverse());

    const { storedData: df2, hash: h2 } = await writeAndReadFromStorage(
      allVotes.slice(2, 3),
      h1,
      ipfsProv
    );

    expect(df2).toEqual(allVotes.slice(0, 3).reverse());

    const { storedData: df3 } = await writeAndReadFromStorage(
      allVotes.slice(3),
      h2,
      ipfsProv
    );
    expect(df3).toEqual(allVotes.slice().reverse());
  });

  it("Reads partial data", async () => {
    const ipfsProv = new DummyIPFSProvider();

    const { storedData: df1, hash: h1 } = await writeAndReadFromStorage(
      allVotes.slice(0, 2),
      null,
      ipfsProv
    );

    expect(df1).toEqual(allVotes.slice(0, 2).reverse());

    const { storedData: df2, hash: h2 } = await writeAndReadFromStorage(
      allVotes.slice(2, 3),
      h1,
      ipfsProv
    );

    expect(df2).toEqual(allVotes.slice(0, 3).reverse());

    const { hash: h3 } = await writeAndReadFromStorage(
      allVotes.slice(3),
      h2,
      ipfsProv
    );

    const partialData = await AppendOnlyDFile.read({
      fromHash: h3,
      toHash: h2,
      ipfsProvider: ipfsProv,
    });
    expect(partialData).toEqual(allVotes.slice(3).reverse());

    const partialData2 = await AppendOnlyDFile.read({
      fromHash: h3,
      toHash: h1,
      ipfsProvider: ipfsProv,
    });
    expect(partialData2).toEqual(allVotes.slice(2).reverse());

    const partialData3 = await AppendOnlyDFile.read({
      fromHash: h2,
      toHash: h1,
      ipfsProvider: ipfsProv,
    });
    expect(partialData3).toEqual(allVotes.slice(2, 3).reverse());
  });
});

describe("MutableDFile", () => {
  it("Reads and merges from storage", async () => {
    const ipfsProv = new DummyIPFSProvider();

    const df = new MutableDFile<string>(null, ipfsProv);

    df.mergeData({ someKey: "XXXzzz", myKey: "zzzTTT" });
    df.mergeData({ anotherKey: "zzz" });

    const { hash } = await df.write();
    const sdf = await MutableDFile.from<VoteData>(hash, ipfsProv);
    const data = sdf.readLatest();

    expect(data).toEqual({
      someKey: "XXXzzz",
      myKey: "zzzTTT",
      anotherKey: "zzz",
    });
  });
});
