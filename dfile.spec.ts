import { DFile, IPFSHash, IPFSProvider } from "./dfile";
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

describe("DFile", () => {
  async function writeAndReadFromStorage(voteData: VoteData[], previousHash: IPFSHash | null, ipfsProvider: IPFSProvider) {
    const df = new DFile<VoteData>(previousHash, ipfsProvider);
    df.appendData(...voteData);
    const {hash} = await df.write();
    
    return {
        storedDf: (await DFile.from<VoteData>(hash, ipfsProvider)),
        hash
    }
  }

  it("Reads and merges from storage", async () => {
    const ipfsProv = new DummyIPFSProvider();

    const {storedDf: df1, hash: h1} = await writeAndReadFromStorage(allVotes.slice(0,2), null, ipfsProv);
    await expect(df1.readMerge()).resolves.toEqual(allVotes.slice(0,2).reverse())

    const {storedDf: df2, hash: h2} = await writeAndReadFromStorage(allVotes.slice(2,3), h1, ipfsProv);
    await expect(df2.readMerge()).resolves.toEqual(allVotes.slice(0,3).reverse())
    
    const {storedDf: df3} = await writeAndReadFromStorage(allVotes.slice(3,), h2, ipfsProv);
    await expect(df3.readMerge()).resolves.toEqual(allVotes.slice().reverse())
  });

  it("Written file should throw when appended", async () => {
    const hashProv = new DummyIPFSProvider();
    const df = new DFile<VoteData>(null, hashProv);
    df.appendData(...allVotes.slice(0,2));
    await df.write();
    expect(() => {
      df.appendData(allVotes[2]);
    }).toThrowError("Cannot append data to a locked file");
  });

  it("Unlocked file should throw when trying to read merge", async () => {
    const hashProv = new DummyIPFSProvider();
    const df = new DFile<VoteData>(null, hashProv);
    df.appendData(...allVotes.slice(0,2));
    await expect(df.readMerge()).rejects.toThrowError(
      "Cannot read unlocked files. Write this file first or instantiate using DFile.from"
    );
  });
  
  it("Unlocked file should throw when trying to write twice", async () => {
    const hashProv = new DummyIPFSProvider();
    const df = new DFile<VoteData>(null, hashProv);
    df.appendData(...allVotes.slice(0,2));
    await df.write();
    await expect(df.write()).rejects.toThrowError(
      "Cannot write an already locked file"
    );
  });
});
