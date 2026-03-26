import json


def test_deploy(direct_vm, direct_deploy, direct_alice):
    # Set sender before deploy so alice becomes the organizer
    direct_vm.sender = direct_alice
    contract = direct_deploy(
        "contracts/hackathon_judge.py",
        "hack-001", "Invoice Parser Challenge", "Build an API that parses PDF invoices",
    )
    result = contract.get_result()
    assert result["finalized"] is False
    assert result["hackathon_id"] == "hack-001"


def test_submit_contenders(direct_vm, direct_deploy, direct_alice):
    # Set sender before deploy so alice becomes the organizer
    direct_vm.sender = direct_alice
    contract = direct_deploy(
        "contracts/hackathon_judge.py",
        "hack-002", "Test Hackathon", "Build something cool",
    )

    contenders = [
        {
            "team_id": "team-1",
            "team_name": "Alpha Bot",
            "repo_url": "https://github.com/alpha/solution",
            "repo_summary": "## Alpha Solution\nFull REST API with tests and docs.",
            "gemini_score": 87,
            "gemini_feedback": "Strong implementation, good tests.",
        },
        {
            "team_id": "team-2",
            "team_name": "Beta Agent",
            "repo_url": "https://github.com/beta/solution",
            "repo_summary": "## Beta Solution\nBasic implementation, no tests.",
            "gemini_score": 62,
            "gemini_feedback": "Incomplete, missing tests.",
        },
    ]

    contract.submit_contenders(json.dumps(contenders))
    result = contract.get_contenders()
    assert len(result) == 2
    assert result[0]["team_name"] == "Alpha Bot"
    assert result[0]["gemini_score"] == 87
    assert result[1]["team_name"] == "Beta Agent"


def test_cannot_submit_when_finalized(direct_vm, direct_deploy, direct_alice):
    # Set sender before deploy so alice becomes the organizer
    direct_vm.sender = direct_alice
    contract = direct_deploy(
        "contracts/hackathon_judge.py",
        "hack-003", "Test", "Brief",
    )

    contenders = [
        {
            "team_id": "team-1",
            "team_name": "Solo",
            "repo_summary": "Good project",
            "gemini_score": 90,
            "gemini_feedback": "Great",
        }
    ]
    contract.submit_contenders(json.dumps(contenders))

    # Mock LLM for finalize
    direct_vm.mock_llm(
        r".*pick the winner.*",
        json.dumps({
            "winner_team_id": "team-1",
            "winner_team_name": "Solo",
            "final_score": 92,
            "reasoning": "Only contender but solid work.",
        }),
    )

    contract.finalize()
    assert contract.is_finalized() is True

    # Try to submit again -- should fail
    with direct_vm.expect_revert("Hackathon already finalized"):
        contract.submit_contenders(json.dumps(contenders))


def test_finalize_picks_winner(direct_vm, direct_deploy, direct_alice):
    # Set sender before deploy so alice becomes the organizer
    direct_vm.sender = direct_alice
    contract = direct_deploy(
        "contracts/hackathon_judge.py",
        "hack-004", "API Challenge", "Build an invoice parser API",
    )

    contenders = [
        {
            "team_id": "team-a",
            "team_name": "Parser Pro",
            "repo_url": "https://github.com/a/parser",
            "repo_summary": "Full REST API. Parses PDFs. Has 20 tests. Deployed on Railway.",
            "gemini_score": 91,
            "gemini_feedback": "Excellent brief compliance, clean code.",
        },
        {
            "team_id": "team-b",
            "team_name": "Quick Parse",
            "repo_url": "https://github.com/b/parse",
            "repo_summary": "Basic parser. No tests. README is sparse.",
            "gemini_score": 58,
            "gemini_feedback": "Incomplete, missing core features.",
        },
    ]
    contract.submit_contenders(json.dumps(contenders))

    # Mock the LLM to pick team-a
    direct_vm.mock_llm(
        r".*pick the winner.*",
        json.dumps({
            "winner_team_id": "team-a",
            "winner_team_name": "Parser Pro",
            "final_score": 93,
            "reasoning": "Parser Pro fully addresses the brief with tests and deployment.",
        }),
    )

    contract.finalize()

    result = contract.get_result()
    assert result["finalized"] is True
    assert result["winner_team_id"] == "team-a"
    assert result["winner_team_name"] == "Parser Pro"
    assert result["final_score"] == 93


def test_only_organizer_can_submit(direct_vm, direct_deploy, direct_alice, direct_bob):
    # Alice deploys and becomes the organizer
    direct_vm.sender = direct_alice
    contract = direct_deploy(
        "contracts/hackathon_judge.py",
        "hack-005", "Test", "Brief",
    )

    # Bob tries to submit -- should fail
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the organizer"):
        contract.submit_contenders(json.dumps([
            {"team_id": "t1", "team_name": "X", "repo_summary": "Y", "gemini_score": 50, "gemini_feedback": "Z"}
        ]))
