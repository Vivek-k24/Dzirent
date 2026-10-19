import json
import sys
from pathlib import Path

from .contract import create_contract_app


def render() -> str:
    return json.dumps(create_contract_app().openapi(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    target = Path(__file__).resolve().parents[4] / "contracts/openapi.json"
    content = render()
    if "--check" in sys.argv:
        if not target.exists() or target.read_text(encoding="utf-8") != content:
            raise SystemExit("OpenAPI drift: run pnpm contracts:generate")
        print("OpenAPI matches FastAPI declarations")
    else:
        target.write_text(content, encoding="utf-8")
        print("Wrote contracts/openapi.json")
