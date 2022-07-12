import { IPFSProvider, IPFSHash } from "./dfile";
import { BChainProvider, RootWriter } from "./root-writer";
import { of } from "ipfs-only-hash";

class DummyIPFSProvider implements IPFSProvider {
  myData = {
    ROOT_HASH123: '{"data": {}, "prev": null}',
  };

  async write(data: string): Promise<IPFSHash> {
    const h = (await of(data)) as IPFSHash;
    this.myData[h] = data;
    return h;
  }
  read(hash: IPFSHash): Promise<string> {
    return this.myData[hash];
  }
}

class DummyBChainProvider implements BChainProvider {
  ptr: string = "ROOT_HASH123";
  update(arg0: string, hash: string) {
    this.ptr = hash;
  }
  async readData(contractAddr: string): Promise<string> {
    return this.ptr;
  }
}

describe("RootWriter", () => {
  it("Does not create a new master topic file when there are no updates", async () => {
    const ipfsProv = new DummyIPFSProvider();
    const bchainProv = new DummyBChainProvider();
    const rw = await RootWriter.init(ipfsProv, bchainProv, "N/A");

    expect(bchainProv.ptr).toEqual("ROOT_HASH123");
    await rw.onEpoch();
    expect(bchainProv.ptr).toEqual("ROOT_HASH123");
  });
  
  it("Creates a new master topic file when there are no updates", async () => {
    const ipfsProv = new DummyIPFSProvider();
    const bchainProv = new DummyBChainProvider();
    const rw = await RootWriter.init(ipfsProv, bchainProv, "N/A");

    expect(bchainProv.ptr).toEqual("ROOT_HASH123");
    rw.appendData("my_topic", true)
    await rw.onEpoch();
    expect(bchainProv.ptr).toEqual("Qmew46ymDFXYeU77q9urxULPmXJNvq2GHaWiVqQp7bqxQ1");
  });

  it("Fetches data", async () => {
    const ipfsProv = new DummyIPFSProvider();
    const bchainProv = new DummyBChainProvider();
    const rw = await RootWriter.init(ipfsProv, bchainProv, "N/A");

    expect(bchainProv.ptr).toEqual("ROOT_HASH123");

    await expect(rw.getTopicContents("nonexistent")).resolves.toEqual({"data": [], "hash": undefined})
    await rw.appendData("my_topic", "1")
    await expect(rw.getTopicContents("my_topic")).resolves.toEqual({"data": ["1"], "hash": undefined})
    await rw.onEpoch();
    await expect(rw.getTopicContents("my_topic")).resolves.toEqual({"data": ["1"], "hash": "QmZ9bP81TXqb7GbWdcPTjCe15wPWMZLWnpXNvFiEWabhdX"})
    expect(bchainProv.ptr).toEqual("QmNk9MuskzNvU1KrJxk5i3ZwzzL2giadKPS753mG29Jhyz");
  });
});
