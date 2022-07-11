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
  koko: string;
  moko: string;
};

describe("dfile", () => {
  it("does smth", async () => {
    const hashProv = new DummyHushProvider();
    const df = new DFile<VoteData>(null, hashProv);
    df.appendData({ koko: "hi", moko: "bo" });
    df.appendData({ koko: "zo", moko: "co" });
    const x = await df.write();
    expect(x.hash).toEqual("QmQAuVQWeULpUnFGHDWGBQyUJz2QiQwaiiGdbsCPzD2Jdq");
    expect(x.contents).toEqual({
      data: [
        { koko: "hi", moko: "bo" },
        { koko: "zo", moko: "co" },
      ],
      prev: null,
    });

    const df2 = new DFile<VoteData>(x.hash, hashProv);
    df2.appendData({ koko: "2", moko: "3" });
    const x2 = await df2.write();
    expect(x2.contents).toEqual({
      data: [{ koko: "2", moko: "3" }],
      prev: x.hash,
    });

    const df3 = new DFile<VoteData>(x2.hash, hashProv);
    df3.appendData({ koko: "4", moko: "999" });
    const x3 = await df3.write();
    expect(x3.contents).toEqual({
      data: [{ koko: "4", moko: "999" }],
      prev: x2.hash,
    });

    const fullVC = await df3.readMerge();
    expect(fullVC).toEqual([
      { koko: "4", moko: "999" },
      { koko: "2", moko: "3" },
      { koko: "hi", moko: "bo" },
      { koko: "zo", moko: "co" },
    ]);
  });
});
