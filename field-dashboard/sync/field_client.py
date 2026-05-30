"""
field_client.py — Wrapper da API REST do Field Control.

Cobre autenticação (X-Api-Key), paginação (limit/offset), rate limit com
backoff exponencial, e os endpoints que o dashboard consome.

Doc oficial: https://developers.fieldcontrol.com.br/
"""
from __future__ import annotations

import os
import logging
from typing import Iterator, Any

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

logger = logging.getLogger("field_client")


class FieldClient:
    """Cliente da API do Field Control."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        page_size: int = 100,
        timeout: float = 30.0,
    ):
        self.api_key = api_key or os.environ["FIELD_API_KEY"]
        self.base_url = (base_url or os.environ.get(
            "FIELD_BASE_URL", "https://carchost.fieldcontrol.com.br"
        )).rstrip("/")
        self.page_size = min(page_size, 100)  # API limita a 100
        self._client = httpx.Client(
            timeout=timeout,
            headers={
                "X-Api-Key": self.api_key,
                "Accept": "application/json",
            },
        )

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # -----------------------------------------------------------------
    # Núcleo HTTP com retry
    # -----------------------------------------------------------------
    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        wait=wait_exponential(multiplier=1, min=2, max=60),
        stop=stop_after_attempt(5),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
    def _get(self, path: str, params: dict | None = None) -> dict[str, Any]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        resp = self._client.get(url, params=params or {})

        # 429 = rate limit. Levanta pra acionar o retry/backoff.
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After", "?")
            logger.warning("Rate limit (429). Retry-After=%s", retry_after)
            resp.raise_for_status()

        resp.raise_for_status()
        return resp.json()

    # -----------------------------------------------------------------
    # Paginação genérica
    # -----------------------------------------------------------------
    def _paginate(self, path: str, params: dict | None = None) -> Iterator[dict]:
        """
        Itera todos os registros de um endpoint de lista.
        A API retorna {"items": [...], "totalCount": N}.
        """
        params = dict(params or {})
        offset = 0
        total = None
        seen = 0

        while True:
            params["limit"] = self.page_size
            params["offset"] = offset
            data = self._get(path, params)

            items = data.get("items", [])
            if total is None:
                total = data.get("totalCount", len(items))

            for item in items:
                yield item
                seen += 1

            if not items or seen >= (total or 0):
                break
            offset += self.page_size

    # -----------------------------------------------------------------
    # Endpoints — Clientes
    # -----------------------------------------------------------------
    def listar_clientes(self) -> Iterator[dict]:
        """GET /customers"""
        yield from self._paginate("customers")

    def listar_etiquetas_cliente(self, customer_id: str) -> list[dict]:
        """GET /customers/{id}/labels — etiquetas de um cliente específico."""
        data = self._get(f"customers/{customer_id}/labels")
        return data.get("items", [])

    # -----------------------------------------------------------------
    # Endpoints — Etiquetas (global) e Serviços (tipos de OS)
    # -----------------------------------------------------------------
    def listar_etiquetas(self) -> Iterator[dict]:
        """GET /labels — todas as etiquetas (campos: id, name, color, type)."""
        yield from self._paginate("labels")

    def listar_servicos(self) -> list[dict]:
        """GET /services — catálogo de tipos de OS (id, name, duration, archived).

        O tipo de uma OS vem daqui via order.service.id (não existe order.type)."""
        return list(self._paginate("services"))

    # -----------------------------------------------------------------
    # Endpoints — Equipamentos (inventário de máquinas)
    # -----------------------------------------------------------------
    def listar_equipamentos(self) -> Iterator[dict]:
        """GET /equipments — máquinas instaladas (campos: id, name, number,
        type{id}, customer{id}, location{id}, archived, ...).

        Sem filtro server-side por cliente (?customer= é ignorado) e sem
        /customers/{id}/equipments → varrer tudo e agrupar por customer.id.
        `updatedAt` vem null → não dá pra incremental por data."""
        yield from self._paginate("equipments")

    # -----------------------------------------------------------------
    # Endpoints — Ordens de Serviço
    # -----------------------------------------------------------------
    def listar_os(self, since: str | None = None) -> Iterator[dict]:
        """
        GET /orders — ordens de serviço.
        `since` (ISO date) filtra por data se a API suportar; caso contrário
        a filtragem é feita do nosso lado no sync.
        """
        params = {}
        if since:
            params["updatedAtFrom"] = since  # ajustar conforme nome real do filtro
        yield from self._paginate("orders", params)

    def listar_etiquetas_os(self, order_id: str) -> list[dict]:
        """GET /orders/{id}/labels"""
        data = self._get(f"orders/{order_id}/labels")
        return data.get("items", [])

    # -----------------------------------------------------------------
    # Endpoints — Formulários (código de rastreio mora aqui)
    # -----------------------------------------------------------------
    def listar_formularios_os(self, order_id: str) -> list[dict]:
        """GET /orders/{id}/forms — só METADADOS (id, name, archived, createdAt).

        As respostas NÃO vêm aqui — buscar com recuperar_formulario_os()."""
        data = self._get(f"orders/{order_id}/forms")
        return data.get("items", [])

    def recuperar_formulario_os(self, order_id: str, form_id: str) -> dict:
        """GET /orders/{oid}/forms/{fid} — respostas detalhadas.

        Retorna {questions: [{title, answer, type, ...}], score}. O /forms/{id}
        plano dá 404; as respostas só existem aninhadas sob a OS.
        O código de rastreio do refil é o form name 'Código de rastreio.',
        questão title 'Nº do código:'."""
        return self._get(f"orders/{order_id}/forms/{form_id}")

    # -----------------------------------------------------------------
    # Endpoints — Tasks (STATUS real da execução mora aqui, não na order)
    # -----------------------------------------------------------------
    def listar_tasks_os(self, order_id: str) -> list[dict]:
        """GET /orders/{id}/tasks — tarefas da OS (normalmente 1 por order).

        A task carrega status='done'/..., completedAt, startedAt, employee e
        ratingLink. É a fonte do status/conclusão real (a order não tem status)."""
        data = self._get(f"orders/{order_id}/tasks")
        return data.get("items", [])

    def recuperar_task(self, task_id: str) -> dict:
        """GET /tasks/{id} — detalhe da task; tem order{id}. A avaliação (/ratings)
        gruda na task, então é por aqui que se liga rating -> order."""
        return self._get(f"tasks/{task_id}")

    # -----------------------------------------------------------------
    # Endpoints — Avaliações
    # -----------------------------------------------------------------
    def listar_avaliacoes(self) -> Iterator[dict]:
        """GET /ratings — campos: stars, comment, createdAt, task{id}. Sem id próprio.

        task.id é id de TASK (não de order): resolver via recuperar_task()."""
        yield from self._paginate("ratings")

    # -----------------------------------------------------------------
    # Endpoints — Comentários
    # -----------------------------------------------------------------
    def listar_comentarios_os(self, order_id: str) -> list[dict]:
        """GET /orders/{id}/comments"""
        data = self._get(f"orders/{order_id}/comments")
        return data.get("items", [])


# Paths CONFIRMADOS contra a API real (ver DESCOBERTAS-API.md):
#   /customers, /orders, /services, /labels, /ratings, /tasks/{id}, /equipments,
#   /customers/{id}/labels, /orders/{id}/labels, /orders/{id}/comments,
#   /orders/{id}/tasks (STATUS real), /orders/{id}/forms (metadados),
#   /orders/{oid}/forms/{fid} (respostas).
# NÃO existem: /tags, /reviews, /forms/{id}, /orders/{id}/activities,
#   /equipments?customer= (filtro ignorado), /customers/{id}/equipments (404).
