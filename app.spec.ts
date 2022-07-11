import { AppendOnlyDFile, IPFSHash, IPFSProvider, MutableDFile } from "./dfile";
import { of } from "ipfs-only-hash";
import { VotingApp } from "./app";
import { BChainProvider } from "./root-writer";

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

describe("App", () => {
  it("Runs the app", async () => {
    const ipfsProv = new DummyIPFSProvider();
    const vapp = new VotingApp(
      ipfsProv,
      new DummyBChainProvider(),
      "DUMMY"
    );
    await vapp.readAndIndexAllData();
    vapp.submitProposal({ expiry: new Date().getTime(), name: "My proposal" });
    vapp.submitProposal({ expiry: new Date().getTime(), name: "My proposal #2" });
    vapp.submitVote("My proposal #2", {sig: "123", vote: true})

    await vapp['_rootWriter'].closeBlock()


    vapp.submitProposal({ expiry: new Date().getTime(), name: "My proposal #3" });
    vapp.submitVote("My proposal #2", {sig: "1234", vote: true})
    await vapp['_rootWriter'].closeBlock()

    const x = await vapp['_rootWriter'].getTopicsByPrefix("")
    const y = await x["voting_app_proposals"].readMerge();

    await vapp.readAndIndexAllData();

    console.log(JSON.stringify(ipfsProv.myData, null, 3))
  });
});
