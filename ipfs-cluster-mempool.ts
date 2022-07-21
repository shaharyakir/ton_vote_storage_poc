import { IPFSProvider, IPFSHash } from "./dfile";
import axios from "axios";
import { MemPool } from "./root-writer";
type IPFSClusterProviderOpts = {
  rpcApi: string;
  pinApi: string;
  gw: string;
};
var FormData = require("form-data");

export class IPFSClusterMempool implements MemPool {
  #opts: IPFSClusterProviderOpts;

  constructor(opts: IPFSClusterProviderOpts) {
    this.#opts = opts;
  }

  private async _pinCidWithMetadata(
    cid: IPFSHash,
    metadata: Record<string, string>
  ) {
    return axios.post(this.#opts.rpcApi + `/pins/${cid}`, null, {
      params: Object.fromEntries(
        Object.entries(metadata).map(([k, v]) => [`meta-${k}`, v])
      ),
    });
  }

  async appendData(topic: string, data: any): Promise<void> {
    const fd = new FormData();
    fd.append("myFile", JSON.stringify([Date.now(), topic, data]));
    try {
      const resp = await axios.post(this.#opts.rpcApi + "/add", fd, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      await this._pinCidWithMetadata(resp.data.cid, { mempool: "true" });
      return resp.data.cid;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  async temp() {
    const cids = await this._getCidsByMetadata({ mempool: "true" });
    cids.forEach(async (c) => {
      await this._pinCidWithMetadata(c, { nope: "true" });
    });
  }

  async dump(): Promise<{
    contents: { [x: string]: any[] };
    onDone: () => Promise<void>;
  }> {
    const rawContents = await this._getContents();

    await Promise.all(
      rawContents.map(({ cid }) =>
        this._pinCidWithMetadata(cid, {
          mempoolToRemove: "true",
          mempool: "true",
        })
      )
    );

    const dataByTopic = {};

    for (const { data } of rawContents) {
      const [_, k, v] = data;
      if (!dataByTopic[k]) dataByTopic[k] = [];
      dataByTopic[k].push(JSON.parse(JSON.stringify(v)));
    }

    return {
      contents: dataByTopic,
      onDone: async () => {
        const cids = await this._getCidsByMetadata({ mempoolToRemove: "true" });
        await Promise.all(
          cids.map((cid) => {
            this._pinCidWithMetadata(cid, { deadPool: "true" }); // TODO this is ok but also we need TTL
          })
        );
      },
    };
  }

  private async _getCidsByMetadata(
    metadata: Record<string, string>
  ): Promise<IPFSHash[]> {
    const resp = await axios.get(this.#opts.pinApi + "/pins", {
      params: {
        limit: 1000, // TODO paging? also perhaps depends on the use case. onEpoch needs everything, but read perhaps doesn't
        meta: JSON.stringify(metadata),
      }, // '{"mempool": "true"}'
    });
    return resp.data.results.map((r) => r.pin.cid);
  }

  private async _getContents() {
    const cids = await this._getCidsByMetadata({ mempool: "true" });
    return Promise.all(
      cids.map((cid) =>
        axios.get(`${this.#opts.gw}/${cid}`).then(({ data }) => ({
          data,
          cid: cid,
        }))
      )
    );
  }

  async getContents(): Promise<{ [x: string]: any[] }> {
    return {};
  }
}

// async write(data: string): Promise<string> {
//   const fd = new FormData();
//   fd.append("myFile", data);
//   try {
//     const resp = await axios.post(this.#opts.rpcApi + "/add", fd, {
//       headers: {
//         "Content-Type": "multipart/form-data",
//       },
//     });
//     await axios.post(this.#opts.rpcApi + `/pins/${resp.data.cid}`);
//     return resp.data.cid;
//   } catch (e) {
//     console.error(e);
//     throw e;
//   }
// }
// async read(hash: string): Promise<string> {
//   if (hash === "ROOT_HASH123") return JSON.parse('{"data": {}, "prev": null}');
//   const resp = await axios.get(`${this.#opts.gw}/${hash}`);
//   return resp.data;
// }

(async () => {
  const icp = new IPFSClusterMempool({
    pinApi: "http://localhost:9097",
    rpcApi: "http://localhost:9094",
    gw: "http://127.0.0.1:8080/ipfs",
  });

  // await icp.temp()
  // return;

  const h = await icp.appendData("t1", "moko");
  await icp.appendData("t1", "zoko");
  await icp.appendData("t2", "boko");
  console.log(h);
  const data = await icp.dump();
  console.log(data);
})();
