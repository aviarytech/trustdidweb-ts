import * as ed from '@noble/ed25519';
import { base58btc } from "multiformats/bases/base58";
import { bytesToHex, createSCID, deriveHash } from "./utils";
import { canonicalize } from 'json-canonicalize';
import { createHash } from 'node:crypto';

export const keyIsAuthorized = (key: string, updateKeys: string[]) => {
  if (process.env.IGNORE_ASSERTION_KEY_IS_AUTHORIZED) return true;
  return updateKeys.includes(key);
}

export const documentStateIsValid = async (doc: any, proofs: any[], updateKeys: string[]) => {
  if (process.env.IGNORE_ASSERTION_DOCUMENT_STATE_IS_VALID) return true;
  let i = 0;
  while(i < proofs.length) {
    const proof = proofs[i];
    if (!keyIsAuthorized(proof.verificationMethod.split('#')[0].split('did:key:').at(-1), updateKeys)) {
      throw new Error(`key ${proof.verificationMethod} is not authorized to update.`)
    }
    if (proof.type !== 'DataIntegrityProof') {
      throw new Error(`Unknown proof type ${proof.type}`);
    }
    if (proof.proofPurpose !== 'authentication') {
      throw new Error(`Unknown proof purpose] ${proof.proofPurpose}`);
    }
    if (proof.cryptosuite !== 'eddsa-jcs-2022') {
      throw new Error(`Unknown cryptosuite ${proof.cryptosuite}`);
    }
    const publicKey = base58btc.decode(proof.verificationMethod.split('did:key:')[1].split('#')[0]);
    if (publicKey[0] !== 237 || publicKey[1] !== 1) {
      throw new Error(`multiKey doesn't include ed25519 header (0xed01)`)
    }
    const {proofValue, ...restProof} = proof;
    const sig = base58btc.decode(proofValue);
    const dataHash = createHash('sha256').update(canonicalize(doc)).digest();
    const proofHash = createHash('sha256').update(canonicalize(restProof)).digest();
    const input = Buffer.concat([dataHash, proofHash]);

    const verified = await ed.verifyAsync(
      bytesToHex(sig),
      bytesToHex(input),
      bytesToHex(publicKey.slice(2))
    );
    if (!verified) {
      return false;
    }
    i++;
  }
  return true;
}

export const hashChainValid = (derivedHash: string, logEntryHash: string) => {
  if (process.env.IGNORE_ASSERTION_HASH_CHAIN_IS_VALID) return true;
  return derivedHash === logEntryHash;
}

export const newKeysAreValid = (updateKeys: string[], previousNextKeyHashes: string[], nextKeyHashes: string[], previousPrerotation: boolean, prerotation: boolean) => {
  if (process.env.IGNORE_ASSERTION_NEW_KEYS_ARE_VALID) return true;
  if (prerotation && nextKeyHashes.length === 0) {
    throw new Error(`nextKeyHashes are required if prerotation enabled`);
  }
  if(previousPrerotation) {
    const inNextKeyHashes = updateKeys.reduce((result, key) => {
      const hashedKey = deriveHash(key);
      return result && previousNextKeyHashes.includes(hashedKey);
    }, true);
    if (!inNextKeyHashes) {
      throw new Error(`invalid updateKeys ${updateKeys}`);
    }
  }
  return true;
}

export const scidIsFromHash = async (scid: string, hash: string) => {
  if (process.env.IGNORE_ASSERTION_SCID_IS_FROM_HASH) return true;
  return scid === await createSCID(hash);
}
