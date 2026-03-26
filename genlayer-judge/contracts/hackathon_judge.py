# { "Depends": "py-genlayer:latest" }

"""
HackathonJudge -- GenLayer Intelligent Contract

Validates the final hackathon decision on-chain via validator consensus.
Our backend (Gemini) pre-scores all submissions and discards the low ones.
The top contenders are sent here with their repo summaries.
GenLayer validators use LLM consensus to confirm the winner.

Flow:
  1. Backend calls submit_contenders() with top teams + repo summaries
  2. The contract uses gl.nondet.exec_prompt to evaluate
  3. Validators reach consensus via equivalence principle
  4. Winner is stored on-chain, verifiable by anyone
"""

import json
from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class Contender:
    team_id: str
    team_name: str
    repo_url: str
    repo_summary: str  # Truncated code/README, fits in 200k total
    gemini_score: u256  # Pre-score from our backend (0-100)
    gemini_feedback: str


@allow_storage
@dataclass
class JudgeResult:
    winner_team_id: str
    winner_team_name: str
    final_score: u256
    reasoning: str
    validated_at: str  # ISO timestamp from validator


class HackathonJudge(gl.Contract):
    # --- Storage ---
    hackathon_id: str
    hackathon_title: str
    hackathon_brief: str
    organizer: Address

    contenders: DynArray[Contender]
    result: TreeMap[str, JudgeResult]  # hackathon_id -> result
    finalized: bool

    def __init__(self, hackathon_id: str, title: str, brief: str):
        self.hackathon_id = hackathon_id
        self.hackathon_title = title
        self.hackathon_brief = brief
        self.organizer = gl.message.sender_address
        # contenders, result, and finalized are auto-initialized by storage:
        # DynArray -> [], TreeMap -> {}, bool -> False

    @gl.public.write
    def submit_contenders(self, contenders_json: str) -> None:
        """
        Called by the backend after Gemini pre-scoring.
        Receives the top contenders with their repo summaries.
        Only the organizer (deployer) can call this.
        """
        if gl.message.sender_address != self.organizer:
            raise Exception("Only the organizer can submit contenders")
        if self.finalized:
            raise Exception("Hackathon already finalized")

        data = json.loads(contenders_json)
        if not isinstance(data, list) or len(data) < 1:
            raise Exception("At least 1 contender required")
        if len(data) > 10:
            raise Exception("Maximum 10 contenders")

        # Clear existing contenders
        while len(self.contenders) > 0:
            self.contenders.pop()
        for c in data:
            self.contenders.append(Contender(
                team_id=str(c["team_id"]),
                team_name=str(c["team_name"]),
                repo_url=str(c.get("repo_url", "")),
                repo_summary=str(c.get("repo_summary", ""))[:50000],
                gemini_score=int(c.get("gemini_score", 0)),
                gemini_feedback=str(c.get("gemini_feedback", ""))[:2000],
            ))

    @gl.public.write
    def finalize(self) -> None:
        """
        Triggers the GenLayer validators to evaluate the contenders
        and reach consensus on the winner.
        Only the organizer can trigger this.
        """
        if gl.message.sender_address != self.organizer:
            raise Exception("Only the organizer can finalize")
        if self.finalized:
            raise Exception("Already finalized")
        if len(self.contenders) == 0:
            raise Exception("No contenders submitted")

        # Build the evaluation prompt with all contender data
        contender_blocks = []
        for i, c in enumerate(self.contenders):
            block = f"""
=== CONTENDER {i + 1}: {c.team_name} ===
Team ID: {c.team_id}
Repo: {c.repo_url}
Pre-score (Gemini): {c.gemini_score}/100
Pre-feedback: {c.gemini_feedback}

Repository Summary:
{c.repo_summary}
"""
            contender_blocks.append(block)

        contenders_text = "\n".join(contender_blocks)

        # Use equivalence principle -- all validators must agree
        def evaluate_winner() -> str:
            task = f"""You are a hackathon judge for BuildersClaw. You must pick the winner.

=== HACKATHON ===
Title: {self.hackathon_title}
Brief: {self.hackathon_brief}

=== CONTENDERS ===
{contenders_text}

=== INSTRUCTIONS ===
1. Read each contender's repo summary and pre-score
2. Evaluate which submission BEST solves the hackathon brief
3. The pre-score from Gemini is advisory -- you can disagree if the code tells a different story
4. Brief compliance is the most important criterion
5. Pick ONE winner

Respond ONLY in this JSON format:
{{
    "winner_team_id": "<team_id of the winner>",
    "winner_team_name": "<name>",
    "final_score": <0-100>,
    "reasoning": "<2-3 sentences explaining why this team won>"
}}
"""
            result = gl.nondet.exec_prompt(task, response_format="json")
            return json.dumps(result, sort_keys=True)

        result_json = json.loads(gl.eq_principle.strict_eq(evaluate_winner))

        self.result[self.hackathon_id] = JudgeResult(
            winner_team_id=str(result_json["winner_team_id"]),
            winner_team_name=str(result_json["winner_team_name"]),
            final_score=int(result_json.get("final_score", 0)),
            reasoning=str(result_json.get("reasoning", "")),
            validated_at="on-chain",
        )
        self.finalized = True

    # --- View methods ---

    @gl.public.view
    def get_result(self) -> dict:
        if not self.finalized:
            return {"finalized": False, "hackathon_id": self.hackathon_id}
        r = self.result[self.hackathon_id]
        return {
            "finalized": True,
            "hackathon_id": self.hackathon_id,
            "winner_team_id": r.winner_team_id,
            "winner_team_name": r.winner_team_name,
            "final_score": int(r.final_score),
            "reasoning": r.reasoning,
        }

    @gl.public.view
    def get_contenders(self) -> list:
        return [
            {
                "team_id": c.team_id,
                "team_name": c.team_name,
                "repo_url": c.repo_url,
                "gemini_score": int(c.gemini_score),
            }
            for c in self.contenders
        ]

    @gl.public.view
    def is_finalized(self) -> bool:
        return self.finalized
