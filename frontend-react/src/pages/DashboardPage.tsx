import { useEffect, useMemo, useState } from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { fallbackFuncionarios, loadDashboardData } from '../lib/api';
import type { EmpresaLocalizacao, Funcionario, Kpi } from '../types/dashboard';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler);

const flowSteps = ['Contrato', 'Aditivos', 'Atualizacoes', 'Empenhos', 'Conformidade', 'Nota Pagamento', 'Liquidacao', 'Encerramento'];

const activityItems = [
  { titulo: 'Nota de Pagamento Emitida', texto: 'Nota de Pagamento no 13456 emitida com sucesso', hora: '14:23' },
  { titulo: 'Empenho Emitido', texto: 'Empenho no 8923 emitido para o contrato CT-2025-089', hora: '14:20' },
  { titulo: 'Aditivo Assinado', texto: 'Aditivo no 03 assinado digitalmente', hora: '14:15' },
  { titulo: 'Conformidade Verificada', texto: 'Verificacao de conformidade realizada com sucesso', hora: '14:10' },
  { titulo: 'Nota de Pagamento Emitida', texto: 'Nota de Pagamento no 13455 emitida com sucesso', hora: '14:05' }
];

const alertItems = [
  { titulo: 'Vencimento de Contrato em 30 dias', texto: 'Contrato CT-2025-045 vence em 30 dias', hora: '14:20' },
  { titulo: 'Conformidade abaixo do ideal', texto: 'Contrato CT-2025-067 com conformidade abaixo de 80%', hora: '14:15' },
  { titulo: 'Nota de pagamento pendente', texto: '3 notas de pagamento pendentes', hora: '14:10' },
  { titulo: 'Pendencia documental', texto: 'Aditivo CT-2025-113 sem anexo validado', hora: '14:07' },
  { titulo: 'Risco de atraso', texto: 'Liquidacao de contrato CT-2025-098 acima do SLA', hora: '14:02' }
];

