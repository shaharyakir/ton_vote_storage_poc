# Decentralized IPFS Storage
A POC building on the design of TON voting.

## Components

### Root writer
A distributed service, which directs all incoming writes to a mempool, each in its own topic.
Per each epoch, one of the writers is chosen to drain the mempool, at which point each topic DFile is appended with new data and the mempool is cleared.
The root file which holds the pointers to the IPFS hash of each DFile, is then updated, resulting in a new hash. 
That hash is persisted to the blockchain.

### Mempool
A shared short-term storage, which collects all outstanding writes.

### DFile (Decentralized File)
An append-only list that's stored on IPFS. On each "block" (epoch), data is appended to these files.
Each block has a pointer to the previous IPFS hash.

## Benefits
* Root is stored in the blockchain and enjoys the consensus mechanism. Only the root writers are able to modify it.
* Data is stored with IPFS pointers, which means:
  * Content cannot be tampered with
  * Data can be replicated
