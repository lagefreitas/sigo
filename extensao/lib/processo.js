// Cálculos determinísticos (sem IA) sobre um processo já lido do SIPAC.

/** "dd/mm/aaaa ..." -> Date (meia-noite local) ou null. */
export function data(s) {
  const m = (s || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}
export const fmt = d => d ? d.toLocaleDateString('pt-BR') : '';
export const agora = () => new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');

const ordemNum = m => parseInt(m.ordem, 10) || 0;
const porData = (a, b) => ((data(a.enviadoEm) || 0) - (data(b.enviadoEm) || 0)) || (ordemNum(a) - ordemNum(b));

/** Onde o processo está agora e há quanto tempo. */
export function ondeEsta(proc, hoje = new Date()) {
  const um = proc.ultimaMovimentacao || {};
  const movs = [...(proc.movimentacoes || [])].sort(porData);
  const ult = movs[movs.length - 1] || {};
  const unidade = um['Destino'] || ult.destino || proc.localAtual || '';
  const enviado = data(um['Data de Envio']) || data(ult.enviadoEm);
  const recebido = data(um['Data de Recebimento'] || ult.recebidoEm || '');
  const desde = recebido || enviado;
  const zero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = desde ? Math.round((zero - desde) / 86400000) : null;
  return {
    unidade,
    enviadoEm: fmt(enviado),
    recebido: !!recebido,
    recebidoEm: fmt(recebido),
    recebidoPor: recebido ? (ult.recebidoPor || '') : '',
    enviadoPor: um['Enviado por'] || ult.enviadoPor || '',
    diasNaUnidade: dias,
    parado: dias != null && dias > 15,
    tempoEsperado: um['Tempo Esperado no Destino'] || '',
    situacao: proc.situacao || (proc.dados || {})['Status'] || '',
  };
}

/** Muda quando o processo muda: chave do cache de resumos. */
export function assinatura(proc) {
  const o = ondeEsta(proc);
  return ['v2', (proc.documentos || []).length, (proc.movimentacoes || []).length,
    o.unidade, o.enviadoEm, o.recebidoEm, o.situacao].join('|');
}

/** Natureza do processo (OSTENSIVO, RESTRITO, SIGILOSO...) a partir dos dados gerais. */
export function natureza(proc) {
  const d = proc.dados || {};
  const k = Object.keys(d).find(x => /natureza/i.test(x));
  return k ? d[k] : '';
}
export const ehRestrito = texto => /sigil|restrit|reservad|secret/i.test(texto || '');
/** Falha segura: se o SIPAC não informar a natureza, o processo é tratado como restrito para a IA. */
export const naturezaDesconhecida = proc => !natureza(proc).trim();
export const processoRestrito = proc => naturezaDesconhecida(proc) || ehRestrito(natureza(proc));

/** Pessoas das últimas movimentações, com e-mail/telefone quando o SIPAC mostra. */
export function contatos(proc, n = 3) {
  const movs = [...(proc.movimentacoes || [])].sort(porData).slice(-n).reverse();
  const out = [];
  for (const m of movs) {
    for (const [papel, nome, cont, quando] of [
      ['recebeu na unidade ' + (m.destino || ''), m.recebidoPor, m.contatoReceb, m.recebidoEm],
      ['enviou para ' + (m.destino || ''), m.enviadoPor, m.contatoEnvio, m.enviadoEm]]) {
      if (nome && nome !== '---') out.push({ nome, papel, data: quando, ...(cont || {}) });
    }
  }
  return out;
}

/** Retrato do processo para o Acompanhar. */
export function foto(proc) {
  const o = ondeEsta(proc), d = proc.dados || {};
  const movs = [...(proc.movimentacoes || [])].sort(porData);
  return {
    numero: proc.numero,
    assunto: d['Assunto Detalhado'] || d['Assunto do Processo'] || '',
    situacao: o.situacao, unidade: o.unidade, recebido: o.recebido,
    enviadoEm: o.enviadoEm, recebidoEm: o.recebidoEm, diasNaUnidade: o.diasNaUnidade, parado: o.parado,
    nMovs: movs.length,
    trajeto: movs.slice(-5).map(m => ({ unidade: m.destino || '', data: m.enviadoEm || '' })),
    docs: (proc.documentos || []).map(x => `${x.ordem} - ${x.tipo} (${x.data})`),
  };
}

/** O que mudou entre dois retratos. */
export function mudancas(antes, depois) {
  if (!antes) return [];
  const a = { ...depois, ...antes }, m = [];
  if (a.unidade !== depois.unidade) m.push(`Mudou de unidade: ${a.unidade} → ${depois.unidade}`);
  else if (!a.recebido && depois.recebido) m.push(`Foi recebido em ${depois.recebidoEm}`);
  if (a.situacao !== depois.situacao) m.push(`Situação: ${a.situacao} → ${depois.situacao}`);
  const vistos = new Set(a.docs || []);
  for (const x of depois.docs || []) if (!vistos.has(x)) m.push(`Novo documento: doc. ${x}`);
  return m;
}

/** O essencial do resumo de IA para o cartão do Acompanhar. */
export function iaCurta(r) {
  const pa = r.proxima_acao || {};
  return {
    manchete: r.manchete || r.situacao_atual || '', semaforo: r.semaforo || {},
    proxima: pa.o_que || '', quem: pa.quem || '',
    comVoce: (r.depende_de_mim || []).map(x => x.acao || ''), geradoEm: r._geradoEm || '',
  };
}
