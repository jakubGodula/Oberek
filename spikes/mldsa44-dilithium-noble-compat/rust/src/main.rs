// Verifies @noble/post-quantum ML-DSA-44 vectors with solana-ml-dsa (compact and prepared keys).
use solana_ml_dsa::ml_dsa_44::{PreparedVerifyingKey, Signature, VerifyingKey};

const WRONG_CONTEXT: &[u8] = b"wrong-context";

struct Vector {
    msg: Vec<u8>,
    context: Vec<u8>,
    sig: Vec<u8>,
}

fn bytes(v: &serde_json::Value) -> Vec<u8> {
    hex::decode(v.as_str().unwrap()).unwrap()
}

fn verifies(key: &VerifyingKey, prepared: &PreparedVerifyingKey, msg: &[u8], context: &[u8], sig: &[u8]) -> bool {
    let sig = Signature::ref_from_bytes(sig).unwrap();
    let compact = key.verify_with_context(msg, context, sig).is_ok();
    let with_prepared = prepared.verify_with_context(msg, context, sig).is_ok();
    assert_eq!(compact, with_prepared, "compact and prepared keys disagree");
    compact
}

fn flipped(bytes: &[u8], index: usize) -> Vec<u8> {
    let mut out = bytes.to_vec();
    out[index] ^= 1;
    out
}

fn main() {
    let path = std::env::args().nth(1).expect("usage: check <vectors.json>");
    let data: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let pk = bytes(&data["pk"]);
    let key = VerifyingKey::ref_from_bytes(&pk).unwrap();
    let prepared = key.prepare();
    let vectors: Vec<Vector> = data["vectors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| Vector { msg: bytes(&v["msg"]), context: bytes(&v["context"]), sig: bytes(&v["sig"]) })
        .collect();

    let check = |name: &str, should_verify: bool, run: &dyn Fn(&Vector) -> bool| {
        let passed = vectors.iter().filter(|v| run(v) == should_verify).count();
        println!("{name}: {passed}/{}", vectors.len());
    };
    check("valid accepted", true, &|v| verifies(key, &prepared, &v.msg, &v.context, &v.sig));
    check("tampered message rejected", false, &|v| {
        verifies(key, &prepared, &flipped(&v.msg, 0), &v.context, &v.sig)
    });
    check("tampered signature rejected", false, &|v| {
        verifies(key, &prepared, &v.msg, &v.context, &flipped(&v.sig, v.sig.len() / 2))
    });
    check("wrong context rejected", false, &|v| verifies(key, &prepared, &v.msg, WRONG_CONTEXT, &v.sig));
}
