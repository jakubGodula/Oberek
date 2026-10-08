// Verifies @noble/post-quantum Falcon-512 vectors with solana-falcon512.
use solana_falcon512::{Falcon512Pubkey, Falcon512Signature};

fn bytes(v: &serde_json::Value) -> Vec<u8> {
    hex::decode(v.as_str().unwrap()).unwrap()
}

fn main() {
    let path = std::env::args().nth(1).expect("usage: check <vectors.json>");
    let data: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let pubkey = Falcon512Pubkey::try_from(&bytes(&data["pk"])[..]).unwrap();
    let prepared = pubkey.try_prepare_pubkey().unwrap();

    let (mut accepted, mut tampered_rejected, mut total) = (0, 0, 0);
    for v in data["vectors"].as_array().unwrap() {
        total += 1;
        let msg = bytes(&v["msg"]);
        let sig = Falcon512Signature::try_from(&bytes(&v["sig"])[..]).unwrap();
        let ok = sig.verify(&msg, &pubkey) && sig.verify_with_prepared(&msg, &prepared);
        if ok { accepted += 1 } else { println!("REJECTED valid {} sig", v["variant"]) }

        let mut wrong_msg = msg.clone();
        wrong_msg[0] ^= 1;
        if !sig.verify(&wrong_msg, &pubkey) { tampered_rejected += 1 }
    }
    println!("valid accepted: {accepted}/{total}, tampered rejected: {tampered_rejected}/{total}");
}
