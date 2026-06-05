import { PageHeader, Card, CardTitle } from "@/components/ui";

export const metadata = { title: "Processos · Field" };

function Item({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
      <div className="mt-1 space-y-1 text-sm leading-relaxed text-slate-600">{children}</div>
    </div>
  );
}

export default function ProcessosPage() {
  return (
    <>
      <PageHeader
        title="Como funciona o CS hoje"
        subtitle="As regras que o dashboard usa — pra onboarding e alinhamento"
      />

      <Card>
        <CardTitle>Cobertura · o que cada cliente deve receber</CardTitle>
        <div className="divide-y divide-slate-100">
          <Item titulo="Metas mensais (expectativas)">
            <p>Geradas no dia 1 de cada mês:</p>
            <p>• Cliente <strong>presencial</strong> → 1 <strong>visita</strong> por mês.</p>
            <p>• Cliente <strong>remoto</strong> → 1 <strong>refil</strong> a cada 2 meses (meses ímpares: jan, mar, mai, jul, set, nov).</p>
            <p>Os <strong>gaps</strong> são as metas ainda não cumpridas no mês.</p>
          </Item>
          <Item titulo="Como uma meta é cumprida">
            <p>• <strong>Visita:</strong> concluída quando a OS está finalizada no Field.</p>
            <p>• <strong>Refil enviado:</strong> existe a OS de recarga.</p>
            <p>• <strong>Refil com rastreio:</strong> o código foi preenchido no form “Código de rastreio.” do Field.</p>
            <p>• <strong>Refil sem rastreio:</strong> enviado mas sem código → “em execução” = risco invisível (aba Revisar).</p>
          </Item>
          <Item titulo="Agendado (automático, do Field)">
            <p>Se já existe OS agendada no Field (ainda não concluída), o gap aparece <strong>“Agendado”</strong> sozinho — ninguém registra à mão. Só os gaps <strong>sem agendamento</strong> pedem ação.</p>
          </Item>
        </div>
      </Card>

      <Card className="mt-4 lg:mt-6">
        <CardTitle>Segmentação · jornada, tier e criticidade</CardTitle>
        <div className="divide-y divide-slate-100">
          <Item titulo="Jornada (etiqueta manual no Field)">
            <p>Esperada pelo tempo de casa: 0–6 meses <strong>onboarding</strong> · 6–12 <strong>conexão</strong> · 12–24 <strong>consolidação</strong> · 24+ <strong>fidelizado-dna</strong>.</p>
            <p>Quando a etiqueta não bate com o tempo de casa, o dashboard sinaliza na aba <strong>Revisar</strong>.</p>
          </Item>
          <Item titulo="Tier (valor do contrato)">
            <p>super-star · star · premium · growth — etiquetas do Field usadas pra priorizar.</p>
          </Item>
          <Item titulo="Criticidade de um gap">
            <p>Combina <strong>tier</strong> (valor do cliente) × <strong>risco</strong> (jornada — quanto mais no início, mais frágil).</p>
            <p>• <strong>Crítico:</strong> tier alto E cliente em fase inicial. • Alto / Médio / Estável: combinações intermediárias.</p>
          </Item>
        </div>
      </Card>

      <Card className="mt-4 lg:mt-6">
        <CardTitle>Satisfação e dados</CardTitle>
        <div className="divide-y divide-slate-100">
          <Item titulo="Avaliações e alertas">
            <p>Notas <strong>≤ 3</strong> são críticas. Um agente (Claude) classifica comentários e avaliações e gera alertas, empurrados no Telegram do gestor.</p>
          </Item>
          <Item titulo="De onde vêm os dados">
            <p>Sincronizado do <strong>Field Control</strong>: OS e avaliações a cada <strong>~30 min</strong>; clientes, etiquetas e equipamentos a cada <strong>2–6 h</strong>. <strong>Cobertura, metas e gaps são calculados aqui</strong> — não existem prontos no Field. O dashboard só espelha e agrega, nunca escreve de volta no Field.</p>
          </Item>
        </div>
      </Card>

      <Card className="mt-4 lg:mt-6">
        <CardTitle>De onde vêm os números do Resumo Executivo</CardTitle>
        <div className="divide-y divide-slate-100">
          <Item titulo="Ativações no mês">
            <p>Origem: as <strong>Ordens de Serviço do Field</strong>. Conta <strong>clientes distintos</strong> com OS <strong>concluída</strong> de instalação (presencial / remota / piloto) ou <strong>primeiro envio</strong>, no mês.</p>
            <p>O status “concluída” vem da <strong>tarefa</strong> da OS no Field; o mês é a <strong>data planejada</strong> da tarefa. Conta clientes/OS, não unidades físicas de máquina (a API não liga OS a uma máquina específica).</p>
          </Item>
          <Item titulo="Cobertura de visitas / refis">
            <p><strong>Numerador</strong> (o que aconteceu): OS reais do Field — refil no Field é o serviço <strong>“Envio de Recarga”</strong>.</p>
            <p><strong>Denominador</strong> (a meta): regra calculada aqui — <strong>1 visita/mês</strong> por cliente presencial e <strong>1 refil bimestral</strong> (meses ímpares) por cliente remoto. Presencial/remoto vem das <strong>etiquetas do cliente no Field</strong>.</p>
            <p>% = <strong>realizado ÷ esperado</strong> (realizado = meta que já tem OS criada no mês).</p>
          </Item>
          <Item titulo="Risco de churn">
            <p>Origem: as <strong>avaliações dos clientes no Field</strong> (nota 0–5 + comentário, coletadas após o atendimento). O número é quantas avaliações com <strong>nota ≤ 3</strong> no mês.</p>
            <p>No detalhe (ao clicar): o “problema” é o <strong>comentário</strong> (vem do Field); a “ação sugerida” é gerada pelo <strong>agente de IA</strong> que lê os comentários — essa parte é nossa, não do Field.</p>
          </Item>
        </div>
      </Card>
    </>
  );
}
