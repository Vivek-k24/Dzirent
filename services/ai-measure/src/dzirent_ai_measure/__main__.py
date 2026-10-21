"""Run on loopback only: python -m dzirent_ai_measure [--port 8310]."""

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="dzirent ai-measure (local/test only)")
    parser.add_argument("--port", type=int, default=8310)
    args = parser.parse_args()
    # The service is internal: it binds to 127.0.0.1 and is reached through the monolith proxy.
    uvicorn.run(
        "dzirent_ai_measure.app:create_app",
        factory=True,
        host="127.0.0.1",
        port=args.port,
        access_log=False,
    )


if __name__ == "__main__":
    main()
