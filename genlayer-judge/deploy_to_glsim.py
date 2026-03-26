"""Deploy hackathon_judge.py to GLSim via genlayer-py SDK."""
import json
from pathlib import Path
from genlayer_py import create_client, create_account

RPC_URL = "http://127.0.0.1:4000/api"

print("=== Deploying HackathonJudge to GLSim ===\n")

# Create client pointing to GLSim
client = create_client(endpoint=RPC_URL)
print(f"Connected. Chain ID: {client.chain_id}")

# Create deployer account  
account = create_account()
print(f"Deployer: {account.address}")

# Fund account on GLSim
try:
    client.fund_account(account.address, 10000000)
    print("Account funded on GLSim")
except Exception as e:
    print(f"Fund note: {e}")

# Read contract code
contract_path = Path("contracts/hackathon_judge.py")
contract_code = contract_path.read_bytes()
print(f"Contract size: {len(contract_code)} bytes")

# Deploy
print("\nDeploying contract...")
try:
    tx_hash = client.deploy_contract(
        code=contract_code,
        account=account,
        args=["hack-demo-001", "AI Agent Challenge", "Build an AI agent that can parse invoices from PDF files"],
    )
    print(f"Deploy tx hash: {tx_hash}")
    
    # Wait for receipt
    print("Waiting for confirmation...")
    receipt = client.wait_for_transaction_receipt(tx_hash)
    
    contract_address = receipt.get("data", {}).get("contract_address") or receipt.get("contractAddress")
    print(f"\n=== DEPLOYED ===")
    print(f"Contract Address: {contract_address}")
    print(f"Receipt: {json.dumps(receipt, indent=2, default=str)[:2000]}")
    
    # Read state
    if contract_address:
        print("\n--- Reading contract state ---")
        result = client.read_contract(
            address=contract_address,
            function_name="get_result",
            args=[],
        )
        print(f"get_result(): {result}")
        
        is_final = client.read_contract(
            address=contract_address, 
            function_name="is_finalized",
            args=[],
        )
        print(f"is_finalized(): {is_final}")

except Exception as e:
    print(f"Deploy error: {e}")
    import traceback
    traceback.print_exc()
