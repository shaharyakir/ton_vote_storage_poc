import { RootWriter, BChainProvider, BChainAddress } from "./root-writer";
import { IPFSProvider, AppendOnlyDFile } from './dfile';

type Proposal = { name: string; expiry: number };
type VoteAnswer = boolean;
type Vote = { vote: VoteAnswer; sig: string };

const APP_PFX = "voting_app";

export class VotingApp {
  _rootWriter: RootWriter;
  #ipfsProvider: IPFSProvider;
  #currentPtrs: { [k: string]: string };

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

    console.log(JSON.stringify(topicsDFiles, null, 3))
  }

  #toTopic(s: string) {
    return `${APP_PFX}_${s.toLowerCase().replace(/\s/g, "_")}`;
  }

  submitProposal(p: Proposal) {
    // TODO someone should validate at this point -> and how does mempool etc avoid conflicts from different writers?
    this._rootWriter.updateTopic(this.#toTopic("proposals"), p);
  }

  submitVote(proposalName: string, v: Vote) {
    this._rootWriter.updateTopic(this.#toTopic(proposalName), v);
  }
}
