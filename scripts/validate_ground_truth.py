"""Validate ClaimLens ground-truth JSON using the repository schema."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SCHEMA = ROOT / "datasets" / "schemas" / "ground-truth.schema.json"
DEFAULT_TARGET = ROOT / "datasets" / "golden"


def load_json(path: Path) -> object:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def semantic_errors(annotation: dict, annotation_path: Path) -> list[str]:
    errors: list[str] = []
    documents = annotation.get("documents", [])
    document_ids = {document.get("document_id") for document in documents}
    document_types = {document.get("type") for document in documents}
    required_types = {"CLAIM_FORM", "INVOICE", "RECEIPT"}
    if missing := required_types - document_types:
        errors.append(f"missing required document types: {', '.join(sorted(missing))}")

    for document in documents:
        path = annotation_path.parent / document.get("filename", "")
        if path.exists():
            actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            if actual_hash != document.get("sha256"):
                errors.append(f"documents.{document.get('document_id')}: SHA-256 does not match {path.name}")
        elif annotation_path.parent.name != "ground_truth":
            errors.append(f"documents.{document.get('document_id')}: file does not exist: {path.name}")

    for field_name, field in annotation.get("fields", {}).items():
        for index, source in enumerate(field.get("sources", [])):
            if source.get("document_id") not in document_ids:
                errors.append(f"fields.{field_name}.sources.{index}: unknown document_id")
            bbox = source.get("bbox", [])
            if len(bbox) == 4 and not (bbox[0] < bbox[2] and bbox[1] < bbox[3]):
                errors.append(f"fields.{field_name}.sources.{index}: bbox must have x_min < x_max and y_min < y_max")
    return errors


def validate(target: Path, schema_path: Path = DEFAULT_SCHEMA) -> int:
    try:
        import jsonschema
    except ImportError:
        print("Missing dependency: install jsonschema to validate annotations.", file=sys.stderr)
        return 2

    validator = jsonschema.Draft202012Validator(load_json(schema_path), format_checker=jsonschema.FormatChecker())
    files = sorted(target.rglob("*.json")) if target.is_dir() else [target]
    if not files:
        print(f"No JSON annotations found under {target}", file=sys.stderr)
        return 2

    failures = 0
    for path in files:
        annotation = load_json(path)
        errors = sorted(validator.iter_errors(annotation), key=lambda error: list(error.absolute_path))
        semantic = semantic_errors(annotation, path) if isinstance(annotation, dict) else []
        if errors or semantic:
            failures += 1
            print(f"FAIL {path}")
            for error in errors:
                location = ".".join(str(part) for part in error.absolute_path) or "<root>"
                print(f"  {location}: {error.message}")
            for error in semantic:
                print(f"  {error}")
        else:
            print(f"PASS {path}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", nargs="?", type=Path, default=DEFAULT_TARGET)
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    args = parser.parse_args()
    return validate(args.target, args.schema)


if __name__ == "__main__":
    raise SystemExit(main())
