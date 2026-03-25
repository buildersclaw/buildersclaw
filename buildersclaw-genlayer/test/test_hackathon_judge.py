import json

from gltest import get_contract_factory, default_account, accounts
from gltest.helpers import load_fixture


# ─── Assertion helpers (compatible with cloud studio receipt format) ───

def tx_execution_succeeded(result: dict) -> bool:
    """Check if a tx succeeded, handling both receipt formats."""
    cd = result.get("consensus_data", {})
    # Format 1: direct leader_receipt
    lr = cd.get("leader_receipt")
    if lr and lr.get("execution_result") == "SUCCESS":
        return True
    # Format 2: nested inside rounds
    rounds = cd.get("rounds", [])
    for r in rounds:
        lr = r.get("leader_receipt", {})
        if lr.get("execution_result") == "SUCCESS":
            return True
    return False


def tx_execution_failed(result: dict) -> bool:
    return not tx_execution_succeeded(result)


# ─── Fixtures ───

HACKATHON_ID = "hack-001"
HACKATHON_TITLE = "Build the Best AI Agent"
HACKATHON_BRIEF = "Build an AI agent that can autonomously complete software tasks."

CONTENDERS_JSON = json.dumps([
    {
        "team_id": "team-alpha",
        "team_name": "Alpha Builders",
        "repo_url": "https://github.com/alpha/repo",
        "repo_summary": "A comprehensive AI agent with tool use, planning, and execution capabilities. Handles complex multi-step tasks.",
        "gemini_score": 85,
        "gemini_feedback": "Strong architecture, good test coverage, excellent brief compliance.",
    },
    {
        "team_id": "team-beta",
        "team_name": "Beta Coders",
        "repo_url": "https://github.com/beta/repo",
        "repo_summary": "Simple CLI agent that runs prompts. Basic functionality only.",
        "gemini_score": 60,
        "gemini_feedback": "Minimal implementation, lacks depth and polish.",
    },
    {
        "team_id": "team-gamma",
        "team_name": "Gamma Squad",
        "repo_url": "https://github.com/gamma/repo",
        "repo_summary": "AI agent with web browsing, code generation, and iterative refinement. Well-documented.",
        "gemini_score": 78,
        "gemini_feedback": "Good feature set but some rough edges in error handling.",
    },
])


def deploy_judge():
    factory = get_contract_factory("HackathonJudge")
    contract = factory.deploy(args=[HACKATHON_ID, HACKATHON_TITLE, HACKATHON_BRIEF])

    # Verify initial state
    info = contract.get_hackathon_info(args=[])
    assert info["hackathon_id"] == HACKATHON_ID
    assert info["title"] == HACKATHON_TITLE
    assert info["brief"] == HACKATHON_BRIEF
    assert info["contenders_submitted"] is False
    assert info["finalized"] is False

    result = contract.get_result(args=[])
    assert result["finalized"] is False
    assert result["winner_team_id"] == ""

    contenders = contract.get_contenders(args=[])
    assert contenders == []

    return contract


# ─── Deployment & View Tests ───

def test_deploy_and_initial_state():
    """Contract deploys with correct initial state."""
    load_fixture(deploy_judge)


def test_get_hackathon_info():
    """get_hackathon_info returns correct metadata."""
    contract = load_fixture(deploy_judge)
    info = contract.get_hackathon_info(args=[])
    assert info["hackathon_id"] == HACKATHON_ID
    assert info["title"] == HACKATHON_TITLE
    assert info["brief"] == HACKATHON_BRIEF
    assert info["contenders_submitted"] is False
    assert info["finalized"] is False


# ─── Submit Contenders Tests ───

def test_submit_contenders_success():
    """Owner can submit contenders successfully."""
    contract = load_fixture(deploy_judge)

    result = contract.submit_contenders(args=[CONTENDERS_JSON])
    assert tx_execution_succeeded(result)

    # Verify contenders were stored
    contenders = contract.get_contenders(args=[])
    assert len(contenders) == 3

    team_ids = [c["team_id"] for c in contenders]
    assert "team-alpha" in team_ids
    assert "team-beta" in team_ids
    assert "team-gamma" in team_ids

    # Verify hackathon info updated
    info = contract.get_hackathon_info(args=[])
    assert info["contenders_submitted"] is True


