// @ts-nocheck

import React, { useEffect, useState } from "react";
import logo from "./logo.svg";
import "./App.css";

import {
  IPFSProvider,
  IPFSHash,
  BChainProvider,
  VotingApp,
} from "l3-storage-tests";
import { of } from "ipfs-only-hash";

import {
  RecoilRoot,
  atom,
  selector,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";

class DummyIPFSProvider implements IPFSProvider {
  myData = {
    ROOT_HASH123: '{"data": {}, "prev": null}',
  };

  constructor() {
    this.myData = localStorage.getItem("vappData")
      ? JSON.parse(localStorage.getItem("vappData"))
      : {
          ROOT_HASH123: '{"data": {}, "prev": null}',
        };
  }

  async write(data: string): Promise<IPFSHash> {
    const h = (await of(data)) as IPFSHash;
    this.myData[h] = data;
    localStorage.setItem("vappData", JSON.stringify(this.myData));
    return h;
  }
  read(hash: IPFSHash): Promise<string> {
    return this.myData[hash];
  }
}

class DummyBChainProvider implements BChainProvider {
  update(arg0: string, hash: string) {
    localStorage.setItem("rootPtr", hash);
  }
  async readData(contractAddr: string): Promise<string> {
    return localStorage.getItem("rootPtr") ?? "ROOT_HASH123";
  }
}

const vapp = new VotingApp(
  new DummyIPFSProvider(),
  new DummyBChainProvider(),
  "DUMMY"
);

function App() {
  return (
    <RecoilRoot>
      <VPP />
    </RecoilRoot>
  );
}

const votingDB = atom({
  key: "votingDB", // unique ID (with respect to other atoms/selectors)
  default: {}, // default value (aka initial value)
});

const appStateAtom = atom({
  key: "appState", // unique ID (with respect to other atoms/selectors)
  default: {
    selectedProject: null,
    selectedProposal: null,
  }, // default value (aka initial value)
});

const refreshData = async (setAppData: any) => {
  const data = await vapp.readData();
  // @ts-ignore
  setAppData(JSON.parse(JSON.stringify(data)));
};

function VPP() {
  const [votingDBData, setVotingDB] = useRecoilState(votingDB);
  const { selectedProject, selectedProposal } = useRecoilValue(appStateAtom);

  useEffect(() => {
    (async () => {
      await vapp.initialize();
      await refreshData(setVotingDB);
    })();
  }, [setVotingDB]);

  return (
    <div className="App">
      {/* koko Echo: {JSON.stringify(appData)} */}
      {/* <button
        onClick={async () => {
          await vapp.addProject({ name: "oko" });
          await vapp.submitProposal("oko", { expiry: 100, name: "my propo" });
          await vapp.submitVote("oko", "my propo", { sig: "123", vote: false });
          await refreshData(setAppData);
        }}
        >
        shoko
      </button> */}
      <div style={{ display: "flex", gap: 20 }}>
        <Projects />
        {selectedProject && <Proposals />}
        {selectedProposal && <Votes />}
      </div>
    </div>
  );
}

function Votes() {
  const data = useRecoilValue(votingDB);
  const [appState, setAppState] = useRecoilState(appStateAtom);
  const votes =
    data?.projects[appState.selectedProject][appState.selectedProposal].votes;
  return (
    <div style={{ flexBasis: "20%" }}>
      <Vote />

      <h2>Votes ({votes.length})</h2>
      {votes.map((vote) => (
        <div key={vote.sig}>
          {vote.sig} {`${vote.vote ? "✅" : "🔻"}`}
        </div>
      ))}
    </div>
  );
}

function Vote() {
  const [_, setAppData] = useRecoilState(votingDB);
  const [appState, setAppState] = useRecoilState(appStateAtom);

  useEffect(() => {
    const interval = setInterval(async () => {
      // await vote(false);
    }, 1);
    return () => clearInterval(interval);
  }, []);

  const vote = async (isIt: boolean) => {
    await vapp.submitVote(appState.selectedProject, appState.selectedProposal, {
      sig: `${Math.random() * 1000}${Date.now()}`,
      vote: isIt,
    });
    await refreshData(setAppData);
  };

  return (
    <div>
      <button onClick={() => vote(true)}>Yes</button>
      <button onClick={() => vote(false)}>No</button>
    </div>
  );
}

function CreateProposal() {
  const [inputValue, setInputValue] = useState("");
  const [_, setAppData] = useRecoilState(votingDB);
  const [appState, setAppState] = useRecoilState(appStateAtom);

  const addItem = async () => {
    await vapp.submitProposal(appState.selectedProject, { name: inputValue });
    setInputValue("");
    await refreshData(setAppData);
  };

  const onChange = ({ target: { value } }) => {
    setInputValue(value);
  };

  return (
    <div>
      <input type="text" value={inputValue} onChange={onChange} />
      <button onClick={addItem}>Add</button>
    </div>
  );
}

function Proposals() {
  const data = useRecoilValue(votingDB);
  const [appState, setAppState] = useRecoilState(appStateAtom);
  return (
    <div style={{ flexBasis: "33%" }}>
      <h2>
        Proposals{" "}
        {appState.selectedProposal
          ? `(Selected: ${appState.selectedProposal})`
          : ""}{" "}
      </h2>
      {Object.keys(data?.projects[appState.selectedProject] ?? []).map(
        (proposal) => (
          <div
            style={{
              cursor: "pointer",
              fontWeight: proposal === appState.selectedProposal ? 700 : 500,
            }}
            className="projects"
            onClick={() => {
              setAppState((s) => ({ ...s, selectedProposal: proposal }));
            }}
            key={proposal}
          >
            {proposal}
          </div>
        )
      )}
      <h3> Add proposal </h3>
      <CreateProposal />
    </div>
  );
}

function Projects() {
  const data = useRecoilValue(votingDB);
  const [appState, setAppState] = useRecoilState(appStateAtom);
  return (
    <div style={{ flexBasis: "20%" }}>
      <h2>
        {" "}
        Projects{" "}
        {appState.selectedProject
          ? `(Selected: ${appState.selectedProject})`
          : ""}{" "}
      </h2>
      {Object.keys(data?.projects ?? []).map((p) => (
        <div
          style={{
            cursor: "pointer",
            fontWeight: p === appState.selectedProject ? 700 : 500,
          }}
          className="projects"
          onClick={() =>
            setAppState({ selectedProject: p, selectedProposal: null })
          }
          key={p}
        >
          {p}
        </div>
      ))}
      <h3> Add project </h3>
      <CreateProject />
    </div>
  );
}

function CreateProject() {
  const [inputValue, setInputValue] = useState("");
  const [appData, setAppData] = useRecoilState(votingDB);

  const addItem = async () => {
    await vapp.addProject({ name: inputValue });
    setInputValue("");
    await refreshData(setAppData);
  };

  const onChange = ({ target: { value } }) => {
    setInputValue(value);
  };

  return (
    <div>
      <input type="text" value={inputValue} onChange={onChange} />
      <button onClick={addItem}>Add</button>
    </div>
  );
}

export default App;
