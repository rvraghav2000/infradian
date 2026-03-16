"""
Infradian CLI — Unified command interface

Usage:
    infradian serve          # Start the API server
    infradian parse <file>   # Parse a tfstate into universal JSON
    infradian status         # Quick summary of the current graph
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path

import typer

app = typer.Typer(
    name="infradian",
    help="Executive Control Room for cloud infrastructure.",
    add_completion=False,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SAMPLE_PATH = PROJECT_ROOT / "sample_payload.json"
CONFIG_PATH = Path.home() / ".infradian" / "config.json"


@app.command()
def serve(
    port: int = typer.Option(8000, help="Port for the API server."),
    host: str = typer.Option("0.0.0.0", help="Host to bind to."),
    reload: bool = typer.Option(False, help="Enable auto-reload for development."),
) -> None:
    """Start the Infradian API server (uvicorn)."""
    typer.echo(f"🚀 Infradian Data Engine starting on http://{host}:{port}")
    typer.echo("   Press Ctrl+C to stop.\n")

    cmd = [
        sys.executable, "-m", "uvicorn",
        "app.main:app",
        "--host", host,
        "--port", str(port),
    ]
    if reload:
        cmd.append("--reload")

    try:
        subprocess.run(cmd, cwd=str(PROJECT_ROOT), check=True)
    except KeyboardInterrupt:
        typer.echo("\n👋 Infradian stopped.")


@app.command()
def parse(
    tfstate: Path = typer.Argument(..., help="Path to a terraform.tfstate file."),
    output: Path = typer.Option(None, "-o", "--output", help="Write JSON to file instead of stdout."),
    simulate: bool = typer.Option(True, help="Inject simulated load and CI/CD history."),
) -> None:
    """Parse a Terraform state file into Infradian's universal graph format."""
    if not tfstate.exists():
        typer.echo(f"❌ File not found: {tfstate}", err=True)
        raise typer.Exit(code=1)

    from .models import InfraGraph
    from parser import parse_tfstate, simulate_live_data

    typer.echo(f"📄 Parsing {tfstate.name}…")
    graph = parse_tfstate(str(tfstate))

    if simulate:
        graph = simulate_live_data(graph)
        typer.echo("🎲 Simulated telemetry injected.")

    # Validate round-trip
    validated = InfraGraph.model_validate(graph.model_dump(mode="json"))
    json_str = json.dumps(validated.model_dump(mode="json"), indent=2)

    if output:
        output.write_text(json_str, encoding="utf-8")
        typer.echo(f"✅ Wrote {len(validated.nodes)} nodes → {output}")
    else:
        typer.echo(json_str)


@app.command()
def configure(
    server: str = typer.Option(..., "--server", "-s", prompt="Server URL (e.g., http://localhost:8000)"),
    token: str = typer.Option(..., "--token", "-t", prompt="API Token", hide_input=True),
) -> None:
    """Save connection settings for the centralized Infradian deployment."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    config = {"server_url": server.rstrip("/"), "token": token}
    CONFIG_PATH.write_text(json.dumps(config, indent=2))
    typer.echo(f"✅ Configuration saved to {CONFIG_PATH}")


@app.command()
def report(
    tfstate: Path = typer.Argument(..., help="Path to a terraform.tfstate file."),
    simulate: bool = typer.Option(True, help="Inject simulated load and CI/CD history."),
) -> None:
    """Parse a Terraform state file and POST the graph to the central Infradian server."""
    if not CONFIG_PATH.exists():
        typer.echo("❌ Not configured. Run `infradian configure` first.", err=True)
        raise typer.Exit(code=1)

    if not tfstate.exists():
        typer.echo(f"❌ File not found: {tfstate}", err=True)
        raise typer.Exit(code=1)

    config = json.loads(CONFIG_PATH.read_text())
    server_url = config.get("server_url")
    token = config.get("token")

    if not server_url or not token:
        typer.echo("❌ Invalid configuration. Run `infradian configure` again.", err=True)
        raise typer.Exit(code=1)

    from parser import parse_tfstate, simulate_live_data
    from .models import InfraGraph

    typer.echo(f"📄 Parsing {tfstate.name}…")
    graph = parse_tfstate(str(tfstate))

    if simulate:
        graph = simulate_live_data(graph)

    validated = InfraGraph.model_validate(graph.model_dump(mode="json"))
    payload = json.dumps(validated.model_dump(mode="json")).encode("utf-8")

    endpoint = f"{server_url}/api/v1/graph"
    typer.echo(f"📡 Sending {len(validated.nodes)} nodes to {endpoint}…")

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            if response.status == 201:
                res_data = json.loads(response.read().decode())
                typer.echo(f"✅ Success! Ingested {res_data.get('nodes')} nodes.")
            else:
                typer.echo(f"⚠️ Unexpected status: {response.status}", err=True)
    except urllib.error.HTTPError as e:
        typer.echo(f"❌ Server Error: {e.code} - {e.read().decode('utf-8')}", err=True)
        raise typer.Exit(code=1)
    except urllib.error.URLError as e:
        typer.echo(f"❌ Connection Error: {e.reason}", err=True)
        raise typer.Exit(code=1)


@app.command()
def status() -> None:
    """Print a quick summary of the current infrastructure graph."""
    if not SAMPLE_PATH.exists():
        typer.echo("⚠️  No sample_payload.json found. Run `infradian parse` first.", err=True)
        raise typer.Exit(code=1)

    from .models import InfraGraph

    raw = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
    graph = InfraGraph.model_validate(raw)

    # Collect stats
    total = len(graph.nodes)
    hot = [n for n in graph.nodes if n.metrics.current_load > 0.8]
    failures = []
    for n in graph.nodes:
        for ev in n.history:
            if ev.status == "failure":
                failures.append((n.label, ev.message))

    type_counts: dict[str, int] = {}
    for n in graph.nodes:
        type_counts[n.type] = type_counts.get(n.type, 0) + 1

    # Print
    typer.echo("┌─────────────────────────────────────────┐")
    typer.echo("│       INFRADIAN · STATUS REPORT         │")
    typer.echo("└─────────────────────────────────────────┘")
    typer.echo(f"\n  📊 Nodes: {total}    Edges: {len(graph.edges)}")
    typer.echo(f"  🔥 Hot (>80%): {len(hot)}")

    if type_counts:
        typer.echo("\n  Resource breakdown:")
        for rtype, count in sorted(type_counts.items()):
            typer.echo(f"    • {rtype}: {count}")

    if hot:
        typer.echo("\n  ⚠️  Hot nodes:")
        for n in hot:
            pct = int(n.metrics.current_load * 100)
            typer.echo(f"    🔴 {n.label} ({n.id}) — {pct}%")

    if failures:
        typer.echo("\n  ❌ Recent failures:")
        for label, msg in failures[-5:]:
            typer.echo(f"    • {label}: {msg}")

    typer.echo("")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
