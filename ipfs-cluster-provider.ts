import { IPFSHash, IPFSProvider } from "./dfile";
import axios from "axios";
type IPFSClusterProviderOpts = {
  rpcApi: string;
  pinApi: string;
  gw: string;
};
var FormData = require("form-data");

export class IPFSClusterProvider implements IPFSProvider {
  #opts: IPFSClusterProviderOpts;

  constructor(opts: IPFSClusterProviderOpts) {
    this.#opts = opts;
  }

  async write(data: string): Promise<string> {
    const fd = new FormData();
    fd.append("myFile", data);
    try {
      const resp = await axios.post(this.#opts.rpcApi + "/add", fd, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      // await axios.post(this.#opts.rpcApi + `/pins/${resp.data.cid}`);
      return resp.data.cid;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
  
  async appendMultiple(params: [topic: string, data: any][]): Promise<IPFSHash[]> {
    const fd = new FormData();
    params.forEach(([topic, data], i) => {
      fd.append(`file${i}`, data);
    });
    try {
      const resp = await axios.post(this.#opts.rpcApi + "/add", fd, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      // await axios.post(this.#opts.rpcApi + `/pins/${resp.data.cid}`);
      console.log(resp.data, "Shahar1")
      return resp.data.cid;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  async read(hash: string): Promise<string> {
    if (hash === "ROOT_HASH123") return JSON.parse('{"data": {}, "prev": null}');
    const resp = await axios.get(`${this.#opts.gw}/${hash}`);
    return resp.data;
  }
}

// (async () => {
//   const icp = new IPFSClusterProvider({
//     pinApi: "http://localhost:9097",
//     rpcApi: "http://localhost:9094",
//     gw: "http://127.0.0.1:8080/ipfs",
//   });

//   const h = await icp.write("kokomoko");
//   const data = await icp.read(h);
// })();
