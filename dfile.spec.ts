import { DFile, IPFSHash, IPFSProvider } from "./dfile";
import { of } from "ipfs-only-hash";

class DummyHushProvider implements IPFSProvider {
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

describe("dfile", () => {
  it("does smth", async () => {
    const hashProv = new DummyHushProvider();
    const df = new DFile<VoteData>(null, hashProv);
    df.appendData(allVotes[0]);
    df.appendData(allVotes[1]);
    const x = await df.write();
    expect(x.hash).toEqual("Qmcevz92Rp77du4qDFXnynYT6CMtdgbo3xLbAguLgyh5Ew");
    expect(x.contents).toEqual({
      data: allVotes.slice(0, 2).reverse(),
      prev: null,
    });

    const df2 = new DFile<VoteData>(x.hash, hashProv);
    df2.appendData(allVotes[2]);
    const x2 = await df2.write();
    expect(x2.contents).toEqual({
      data: allVotes.slice(2, 3).reverse(),
      prev: x.hash,
    });

    const df3 = new DFile<VoteData>(x2.hash, hashProv);
    df3.appendData(allVotes[3]);
    df3.appendData(allVotes[4]);
    const x3 = await df3.write();
    expect(x3.contents).toEqual({
      data: allVotes.slice(3).reverse(),
      prev: x2.hash,
    });

    const fullVC = await df3.readMerge();
    expect(fullVC).toEqual(allVotes.reverse());
  });
});
