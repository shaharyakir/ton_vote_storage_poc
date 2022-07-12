import { RootWriter, BChainProvider, BChainAddress } from "./root-writer";
import { IPFSProvider, IPFSHash } from "./dfile";

type Proposal = { name: string; expiry: number };
type Project = { name: string };
type VoteAnswer = boolean;
type Vote = { vote: VoteAnswer; sig: string };

const APP_PFX = "voting_app";

const topicLastReadHashes: Record<string, IPFSHash> = {};

export class VotingApp {
  _rootWriter: RootWriter;
  #ipfsProvider: IPFSProvider;

  appData: Record<string, any> = { projects: {} };
  #bchainProvider: BChainProvider;
  #rootContract: string;

  constructor(
    ipfsProvider: IPFSProvider,
    bchainProvider: BChainProvider,
    rootContract: BChainAddress
  ) {
    this.#ipfsProvider = ipfsProvider;
    this.#bchainProvider = bchainProvider;
    this.#rootContract = rootContract;
  }

  async initialize() {
    this._rootWriter = await RootWriter.init(
      this.#ipfsProvider,
      this.#bchainProvider,
      this.#rootContract
    );
  }

  async readData() {
    const readTopic = async (t: string) => {
      const { data, hash } = await this._rootWriter.getTopicContents(
        t,
        topicLastReadHashes[t]
      );
      topicLastReadHashes[t] = hash;
      if (t === "voting_app_aave_my_proposal_#2") {
        console.log("SHAHAR123123123213", data);
      }
      return data;
    };

    const projects = await readTopic(this.#toTopic("projects"));

    // TODO promise.all
    for (const p of projects) {
      this.appData.projects[p.name] = {};
    }

    for (const p of Object.keys(this.appData.projects)) {
      const proposals = (await readTopic(this.#toTopic(p, "proposals"))) ?? [];

      for (const proposal of proposals) {
        this.appData.projects[p][proposal.name] = proposal;
      }

      for (const proposal of Object.values(this.appData.projects[p])) {
        // @ts-ignore
        proposal.votes = [
          // @ts-ignore
          ...((await readTopic(this.#toTopic(p, proposal.name))) ?? []),
          // @ts-ignore
          ...(proposal.votes ?? []),
        ];
      }
    }

    console.log(JSON.stringify(this.appData, null, 3));
  }

  #toTopic(...s: string[]) {
    return s.reduce(
      (prev, curr) => prev + "_" + curr.toLowerCase().replace(/\s/g, "_"),
      APP_PFX
    );
  }

  addProject(p: Project) {
    // TODO someone should validate at this point -> and how does mempool etc avoid conflicts from different writers?
    this._rootWriter.updateTopic(this.#toTopic("projects"), p);
  }

  submitProposal(projectName: string, p: Proposal) {
    // TODO someone should validate at this point -> and how does mempool etc avoid conflicts from different writers?
    this._rootWriter.updateTopic(this.#toTopic(projectName, "proposals"), p);
  }

  submitVote(projectName: string, proposalName: string, v: Vote) {
    this._rootWriter.updateTopic(this.#toTopic(projectName, proposalName), v);
  }
}
