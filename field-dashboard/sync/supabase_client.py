"""
supabase_client.py — Wrapper fino sobre a API REST do Supabase (PostgREST).

Usa a SERVICE_ROLE_KEY pra escrever. Chama as functions SQL do schema `field`
(upsert_cliente, upsert_os, etc) via endpoint /rest/v1/rpc/.
"""
from __future__ import annotations

import os
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger("supabase_client")


class SupabaseClient:
    def __init__(
        self,
        url: str | None = None,
        service_key: str | None = None,
        timeout: float = 30.0,
    ):
        self.url = (url or os.environ["SUPABASE_URL"]).rstrip("/")
        self.service_key = service_key or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self._client = httpx.Client(
            timeout=timeout,
            headers={
                "apikey": self.service_key,
                "Authorization": f"Bearer {self.service_key}",
                "Content-Type": "application/json",
                # Schema field exposto via header (PostgREST)
                "Accept-Profile": "field",
                "Content-Profile": "field",
            },
        )

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def rpc(self, fn: str, args: dict[str, Any]) -> Any:
        """Chama uma function via /rest/v1/rpc/{fn}."""
        url = f"{self.url}/rest/v1/rpc/{fn}"
        resp = self._client.post(url, json=args)
        resp.raise_for_status()
        if resp.text.strip():
            return resp.json()
        return None

    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def select(self, table_or_view: str, params: dict | None = None) -> list[dict]:
        """GET numa tabela ou view do schema field."""
        url = f"{self.url}/rest/v1/{table_or_view}"
        resp = self._client.get(url, params=params or {})
        resp.raise_for_status()
        return resp.json()

    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def insert(self, table: str, rows: list[dict], upsert: bool = False,
               on_conflict: str | None = None) -> Any:
        """POST direto numa tabela. `on_conflict` (coluna(s)) define o alvo do
        upsert quando merge-duplicates não deve usar a PK (ex.: avaliacoes.os_id)."""
        if not rows:
            return None
        url = f"{self.url}/rest/v1/{table}"
        headers = {}
        params = {}
        if upsert:
            headers["Prefer"] = "resolution=merge-duplicates"
        if on_conflict:
            params["on_conflict"] = on_conflict
        resp = self._client.post(url, json=rows, headers=headers, params=params)
        resp.raise_for_status()
        if resp.text.strip():
            return resp.json()
        return None

    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def delete(self, table: str, params: dict) -> None:
        """DELETE numa tabela com filtro PostgREST (ex.: {'os_id': 'eq.<uuid>'})."""
        url = f"{self.url}/rest/v1/{table}"
        resp = self._client.delete(url, params=params)
        resp.raise_for_status()
        return None

    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    def count(self, table: str, params: dict | None = None) -> int:
        """COUNT exato via header Content-Range (Prefer: count=exact). Aceita filtros."""
        url = f"{self.url}/rest/v1/{table}"
        p = dict(params or {})
        p["select"] = "id"
        p["limit"] = "1"
        resp = self._client.get(url, params=p, headers={"Prefer": "count=exact"})
        resp.raise_for_status()
        cr = resp.headers.get("content-range", "")
        return int(cr.rsplit("/", 1)[-1]) if "/" in cr and cr.rsplit("/", 1)[-1].isdigit() else 0

    # -----------------------------------------------------------------
    # Helpers de domínio — chamam as functions do 03-functions.sql
    # -----------------------------------------------------------------
    def upsert_cliente(self, codigo_field: str, nome: str,
                       data_inicio: str | None = None, ativo: bool = True) -> str:
        return self.rpc("upsert_cliente", {
            "p_codigo_field": codigo_field,
            "p_nome": nome,
            "p_data_inicio_contrato": data_inicio,
            "p_ativo": ativo,
        })

    def upsert_etiqueta(self, codigo_field: str, nome: str, escopo: str) -> str:
        return self.rpc("upsert_etiqueta", {
            "p_codigo_field": codigo_field,
            "p_nome": nome,
            "p_escopo": escopo,
        })

    def upsert_equipamento(self, codigo_field: str, cliente_codigo: str | None,
                           nome: str | None, modelo: str | None = None,
                           cor: str | None = None, numero: str | None = None,
                           location_codigo: str | None = None,
                           archived: bool = False) -> str:
        return self.rpc("upsert_equipamento", {
            "p_codigo_field": codigo_field,
            "p_cliente_codigo_field": cliente_codigo,
            "p_nome": nome,
            "p_modelo": modelo,
            "p_cor": cor,
            "p_numero": numero,
            "p_location_codigo": location_codigo,
            "p_archived": archived,
        })

    def upsert_os(self, codigo_field: str, cliente_codigo: str, tipo: str,
                  status: str, criada_em: str, concluida_em: str | None = None,
                  mes_referencia: str | None = None) -> str:
        return self.rpc("upsert_os", {
            "p_codigo_field": codigo_field,
            "p_cliente_codigo_field": cliente_codigo,
            "p_tipo": tipo,
            "p_status": status,
            "p_criada_em": criada_em,
            "p_concluida_em": concluida_em,
            "p_mes_referencia": mes_referencia,  # mês planejado (scheduling.date); null = usa criada_em
        })

    def registrar_sync(self, recurso: str, ultimo_updated_at: str | None,
                       registros: int, erro: str | None = None) -> None:
        self.rpc("registrar_sync", {
            "p_recurso": recurso,
            "p_ultimo_updated_at": ultimo_updated_at,
            "p_registros_processados": registros,
            "p_erro": erro,
        })

    def get_sync_state(self, recurso: str) -> dict | None:
        rows = self.select("sync_state", {"recurso": f"eq.{recurso}"})
        return rows[0] if rows else None
