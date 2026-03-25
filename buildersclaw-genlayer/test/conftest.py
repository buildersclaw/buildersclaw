"""
Patch gltest assertions to handle cloud studio receipt format.

The cloud studio nests leader_receipt inside consensus_data.rounds[]
instead of consensus_data.leader_receipt directly.
"""
import gltest.assertions as assertions


def _tx_execution_succeeded(result: dict) -> bool:
    cd = result.get("consensus_data", {})
    # Format 1: direct leader_receipt (localnet)
    lr = cd.get("leader_receipt")
    if lr and lr.get("execution_result") == "SUCCESS":
        return True
    # Format 2: nested inside rounds (cloud studio)
    for r in cd.get("rounds", []):
        lr = r.get("leader_receipt", {})
        if lr.get("execution_result") == "SUCCESS":
            return True
    return False


def _tx_execution_failed(result: dict) -> bool:
    return not _tx_execution_succeeded(result)


# Monkey-patch the module-level functions
assertions.tx_execution_succeeded = _tx_execution_succeeded
assertions.tx_execution_failed = _tx_execution_failed

# Also patch the local binding in gltest.glchain.contract (imported via `from ... import`)
import gltest.glchain.contract as _contract_mod
_contract_mod.tx_execution_failed = _tx_execution_failed

# Increase RPC timeout for cloud studio (default 5s is too low)
import genlayer_py.provider.provider as _provider_mod
import requests as _requests
from requests import HTTPError as _HTTPError
from genlayer_py.exceptions import GenLayerError as _GenLayerError
import time as _time


def _patched_make_request(self, method, params):
    payload = {
        "jsonrpc": "2.0",
        "id": int(_time.time() * 1000),
        "method": method,
        "params": params,
    }
    try:
        response = _requests.post(
            self.url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=60,
        )
    except _HTTPError as err:
        raise _GenLayerError(str(err)) from err

    if response.status_code != 200:
        raise _GenLayerError(response.text)
    return response.json()


_provider_mod.GenLayerProvider.make_request = _patched_make_request
