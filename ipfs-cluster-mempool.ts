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
    const keys = Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [`meta-${k}`, v])
    );
    // console.log(cid, keys);
    return axios.post(this.#opts.rpcApi + `/pins/${cid}`, null, {
      params: keys,
    });
  }

  async appendData(topic: string, data: any): Promise<void> {
    const fd = new FormData();
    fd.append("myFile", JSON.stringify([Date.now(), topic, data]));
    try {
      console.log("1");
      const keys = Object.fromEntries(
        Object.entries({ mempool: "true" }).map(([k, v]) => [`meta-${k}`, v])
      );
      const resp = await axios.post(this.#opts.rpcApi + "/add", fd, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        params: keys,
      });
      console.log("2");
      return resp.data.cid;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  async appendMultiple(params: [topic: string, data: any][]) {
    const fd = new FormData();
    params.forEach(([topic, data], i) => {
      fd.append(`file${i}`, JSON.stringify([Date.now(), topic, data]));
    });
    const keys = Object.fromEntries(
      Object.entries({ mempool: "true" }).map(([k, v]) => [`meta-${k}`, v])
    );
    const resp = await axios.post(this.#opts.rpcApi + "/add", fd, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      params: keys,
    });
    console.log(resp.data);
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
    const dataByTopic: Record<string, any> = {};

    for (const { data } of rawContents) {
      const [_, k, v] = data;
      if (!dataByTopic[k]) dataByTopic[k] = [];
      dataByTopic[k].push(JSON.parse(JSON.stringify(v)));
    }

    console.time("mempoolToRemove")
    console.timeLog("mempoolToRemove", "Start")

    await Promise.all(
      rawContents.map(({ cid }) =>
        this._pinCidWithMetadata(cid, {
          mempoolToRemove: "true",
          mempool: "true",
        })
      )
    );

    console.timeEnd("mempoolToRemove")

    console.log("t2");

    return {
      contents: dataByTopic,
      onDone: async () => {
        console.time("Clear deadpool");
        const cids = await this._getCidsByMetadata({ mempoolToRemove: "true" });
        console.timeLog("Clear deadpool", cids.length);
        await Promise.all(
          cids.map((cid) => {
            return this._pinCidWithMetadata(cid, { deadpool: "true" }); // TODO this is ok but also we need TTL
          })
        );
        console.timeEnd("Clear deadpool");
      },
    };
  }

  private async _getCidsByMetadata(
    metadata: Record<string, string>
  ): Promise<IPFSHash[]> {
    const resp = await axios.get(this.#opts.pinApi + "/pins", {
      params: {
        limit: 500, // TODO paging? also perhaps depends on the use case. onEpoch needs everything, but read perhaps doesn't
        meta: JSON.stringify(metadata),
      }, // '{"mempool": "true"}'
    });
    return resp.data.results.map((r: any) => r.pin.cid);
  }

  private async _getContents() {
    console.time("get contents");
    const cids = await this._getCidsByMetadata({ mempool: "true" });
    console.timeLog("get contents", "got " + cids.length + "cids");
    console.timeEnd("get contents");
    return Promise.all(
      cids.map((cid) =>
        axios.get(`${this.#opts.gw}/${cid}`).then(({ data }) => ({
          data,
          cid: cid,
        }))
      )
    );
  }

  async length(): Promise<number> {
    // const cids = await this._getCidsByMetadata({ mempool: "true" });
    return 0; //cids.length;
  }

  async getContents(): Promise<{ [x: string]: any[] }> {
    // console.log("getting content");
    return {};
    // TODO interesting with caching mempool

    // const rawContents = await this._getContents();

    // const dataByTopic = {};

    // for (const { data } of rawContents) {
    //   const [_, k, v] = data;
    //   if (!dataByTopic[k]) dataByTopic[k] = [];
    //   dataByTopic[k].push(JSON.parse(JSON.stringify(v)));
    // }

    // console.log("got content");

    // return dataByTopic; // TODO reuse
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

// (async () => {
//   const icp = new IPFSClusterMempool({
//     pinApi: "http://localhost:9097",
//     rpcApi: "http://localhost:9094",
//     gw: "http://127.0.0.1:8080/ipfs",
//   });

//   await icp.temp()
//   return;

//   const h = await icp.appendData("t1", "moko");
//   await icp.appendData("t1", "zoko");
//   await icp.appendData("t2", "boko");
//   console.log(h);
//   const data = await icp.dump();
//   console.log(data);
// })();
