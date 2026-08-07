import type { EmpresaLocalizacao, Funcionario, Kpi } from '../types/dashboard';

const endpoints = {
  kpis: '/api/kpis',
  funcionarios: '/api/funcionarios',
  localizacao: '/api/empresa/localizacao'
};

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export const fallbackKpis: Kpi[] = [
  { title: 'Contratos Ativos', value: '128', trend: '+8 este mes', neon: 'blue', icon: 'fa-layer-group', bar: 72 },
  { title: 'Aditivos Ativos', value: '47', trend: '+5 este mes', neon: 'cyan', icon: 'fa-file-circle-plus', bar: 61 },
  { title: 'Atualizacoes', value: '23', trend: '+12 hoje', neon: 'green', icon: 'fa-arrows-rotate', bar: 56 },
  { title: 'Empenhos em Andamento', value: '89', trend: '+15 hoje', neon: 'purple', icon: 'fa-receipt', bar: 68 },
  { title: 'Conformidade', value: '96.7%', trend: 'Excellent', neon: 'teal', icon: 'fa-shield-halved', bar: 97 },
  { title: 'Notas de Pagamento', value: '134', trend: '+22 este mes', neon: 'gold', icon: 'fa-dollar-sign', bar: 66 },
  { title: 'Valor Total Contratos', value: 'R$ 54,8M', trend: '+12,6% este mes', neon: 'light', icon: 'fa-chart-line', bar: 84 }
];

export const fallbackFuncionarios: Funcionario[] = [
  { nome: 'Ana Paula', foto: 'https://i.pravatar.cc/60?img=32', funcao: 'Analista', status: 'Online', atividade: 'Analisando Contrato CT-2025-089', tempoOnlineSeg: 620, online: 90 },
  { nome: 'Carlos Silva', foto: 'https://i.pravatar.cc/60?img=11', funcao: 'Analista', status: 'Online', atividade: 'Analisando Contrato CT-2025-095', tempoOnlineSeg: 577, online: 86 },
  { nome: 'Caio Silva', foto: 'https://i.pravatar.cc/60?img=68', funcao: 'Assistente', status: 'Ausente', atividade: 'Analisando Contrato CT-2025-056', tempoOnlineSeg: 50, online: 24 },
  { nome: 'Carlos Lima', foto: 'https://i.pravatar.cc/60?img=53', funcao: 'Analista', status: 'Online', atividade: 'Analisando Contrato CT-2025-039', tempoOnlineSeg: 634, online: 88 },
  { nome: 'Caio Silva', foto: 'https://i.pravatar.cc/60?img=24', funcao: 'Analista', status: 'Ausente', atividade: 'Analisando Contrato CT-2025-092', tempoOnlineSeg: 20, online: 14 },
  { nome: 'Juliana Alves', foto: 'https://i.pravatar.cc/60?img=47', funcao: 'Supervisora', status: 'Online', atividade: 'Auditoria de aditivos CT-2025-112', tempoOnlineSeg: 662, online: 91 },
  { nome: 'Bruno Prado', foto: 'https://i.pravatar.cc/60?img=59', funcao: 'Assistente', status: 'Online', atividade: 'Cadastro de notas de pagamento', tempoOnlineSeg: 488, online: 74 },
  { nome: 'Aline Souza', foto: 'https://i.pravatar.cc/60?img=39', funcao: 'Analista', status: 'Online', atividade: 'Atualizando metrica de liquidacao', tempoOnlineSeg: 532, online: 83 }
];

export const fallbackLocalizacao: EmpresaLocalizacao = {
  cep: '01310-100',
  empresa: 'Tech Solutions Ltda'
};

export async function loadDashboardData() {
  const [kpis, funcionarios, localizacao] = await Promise.all([
    fetchJson<Kpi[]>(endpoints.kpis, fallbackKpis),
    fetchJson<Funcionario[]>(endpoints.funcionarios, fallbackFuncionarios),
    fetchJson<EmpresaLocalizacao>(endpoints.localizacao, fallbackLocalizacao)
  ]);

  return {
    kpis: Array.isArray(kpis) ? kpis : fallbackKpis,
    funcionarios: Array.isArray(funcionarios) ? funcionarios : fallbackFuncionarios,
    localizacao: localizacao?.cep ? localizacao : fallbackLocalizacao
  };
}
