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

    setInterval(async () => {
      await this._rootWriter.onEpoch();
    }, 10000);
    setInterval(async () => {
      await this._rootWriter.debugDump();
    }, 4000);
  }

  async readData() {
    // TODO move caching into rootwriter
    const readTopic = async (t: string, skipCache: boolean = false) => {
      const { data, hash } = await this._rootWriter.getTopicContents(
        t,
        skipCache ? undefined : topicLastReadHashes[t]
      );
      // TODO -> cache causes problems with arrays
      // because votes from mempool are added twice. TBD
      topicLastReadHashes[t] = hash;
      return data;
    };

    const projects = await readTopic(this.#toTopic("projects"));

    // const newData = {projects: {}};

    for (const p of projects) {
      this.appData.projects[p.name] = this.appData.projects[p.name] ?? {};
    }

    const proposals: any[] = (
      (await Promise.all(
        Object.keys(this.appData.projects).map((proj) =>
          readTopic(this.#toTopic(proj, "proposals")).then((proposals) => {
            return proposals.map((proposal) => [proj, proposal]);
          })
        )
      )) ?? []
    ).flat();

    proposals.map(([proj, proposal]) => {
      this.appData.projects[proj][proposal.name] = proposal;
    });

    await Promise.all(
      Object.keys(this.appData.projects)
        .map((proj) => {
          return Object.values(this.appData.projects[proj]).map(
            (proposal: any) => {
              // console.log("Would read ", proj, proposal.name, " votes");
              return readTopic(this.#toTopic(proj, proposal.name), true).then(
                (votes?: any[]) => {
                  proposal.votes = votes ?? [];
                }
              );
            }
          );
        })
        .flat()
    );

    // for (const [proj, proposal] of proposals) {

    //   const votes =

    //   for (const proposal of Object.values(this.appData.projects[p])) {
    //     // @ts-ignore
    //     proposal.votes = [
    //       // @ts-ignore TODO - remove the skip cache
    //       ...((await readTopic(this.#toTopic(p, proposal.name), true)) ?? []),
    //       // @ts-ignore
    //       // ...(proposal.votes ?? []),
    //     ];
    //   }
    // }

    // console.log(JSON.stringify(this.appData, null, 3));
    // this.appData = newData;
    return this.appData;
  }

  #toTopic(...s: string[]) {
    return s.reduce(
      (prev, curr) => prev + "_" + curr.toLowerCase().replace(/\s/g, "_"),
      APP_PFX
    );
  }

  async addProject(p: Project) {
    // TODO someone should validate at this point -> and how does mempool etc avoid conflicts from different writers?
    await this._rootWriter.appendData(this.#toTopic("projects"), p);
  }

  submitProposal(projectName: string, p: Proposal) {
    // TODO someone should validate at this point -> and how does mempool etc avoid conflicts from different writers?
    this._rootWriter.appendData(this.#toTopic(projectName, "proposals"), p);
  }

  submitVote(projectName: string, proposalName: string, v: Vote) {
    this._rootWriter.appendData(this.#toTopic(projectName, proposalName), v);
  }
}
