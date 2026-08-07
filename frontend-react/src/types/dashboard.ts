export type Kpi = {
  title: string;
  value: string;
  trend: string;
  neon: 'blue' | 'cyan' | 'green' | 'purple' | 'teal' | 'gold' | 'light';
  icon: string;
  bar: number;
};

export type Funcionario = {
  nome: string;
  foto: string;
  funcao: string;
  status: 'Online' | 'Ausente';
  atividade: string;
  tempoOnlineSeg: number;
  online: number;
};

export type EmpresaLocalizacao = {
  cep: string;
  empresa?: string;
  cidade?: string;
  uf?: string;
  logradouro?: string;
  numero?: string;
};
