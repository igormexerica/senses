"""Interface de linha de comando (v1).

Exemplos:
    python -m src.cli --transcricao reuniao.txt --data 2026-06-09 --out ata.md
    cat reuniao.txt | python -m src.cli --data 2026-06-09 --stdin --out ata.md --json ata.json
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # python-dotenv é opcional em runtime
    pass

from .ata import gerar_ata
from .render import render_markdown


def _ler_transcricao(args: argparse.Namespace) -> str:
    if args.stdin:
        return sys.stdin.read()
    if args.transcricao:
        return Path(args.transcricao).read_text(encoding="utf-8")
    raise SystemExit("Erro: informe --transcricao ARQUIVO ou --stdin.")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="ata-agent",
        description="Gera uma ata executiva a partir da transcrição de uma reunião.",
    )
    src = p.add_mutually_exclusive_group()
    src.add_argument("--transcricao", help="arquivo .txt/.md com a transcrição")
    src.add_argument(
        "--stdin", action="store_true", help="lê a transcrição da entrada padrão"
    )
    p.add_argument("--data", required=True, help="data da reunião (AAAA-MM-DD)")
    p.add_argument(
        "--participantes",
        help="lista separada por vírgula (opcional); senão, infere da transcrição",
    )
    p.add_argument("--out", help="arquivo .md de saída (default: stdout)")
    p.add_argument("--json", dest="json_out", help="também grava o JSON da ata neste arquivo")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    transcricao = _ler_transcricao(args)
    if not transcricao.strip():
        raise SystemExit("Erro: transcrição vazia.")

    participantes = (
        [x.strip() for x in args.participantes.split(",") if x.strip()]
        if args.participantes
        else None
    )

    try:
        ata = gerar_ata(transcricao, args.data, participantes)
    except Exception as e:  # falha de rede, API ou JSON inválido após retry
        raise SystemExit(
            "Erro: não foi possível gerar a ata (resposta do modelo inválida "
            f"após retry, ou falha de API). Detalhe: {e}"
        )
    markdown = render_markdown(ata)

    if args.out:
        Path(args.out).write_text(markdown, encoding="utf-8")
        print(f"Ata gravada em {args.out}", file=sys.stderr)
    else:
        print(markdown)

    if args.json_out:
        Path(args.json_out).write_text(
            ata.model_dump_json(indent=2), encoding="utf-8"
        )
        print(f"JSON gravado em {args.json_out}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
