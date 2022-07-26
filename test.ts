// @ts-nocheck
import { AppendOnlyDFile } from "./dfile";
import { IPFSClusterProvider } from "./ipfs-cluster-provider";
import { RootWriter } from "./root-writer";

class DummyBChainProvider implements BChainProvider {
  ptr: string = "ROOT_HASH123";
  update(arg0: string, hash: string) {
    this.ptr = hash;
  }
  async readData(contractAddr: string): Promise<string> {
    return this.ptr;
  }
}

(async () => {
  const ip = new IPFSClusterProvider({
    pinApi: "http://localhost:9097",
    rpcApi: "http://localhost:9094",
    gw: "http://127.0.0.1:8080/ipfs",
  });

  // const d = await AppendOnlyDFile.read<any>({
  //   fromHash: "QmUTQ343KktXgDdSGP761aNCe4XsLT2WcZsdkpNzw249ae",
  //   ipfsProvider: ip,
  // });

  const bc = new DummyBChainProvider();

  const rw = new RootWriter(ip, bc, "X");

  await rw.init();

  let currProm;

  // await Promise.all(
  //   new Array(1000)
  //     .fill(1)
  //     .map((_) =>
  //       rw.appendData("myTopic4", {
  //         something: Math.random() + "_" + Date.now(),
  //       })
  //     )
  // );

  console.log("done enqueueing");

  for (const i of Array(100).keys()) {
    console.log("appending" + i);
    await rw.appendData("myTopic6", {
      something: Math.random() + "_" + Date.now(),
    });
    console.log("appending2" + i);
    if (i % 20 == 0) {
      currProm = rw.onEpoch();
    }
  }

  await currProm;
  while (rw.isInEpoch) {
    await rw.onEpoch();
  }
  await rw.onEpoch();

  const data = await rw.getTopicContents("myTopic6");
  console.log(
    data.data.map((d) => d.something).length,
    new Set(data.data.map((d) => d.something)).size
  );

  // const d = await AppendOnlyDFile.read<any>({
  //   fromHash: "QmR57JXoXV1vccrGSKvYh2NvFkgAsqpYU7omRxJjsvoW99",
  //   ipfsProvider: ip,
  // });

  // console.log(d);

  // const sigs = d.map((d) => d.sig);
  // console.log(sigs.length)
  // console.log(new Set(sigs).size)
})();
