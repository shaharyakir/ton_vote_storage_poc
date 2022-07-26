// @ts-nocheck

import React, { useEffect, useState } from "react";
import logo from "./logo.svg";
import "./App.css";

import {
  IPFSProvider,
  IPFSHash,
  BChainProvider,
  VotingApp,
  IPFSClusterProvider,
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

// class IndexedDBIPFSProvider implements IPFSProvider {
//   // const myPromise = new Promise((resolve))

//   constructor() {
//     const openReq = window.indexedDB.open("MyTestDatabase4", 2);
//     openReq.onupgradeneeded = () => {
//       this.db = openReq.result;
//       this.db.createObjectStore("ipfszzz", { keyPath: "id" });
//     };
//   }

//   async write(data: string): Promise<IPFSHash> {
//     const h = (await of(data)) as IPFSHash;
//     const hashes = transaction.objectStore("ipfszzz"); // (2)
//     hashes.add({id: h, data: data})
//     // localStorage.setItem(h, data);
//     return h;
//   }
//   read(hash: IPFSHash): Promise<string> {
//     // if (hash === "ROOT_HASH123") return '{"data": {}, "prev": null}';
//     // return localStorage.getItem(hash);

//     return '{"data": {}, "prev": null}';
//   }
// }

class DummyIPFSProvider implements IPFSProvider {
  async write(data: string): Promise<IPFSHash> {
    const h = (await of(data)) as IPFSHash;
    localStorage.setItem(h, data);
    return h;
  }
  read(hash: IPFSHash): Promise<string> {
    if (hash === "ROOT_HASH123") return '{"data": {}, "prev": null}';

    return localStorage.getItem(hash);
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

// http://3.16.42.100/

const vapp = new VotingApp(
  // new DummyIPFSProvider(),
  new IPFSClusterProvider({
    pinApi: "http://3.16.42.100:9097",
    rpcApi: "http://3.16.42.100:9094",
    gw: "http://3.16.42.100/ipfs",
  }),
  new DummyBChainProvider(),
  "DUMMY"
);

function App() {
  return (
    <RecoilRoot>
      <StorageInfo />
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

async function addData() {
  const someArr = new Array(3).fill(1);
  const projects = someArr.map((x) => ({ name: `Proj${Math.random()}` }));

  let promises = projects.map((p) => vapp.addProject(p));

  const proposals = projects
    .map(({ name }) =>
      someArr.map((_) => [name, { name: `Proposal${Math.random()}` }])
    )
    .flat();

  promises = [
    ...promises,
    proposals.map(([proj, proposal]) => vapp.submitProposal(proj, proposal)),
  ];

  promises = [...promises, proposals.map(([proj, proposal]) => someArr.map(_ => vapp.submitVote(proj, proposal.name, {
    sig: `${Math.random() * 1000}${Date.now()}`,
    vote: !!Math.random(),
  }))).flat()];

  await Promise.all(promises)
}

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
      <button onClick={() => refreshData(setVotingDB)}>Refresh data</button>
      <button onClick={() => addData()}>Add data</button>
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
    data?.projects?.[appState.selectedProject]?.[appState.selectedProposal]
      ?.votes ?? [];
  return (
    <div style={{ flexBasis: "20%" }}>
      <Vote />

      <h2>Votes ({votes.length})</h2>
      {votes.slice(0, 1000).map((vote) => (
        <div key={vote.sig}>
          {vote.sig} {`${vote.vote ? "✅" : "🔻"}`}
        </div>
      ))}
    </div>
  );
}

function Vote() {
  const [okToSet, setOkToSet] = useState(true);
  const [_, setAppData] = useRecoilState(votingDB);
  const [appState, setAppState] = useRecoilState(appStateAtom);

  useEffect(() => {
    const interval = setInterval(async () => {
      // await vote(false);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const vote = async (isIt: boolean) => {
    // if (!okToSet) return;
    // setOkToSet(false);

    new Array(10).fill(1).map((_) => {
      vapp.submitVote(appState.selectedProject, appState.selectedProposal, {
        sig: `${Math.random() * 1000}${Date.now()}`,
        vote: isIt,
      });
    });

    // await vapp.readData();
    // await refreshData(setAppData);

    // setOkToSet(true);
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

const storageInfoAtom = atom({
  key: "storageInfo", // unique ID (with respect to other atoms/selectors)
  default: {}, // default value (aka initial value)
});

function StorageInfo() {
  const [storageInfo, setStorageInfo] = useRecoilState(storageInfoAtom);

  useEffect(() => {
    setInterval(async () => {
      const sInfo = await vapp._rootWriter.debugDump();
      setStorageInfo(sInfo);
    }, 100);
  }, [setStorageInfo]);

  return <div>{JSON.stringify(storageInfo)}</div>;
}

export default App;
