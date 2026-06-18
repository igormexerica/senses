#!/usr/bin/env bash
# Reaproveita o access token Nuvemshop do carrinho-abandonado (mesmo app 32954,
# loja 6253537) e grava NUVEMSHOP_* no .env do senses-ecom-bi.
# Seguro: testa cada candidato na API e só grava o que devolve 200 (token válido).
# NUNCA imprime o token. Rode:  bash deploy/wire-nuvemshop.sh
set -euo pipefail

SRC=/root/senses/carrinho-abandonado
DEST_DIR=/root/senses/senses-ecom-bi
STORE=6253537
UA="SensesBI (contato@gruposenses.com.br)"
# Opcional: exporte CLIENT_SECRET antes de rodar p/ excluí-lo dos candidatos.
# (NÃO versionar o valor real aqui — a validação na API já garante o token certo.)
SECRET_KNOWN="${CLIENT_SECRET:-__none__}"

[ -d "$SRC" ] || { echo "✗ $SRC não existe"; exit 1; }

# Base da API: tenta detectar no carrinho; senão tenta as comuns.
mapfile -t BASES < <(grep -rhoE "https://api\.(nuvemshop\.com\.br|nuvemshop\.com|tiendanube\.com)/v1" "$SRC" 2>/dev/null | sort -u)
[ ${#BASES[@]} -eq 0 ] && BASES=(https://api.nuvemshop.com.br/v1 https://api.nuvemshop.com/v1 https://api.tiendanube.com/v1)

# Candidatos a token: strings alfanum de 30-64 chars no config do carrinho, menos o client_secret.
mapfile -t CANDS < <(grep -rhoE "[A-Za-z0-9]{30,64}" "$SRC" 2>/dev/null | sort -u | grep -vx "$SECRET_KNOWN" | head -40)
[ ${#CANDS[@]} -eq 0 ] && { echo "✗ nenhum candidato a token no $SRC. Me diga o arquivo/variável."; exit 1; }

echo "→ testando ${#CANDS[@]} candidato(s) contra ${#BASES[@]} base(s)…"
FOUND=""; FOUND_BASE=""
for b in "${BASES[@]}"; do
  for t in "${CANDS[@]}"; do
    code=$(curl -s -m 12 -o /dev/null -w '%{http_code}' \
      -H "Authentication: bearer $t" -H "User-Agent: $UA" \
      "$b/$STORE/orders?per_page=1&fields=id" || echo 000)
    if [ "$code" = "200" ] || [ "$code" = "206" ]; then FOUND="$t"; FOUND_BASE="$b"; break 2; fi
  done
done

if [ -z "$FOUND" ]; then
  echo "✗ nenhum candidato validou na API (token pode estar no n8n/credencial, não em arquivo)."
  echo "  Localize e me diga o arquivo/variável:  grep -riE 'token|bearer' $SRC | grep -i nuvem"
  exit 1
fi

cd "$DEST_DIR"
grep -vE '^(NUVEMSHOP_TOKEN|NUVEMSHOP_STORE_ID|NUVEMSHOP_API_BASE|NUVEMSHOP_APP_NAME|NUVEMSHOP_CONTACT_EMAIL)=' .env > .env.t 2>/dev/null || true
{
  echo "NUVEMSHOP_TOKEN=$FOUND"
  echo "NUVEMSHOP_STORE_ID=$STORE"
  echo "NUVEMSHOP_API_BASE=$FOUND_BASE"
  echo "NUVEMSHOP_APP_NAME=SensesBI"
  echo "NUVEMSHOP_CONTACT_EMAIL=contato@gruposenses.com.br"
} >> .env.t
mv .env.t .env
chmod 600 .env
echo "✓ token válido (HTTP 200) gravado no .env — base=$FOUND_BASE, store=$STORE, len=${#FOUND} (não impresso)"
