"""Run Pipeline A on golden cases and write JSON plus Markdown results."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from experiments.pipeline_a.baseline import run  # noqa: E402

GOLDEN = ROOT / "datasets" / "golden"
RESULTS = ROOT / "datasets" / "results" / "pilot-pipeline-a"


def display(value: object) -> str:
    if isinstance(value, list):
        return "; ".join(str(item) for item in value)
    return "—" if value is None else str(value)


def score_case(case_directory: Path) -> dict[str, object]:
    truth = json.loads((case_directory / "ground_truth.json").read_text(encoding="utf-8"))
    prediction = run(case_directory)
    comparisons = []
    for field_name, truth_field in truth["fields"].items():
        expected = truth_field["value"]
        actual = prediction["fields"][field_name]["value"]
        correct = set(actual or []) == set(expected or []) if isinstance(expected, list) else actual == expected
        comparisons.append({"field": field_name, "expected": expected, "predicted": actual, "correct": correct, "method": prediction["fields"][field_name]["method"]})

    correct_count = sum(item["correct"] for item in comparisons)
    prediction["evaluation"] = {
        "correct_fields": correct_count,
        "total_fields": len(comparisons),
        "exact_match_accuracy": correct_count / len(comparisons),
        "comparisons": comparisons,
    }
    return prediction


def markdown_report(results: list[dict[str, object]]) -> str:
    total_correct = sum(result["evaluation"]["correct_fields"] for result in results)
    total_fields = sum(result["evaluation"]["total_fields"] for result in results)
    mean_latency = sum(result["processing_time_ms"] for result in results) / len(results)
    lines = [
        "# ClaimLens Pipeline A — Pilot Evaluation",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Summary",
        "",
        f"- Cases: {len(results)}",
        f"- Correct fields: {total_correct}/{total_fields}",
        f"- Exact-match accuracy: **{total_correct / total_fields:.1%}**",
        f"- Mean processing time: **{mean_latency:.3f} ms**",
        "- Dataset status: pilot only; this result is not a final performance claim.",
        "",
    ]
    for result in results:
        evaluation = result["evaluation"]
        lines.extend([
            f"## {result['case_id']}",
            "",
            f"Accuracy: {evaluation['correct_fields']}/{evaluation['total_fields']} ({evaluation['exact_match_accuracy']:.1%}); latency: {result['processing_time_ms']:.3f} ms.",
            "",
            "| Field | Ground truth | Pipeline A | Result | Method |",
            "|---|---|---|:---:|---|",
        ])
        for item in evaluation["comparisons"]:
            mark = "PASS" if item["correct"] else "FAIL"
            lines.append(f"| `{item['field']}` | {display(item['expected'])} | {display(item['predicted'])} | {mark} | `{item['method']}` |")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    cases = sorted(path.parent for path in GOLDEN.glob("*/ground_truth.json"))
    if not cases:
        print(f"No golden cases found under {GOLDEN}", file=sys.stderr)
        return 2
    results = [score_case(case) for case in cases]
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "results.json").write_text(json.dumps({"pipeline": "A", "results": results}, indent=2) + "\n", encoding="utf-8")
    report = markdown_report(results)
    (RESULTS / "report.md").write_text(report + "\n", encoding="utf-8")
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