function formatTempo(segundos: number) {
  const mm = Math.floor(Math.max(0, segundos) / 60).toString().padStart(2, '0');
  const ss = Math.floor(Math.max(0, segundos) % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function getGoogleApiKey() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
}

function loadGoogleMapsScript(apiKey: string) {
  return new Promise<void>((resolve, reject) => {
    if ((window as any).google?.maps) {
      resolve();
      return;
    }

    const scriptExists = document.querySelector('script[data-google-maps]');
    if (scriptExists) {
      scriptExists.addEventListener('load', () => resolve());
      scriptExists.addEventListener('error', () => reject(new Error('Falha no script Google Maps')));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Google Maps'));
    document.head.appendChild(script);
  });
}

type MapCardProps = {
  localizacao: EmpresaLocalizacao;
};

function MapCard({ localizacao }: MapCardProps) {
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    async function run() {
      const apiKey = getGoogleApiKey();
      if (!apiKey) {
        setError('Defina VITE_GOOGLE_MAPS_API_KEY para habilitar geocodificacao por CEP.');
        return;
      }

      try {
        await loadGoogleMapsScript(apiKey);
        if (!isActive) return;

        const mapHost = document.getElementById('react-map-host');
        if (!mapHost) return;

        const geocoder = new (window as any).google.maps.Geocoder();
        geocoder.geocode({ address: `${localizacao.cep}, Brasil` }, (results: any[], status: string) => {
          if (!isActive) return;
          if (status !== 'OK' || !results || !results.length) {
            setError('Nao foi possivel geocodificar o CEP da empresa.');
            return;
          }

          const position = results[0].geometry.location;
          const googleMap = new (window as any).google.maps.Map(mapHost, {
            center: position,
            zoom: 14,
            disableDefaultUI: true,
            zoomControl: true,
            styles: [
              { elementType: 'geometry', stylers: [{ color: '#0b1120' }] },
              { elementType: 'labels.text.fill', stylers: [{ color: '#9cb5d0' }] },
              { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1120' }] },
              { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f3555' }] },
              { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b2744' }] },
              { featureType: 'poi', stylers: [{ visibility: 'off' }] },
              { featureType: 'transit', stylers: [{ visibility: 'off' }] }
            ]
          });

          new (window as any).google.maps.Marker({
            map: googleMap,
            position,
            title: localizacao.empresa || 'Localizacao da Empresa',
            icon: {
              path: (window as any).google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: '#2ef2ff',
              fillOpacity: 1,
              strokeColor: '#0c5673',
              strokeWeight: 2
            }
          });
        });
      } catch {
        setError('Falha ao carregar Google Maps. Verifique a chave e as restricoes.');
      }
    }

    run();

    return () => {
      isActive = false;
    };
  }, [localizacao.cep, localizacao.empresa]);

  return (
    <div className="h-[242px] rounded-xl border border-[rgba(121,174,232,0.26)] bg-[linear-gradient(160deg,#091221,#0b1a31)] overflow-hidden relative">
      <div id="react-map-host" className="absolute inset-0" />
      {error ? (
        <div className="absolute inset-0 grid place-items-center text-center text-[13px] text-[#b2cbe7] px-4 bg-[radial-gradient(circle_at_30%_40%,rgba(46,242,255,0.1),transparent_50%),linear-gradient(160deg,#091221,#0b1a31)]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>(fallbackFuncionarios);
  const [localizacao, setLocalizacao] = useState<EmpresaLocalizacao>({ cep: '01310-100', empresa: 'Tech Solutions Ltda' });
  const [clock, setClock] = useState('--/--/---- --:--:--');
  const [onlineUsers, setOnlineUsers] = useState(42);
  const [criticalAlerts, setCriticalAlerts] = useState(3);

  useEffect(() => {
    loadDashboardData().then((data) => {
      setKpis(data.kpis);
      setFuncionarios(data.funcionarios);
      setLocalizacao(data.localizacao);
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Date().toLocaleString('pt-BR'));
      setOnlineUsers(40 + Math.floor(Math.random() * 6));
      setCriticalAlerts(2 + Math.floor(Math.random() * 4));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#b9d2eb',
            font: { family: 'Sora', size: 11 }
          }
        }
      }
    }),
    []
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden text-[#eef6ff]">
      <div className="fixed inset-0 pointer-events-none opacity-30 bg-grid-tech z-0" />

      <div className="relative z-10 p-2.5 grid gap-2.5">
        <header className="glass p-3 min-h-[84px] grid grid-cols-1 xl:grid-cols-[1.2fr_1fr_auto] gap-3 items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-14 h-14 rounded-xl border border-[rgba(120,190,255,0.44)] grid place-items-center font-rajdhani text-[22px] font-bold bg-[linear-gradient(145deg,rgba(39,116,210,0.6),rgba(32,182,208,0.38))] shadow-[0_0_22px_rgba(62,167,255,0.35)]">
              SE
            </div>
            <div>
              <small className="text-[#8db6df] text-[11px] uppercase tracking-[0.08em]">Painel de acompanhamento integrado</small>
              <h1 className="font-rajdhani text-[26px] md:text-[34px] leading-none font-bold">Gestao de Contratos em Tempo Real</h1>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="meta-item"><span>Sincronizacao</span><b className="text-[#93ffd1]">ATIVA</b></div>
            <div className="meta-item"><span>Ultima atualizacao</span><b className="text-[17px]">{clock}</b></div>
            <div className="meta-item"><span>Usuarios online</span><b className="text-[#66d1ff]">{onlineUsers}</b></div>
            <div className="meta-item"><span>Alertas criticos</span><b className="text-[#ff7f96]">{criticalAlerts}</b></div>
          </div>

          <div className="flex items-center gap-2.5 xl:pl-2 xl:border-l xl:border-[rgba(115,161,219,0.34)]">
            <img className="w-10 h-10 rounded-full border border-[rgba(153,210,255,0.55)]" alt="Diego Henrique" src="https://i.pravatar.cc/80?img=12" />
            <div>
              <h2 className="text-base leading-none mb-1">Diego Henrique</h2>
              <p className="text-xs text-[#8fb1d5]">Administrador</p>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 2xl:grid-cols-7 lg:grid-cols-4 gap-2.5">
          {kpis.map((item, index) => (
            <article key={`${item.title}-${index}`} className={`kpi-card neon-${item.neon}`}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="font-rajdhani text-[17px] leading-none font-bold">{item.title}</div>
                <div className="kpi-icon">
                  <i className={`fa-solid ${item.icon}`} />
                </div>
              </div>
              <div className="font-rajdhani text-[46px] leading-[0.9] font-bold">{item.value}</div>
              <div className="text-[13px] text-[#91eec5] mb-2">{item.trend}</div>
              <div className="h-[5px] rounded-full bg-[rgba(96,135,181,0.26)] overflow-hidden">
                <i className="block h-full bg-[linear-gradient(90deg,#3ea7ff,#2ef2ff,#29e89e)] shadow-[0_0_12px_rgba(46,242,255,0.7)]" style={{ width: `${item.bar}%` }} />
              </div>
            </article>
          ))}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr_0.9fr] gap-2.5">
          <article className="glass p-2.5">
            <div className="panel-head"><h3>Fluxo de Contrato - Tempo Real</h3><span className="badge">pipeline ativo</span></div>
            <div className="grid grid-cols-4 xl:grid-cols-8 gap-2.5 mb-2.5">
              {flowSteps.map((step, index) => (
                <div key={step} className="text-center text-[10px] text-[#9ab9d7]">
                  <span className={`flow-dot ${index <= 6 ? 'flow-done' : ''}`} />
                  {step}
                </div>
              ))}
            </div>
            <div className="panel-head mt-2"><h3>Contrato Selecionado: CT-2025-089</h3><span className="badge">em execucao</span></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div className="fact"><b>Contratante:</b> Tech Solutions Ltda</div>
              <div className="fact"><b>CNPJ:</b> 12.345.678/0001-90</div>
              <div className="fact"><b>Objeto:</b> Solucao em Tecnologia da Informacao</div>
              <div className="fact"><b>Vigencia:</b> 01/01/2025 ate 31/12/2025</div>
              <div className="fact"><b>Valor Global:</b> R$ 4.850.000,00</div>
              <div className="fact"><b>Status:</b> <span className="text-[#8fffcf]">Em Execucao</span></div>
            </div>
          </article>

          <article className="glass p-2.5">
            <div className="panel-head"><h3>Localizacao da Empresa</h3><span className="badge">CEP: {localizacao.cep}</span></div>
            <MapCard localizacao={localizacao} />
          </article>

          <article className="glass p-2.5">
            <div className="panel-head"><h3>Atividades Recentes</h3><span className="badge">tempo real</span></div>
            <div className="space-y-2 max-h-[274px] overflow-y-auto pr-0.5">
              {activityItems.map((item, index) => (
                <div key={`${item.titulo}-${index}`} className="item-card">
                  <b>{item.titulo}</b>
                  <div>{item.texto}</div>
                  <small>{item.hora}</small>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-6 gap-2.5 items-start">
          <article className="glass p-2.5 2xl:col-span-1 md:col-span-2">
            <div className="panel-head"><h3>Monitoramento de Funcionarios em Tempo Real</h3><span className="badge">lista completa</span></div>
            <div className="max-h-[262px] overflow-auto border border-[rgba(115,165,224,0.2)] rounded-[10px]">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Funcao</th>
                    <th>Status</th>
                    <th>Atividade Atual</th>
                    <th>Tempo Online</th>
                    <th>Online</th>
                  </tr>
                </thead>
                <tbody>
                  {funcionarios.map((pessoa, index) => (
                    <tr key={`${pessoa.nome}-${index}`}>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <img className="w-[22px] h-[22px] rounded-full border border-[rgba(152,208,255,0.5)]" alt={pessoa.nome} src={pessoa.foto} />
                          <span>{pessoa.nome}</span>
                        </div>
                      </td>
                      <td>{pessoa.funcao}</td>
                      <td>
                        <span className={`status-pill ${pessoa.status === 'Online' ? 'status-online' : 'status-away'}`}>
                          {pessoa.status}
                        </span>
                      </td>
                      <td>{pessoa.atividade}</td>
                      <td>{formatTempo(pessoa.tempoOnlineSeg)}</td>
                      <td>
                        <div className="h-1.5 rounded-full bg-[rgba(92,134,182,0.25)] overflow-hidden min-w-[92px]">
                          <i
                            className="block h-full bg-[linear-gradient(90deg,#19c47c,#2ef2ff)] shadow-[0_0_10px_rgba(46,242,255,0.46)]"
                            style={{ width: `${Math.max(0, Math.min(100, pessoa.online))}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="glass p-2.5">
            <div className="panel-head"><h3>Alertas e Notificacoes</h3><span className="badge">prioridade</span></div>
            <div className="space-y-2 max-h-[274px] overflow-y-auto pr-0.5">
              {alertItems.map((item, index) => (
                <div key={`${item.titulo}-${index}`} className="item-card">
                  <b><i className="fa-solid fa-flag text-[#ff7d92]" /> {item.titulo}</b>
                  <div className="mt-0.5">{item.texto}</div>
                  <small>{item.hora}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="glass p-2.5">
            <div className="panel-head"><h3>Contratos por Status</h3><span className="badge">donut</span></div>
            <div className="h-[240px]">
              <Doughnut
                options={{ ...chartOptions, cutout: '64%' }}
                data={{
                  labels: ['Em Execucao', 'Finalizados', 'Suspensos', 'Cancelados'],
                  datasets: [{
                    data: [58, 38, 18, 14],
                    backgroundColor: ['#31e6a3', '#2aa3ff', '#ffb454', '#ff6b7d'],
                    borderColor: '#0c1527',
                    borderWidth: 2
                  }]
                }}
              />
            </div>
          </article>

          <article className="glass p-2.5">
            <div className="panel-head"><h3>Valores por Mes (R$)</h3><span className="badge">jan-ago</span></div>
            <div className="h-[240px]">
              <Bar
                options={{
                  ...chartOptions,
                  scales: {
                    x: { ticks: { color: '#9bb9d6' }, grid: { color: 'rgba(76, 120, 170, 0.2)' } },
                    y: { ticks: { color: '#9bb9d6' }, grid: { color: 'rgba(76, 120, 170, 0.2)' } }
                  }
                }}
                data={{
                  labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'],
                  datasets: [{
                    label: 'R$ (mil)',
                    data: [60, 95, 130, 110, 145, 120, 155, 190],
                    borderRadius: 7,
                    borderSkipped: false,
                    backgroundColor: '#2ef2ff'
                  }]
                }}
              />
            </div>
          </article>

          <article className="glass p-2.5">
            <div className="panel-head"><h3>Conformidade por Contrato</h3><span className="badge">2021-2023</span></div>
            <div className="h-[240px]">
              <Line
                options={{
                  ...chartOptions,
                  scales: {
                    x: { ticks: { color: '#9bb9d6' }, grid: { color: 'rgba(76, 120, 170, 0.2)' } },
                    y: { min: 0, max: 100, ticks: { color: '#9bb9d6' }, grid: { color: 'rgba(76, 120, 170, 0.2)' } }
                  }
                }}
                data={{
                  labels: ['2021', '2021.5', '2022', '2022.5', '2023'],
                  datasets: [{
                    label: 'Conformidade (%)',
                    data: [20, 42, 38, 63, 92],
                    borderColor: '#41f4ff',
                    borderWidth: 3,
                    tension: 0.35,
                    pointRadius: 4,
                    pointBackgroundColor: '#7efff2',
                    pointBorderColor: '#1f9faf',
                    pointBorderWidth: 1,
                    fill: true,
                    backgroundColor: 'rgba(65, 244, 255, 0.08)'
                  }]
                }}
              />
            </div>
          </article>

          <article className="glass p-2.5">
            <div className="panel-head"><h3>Resumo Financeiro</h3><span className="badge">R$ 54,8M</span></div>
            <div className="h-[240px]">
              <Doughnut
                options={{
                  ...chartOptions,
                  cutout: '67%',
                  plugins: {
                    ...chartOptions.plugins,
                    legend: { display: false }
                  }
                }}
                data={{
                  labels: ['Empenhado', 'Liquidado', 'Pendente'],
                  datasets: [{
                    data: [64, 24, 12],
                    backgroundColor: ['#31e6a3', '#2aa3ff', '#f7d470'],
                    borderColor: '#0d172a',
                    borderWidth: 2
                  }]
                }}
              />
            </div>
            <div className="grid gap-1 text-xs mt-2">
              <span className="flex justify-between text-[#9ab9d8]"><span><i className="dot bg-[#31e6a3]" />Empenhado</span><b>64%</b></span>
              <span className="flex justify-between text-[#9ab9d8]"><span><i className="dot bg-[#2aa3ff]" />Liquidado</span><b>24%</b></span>
              <span className="flex justify-between text-[#9ab9d8]"><span><i className="dot bg-[#f7d470]" />Pendente</span><b>12%</b></span>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
