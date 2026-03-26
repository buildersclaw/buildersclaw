"""Full end-to-end test on GLSim: deploy, submit contenders, finalize, read winner."""
import json
from genlayer_py import create_client, create_account

RPC_URL = "http://127.0.0.1:4000/api"
CONTRACT_ADDR = "0x8c3f7d9f6dc3d031237ff30713ddf9fa1468fb75"

print("=== End-to-End Test on GLSim ===\n")

client = create_client(endpoint=RPC_URL)
account = create_account()
client.default_account = account.address
client.local_account = account

# 1. Read initial state
print("1. Reading initial state...")
result = client.read_contract(address=CONTRACT_ADDR, function_name="get_result", args=[])
print(f"   get_result(): {result}")

# 2. Submit contenders
print("\n2. Submitting contenders...")
contenders = [
    {
        "team_id": "team-alpha",
        "team_name": "AlphaBot",
        "repo_url": "https://github.com/alpha/invoice-parser",
        "repo_summary": "Full REST API with PDF parsing, 95% test coverage, deployed on Railway.",
        "gemini_score": 92,
        "gemini_feedback": "Excellent brief compliance. Clean code, comprehensive tests.",
    },
    {
        "team_id": "team-beta",
        "team_name": "BetaAgent",
        "repo_url": "https://github.com/beta/parser",
        "repo_summary": "Basic parser, no tests, incomplete README.",
        "gemini_score": 45,
        "gemini_feedback": "Incomplete. Missing core features.",
    },
]

tx_hash = client.write_contract(
    address=CONTRACT_ADDR,
    function_name="submit_contenders",
    args=[json.dumps(contenders)],
    account=account,
)
print(f"   submit tx: {tx_hash}")
receipt = client.wait_for_transaction_receipt(tx_hash)
print(f"   status: {receipt.get('status')}")

# 3. Read contenders
print("\n3. Reading contenders...")
contenders_read = client.read_contract(address=CONTRACT_ADDR, function_name="get_contenders", args=[])
print(f"   get_contenders(): {json.dumps(contenders_read, indent=4)}")

# 4. Finalize (triggers LLM consensus)
print("\n4. Finalizing (LLM consensus)...")
tx_hash = client.write_contract(
    address=CONTRACT_ADDR,
    function_name="finalize",
    args=[],
    account=account,
)
print(f"   finalize tx: {tx_hash}")
receipt = client.wait_for_transaction_receipt(tx_hash)
print(f"   status: {receipt.get('status')}")

# 5. Read final result
print("\n5. Reading final result...")
result = client.read_contract(address=CONTRACT_ADDR, function_name="get_result", args=[])
print(f"   get_result(): {json.dumps(result, indent=4)}")

is_final = client.read_contract(address=CONTRACT_ADDR, function_name="is_finalized", args=[])
print(f"   is_finalized(): {is_final}")

print("\n=== END-TO-END TEST COMPLETE ===")
