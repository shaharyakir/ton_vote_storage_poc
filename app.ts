import { RootWriter, BChainProvider, BChainAddress } from "./root-writer";
import { IPFSProvider, AppendOnlyDFile } from './dfile';

type Proposal = { name: string; expiry: number };
type Project = { name: string };
type VoteAnswer = boolean;
type Vote = { vote: VoteAnswer; sig: string };

const APP_PFX = "voting_app";

export class VotingApp {
  _rootWriter: RootWriter;
  #ipfsProvider: IPFSProvider;

  appData: Record<string, any> = {}

  constructor(
    ipfsProvider: IPFSProvider,
    bchainProvider: BChainProvider,
    rootContract: BChainAddress
  ) {
    this.#ipfsProvider = ipfsProvider;
    this._rootWriter = new RootWriter(
      this.#ipfsProvider,
      bchainProvider,
      rootContract
    );
  }

  async readAndIndexAllData() {
    await this._rootWriter.loadTopics();
    const topicsDFiles = Object.fromEntries(
        await Promise.all(
            Object.entries(this._rootWriter.getTopicsByPrefix(APP_PFX)).map(([k,v]) => v.readMerge().then(mergedData => [k, mergedData])
        )
    ));

    this.appData = {projects: {}};

    const projects = topicsDFiles[this.#toTopic("projects")];

    if (!projects) return

    projects.forEach((p:any) => {
        this.appData.projects[p.name] = {}
        const proposals = topicsDFiles[this.#toTopic(p.name , "proposals")] ?? [];
        proposals.forEach(proposal => {
            this.appData.projects[p.name][proposal.name] = proposal;
            proposal.votes = topicsDFiles[this.#toTopic(p.name , proposal.name)] ?? [];
        })
    })

    console.log(Object.keys(topicsDFiles))
    console.log(JSON.stringify(this.appData, null, 3))
    
  }

  #toTopic(...s: string[]) {
    return s.reduce((prev, curr) => prev + '_' + curr.toLowerCase().replace(/\s/g, '_'), APP_PFX);
  }

  addProject(p: Project) {
    // TODO someone should validate at this point -> and how does mempool etc avoid conflicts from different writers?
    this._rootWriter.updateTopic(this.#toTopic("projects"), p);
  }
  
  submitProposal(projectName: string, p: Proposal) {
    // TODO someone should validate at this point -> and how does mempool etc avoid conflicts from different writers?
    this._rootWriter.updateTopic(this.#toTopic(projectName , "proposals"), p);
  }

  submitVote(projectName: string, proposalName: string, v: Vote) {
    this._rootWriter.updateTopic(this.#toTopic(projectName, proposalName), v);
  }
}