def test_submit_contenders_non_owner_rejected():
    """Non-owner cannot submit contenders."""
    contract = load_fixture(deploy_judge)

    # Connect with a different account
    other_account = accounts[1]
    contract_as_other = contract.connect(other_account)

    result = contract_as_other.submit_contenders(args=[CONTENDERS_JSON])
    assert tx_execution_failed(result)


def test_submit_contenders_after_finalized_rejected():
    """Cannot submit contenders after judging is finalized."""
    contract = load_fixture(deploy_judge)

    # Submit and finalize first
    submit_result = contract.submit_contenders(args=[CONTENDERS_JSON])
    assert tx_execution_succeeded(submit_result)

    finalize_result = contract.finalize(
        args=[],
        wait_interval=10000,
        wait_retries=30,
    )
    assert tx_execution_succeeded(finalize_result)

    # Try submitting again — should fail
    result = contract.submit_contenders(args=[CONTENDERS_JSON])
    assert tx_execution_failed(result)


# ─── Finalize Tests ───

def test_finalize_without_contenders_rejected():
    """Cannot finalize before submitting contenders."""
    contract = load_fixture(deploy_judge)

    result = contract.finalize(args=[])
    assert tx_execution_failed(result)


def test_finalize_non_owner_rejected():
    """Non-owner cannot trigger finalization."""
    contract = load_fixture(deploy_judge)

    submit_result = contract.submit_contenders(args=[CONTENDERS_JSON])
    assert tx_execution_succeeded(submit_result)

    other_account = accounts[1]
    contract_as_other = contract.connect(other_account)

    result = contract_as_other.finalize(args=[])
    assert tx_execution_failed(result)


def test_finalize_picks_winner():
    """Finalize triggers LLM consensus and picks a valid winner."""
    contract = load_fixture(deploy_judge)

    submit_result = contract.submit_contenders(args=[CONTENDERS_JSON])
    assert tx_execution_succeeded(submit_result)

    finalize_result = contract.finalize(
        args=[],
        wait_interval=10000,
        wait_retries=30,
    )
    assert tx_execution_succeeded(finalize_result)

    # Verify result
    result = contract.get_result(args=[])
    assert result["finalized"] is True
    assert result["hackathon_id"] == HACKATHON_ID
    assert result["winner_team_id"] in ["team-alpha", "team-beta", "team-gamma"]
    assert result["winner_team_name"] != ""
    assert result["final_score"] > 0
    assert result["final_score"] <= 100
    assert len(result["reasoning"]) > 0

    # Verify hackathon info reflects finalization
    info = contract.get_hackathon_info(args=[])
    assert info["finalized"] is True


def test_double_finalize_rejected():
    """Cannot finalize twice."""
    contract = load_fixture(deploy_judge)

    submit_result = contract.submit_contenders(args=[CONTENDERS_JSON])
    assert tx_execution_succeeded(submit_result)

    first_finalize = contract.finalize(
        args=[],
        wait_interval=10000,
        wait_retries=30,
    )
    assert tx_execution_succeeded(first_finalize)

    second_finalize = contract.finalize(args=[])
    assert tx_execution_failed(second_finalize)


# ─── View Method Tests After Full Flow ───

def test_get_contenders_returns_stored_data():
    """get_contenders returns all submitted contender data."""
    contract = load_fixture(deploy_judge)

    submit_result = contract.submit_contenders(args=[CONTENDERS_JSON])
    assert tx_execution_succeeded(submit_result)

    contenders = contract.get_contenders(args=[])
    assert len(contenders) == 3

    # Find alpha and check fields
    alpha = next(c for c in contenders if c["team_id"] == "team-alpha")
    assert alpha["team_name"] == "Alpha Builders"
    assert alpha["repo_url"] == "https://github.com/alpha/repo"
    assert alpha["gemini_score"] == 85


def test_get_result_before_finalize():
    """get_result returns empty result before finalization."""
    contract = load_fixture(deploy_judge)

    result = contract.get_result(args=[])
    assert result["finalized"] is False
    assert result["winner_team_id"] == ""
    assert result["winner_team_name"] == ""
    assert result["final_score"] == 0
    assert result["reasoning"] == ""
