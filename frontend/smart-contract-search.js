(function (global) {
  const UNIT_ALIASES = [
    { keys: ['pm-mt', 'pmmt', 'policia militar', 'pm mt'], label: 'PM-MT' },
    { keys: ['cbm-mt', 'cbmmt', 'bombeiro'], label: 'CBM-MT' },
    { keys: ['ciopaer'], label: 'CIOPAER' },
    { keys: ['ciosp'], label: 'CIOSP' },
    { keys: ['pjc-mt', 'pcj', 'policia judiciaria'], label: 'PJC-MT' },
    { keys: ['politec'], label: 'POLITEC' },
    { keys: ['sesp'], label: 'SESP' },
    { keys: ['copal'], label: 'COPAL' }
  ];

  const EXAMPLE_QUERIES = [
    'vencendo em 90 dias',
    'sem PDF',
    'PM-MT',
    'com empenho',
    'aditivo',
    'encerrado'
  ];

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function parseMoney(value) {
    if (typeof value === 'number') return value;
    const text = String(value || '').trim();
    if (!text) return 0;
    const normalized = text.replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    return Number.parseFloat(normalized) || 0;
  }

  function parseDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) {
      const date = new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00`);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysRemaining(contract) {
    const end = parseDate(contract?.dtFinal || contract?.dataFim);
    if (!end) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / 86400000);
  }

  function unitNames(contract) {
    const units = Array.isArray(contract?.unidades) ? contract.unidades : [];
    return units
      .map((entry) => String(entry?.unidade || entry?.nome || entry || '').trim())
      .filter(Boolean);
  }

  function hasPdf(contract) {
    const file = String(contract?.arquivoContrato || '').trim();
    const b64 = String(contract?.conteudoArquivoBase64 || '').trim();
    return Boolean(file || b64);
  }

  function haystack(contract) {
    const lotes = Array.isArray(contract?.lotes) ? contract.lotes : [];
    const loteText = lotes.map((lote) => [
      lote?.lote,
      lote?.item,
      lote?.siag,
      lote?.codSiag,
      lote?.descricao,
      lote?.marca
    ].join(' ')).join(' ');

    return normalize([
      contract?.numContrato,
      contract?.numProcesso,
      contract?.credor,
      contract?.razaoSocial,
      contract?.nomeFantasia,
      contract?.cnpj,
      contract?.objeto,
      contract?.cidade,
      contract?.uf,
      contract?.emailEmpresa,
      unitNames(contract).join(' '),
      loteText
    ].join(' '));
  }

  function parseIntent(query) {
    const raw = String(query || '').trim();
    const text = normalize(raw);
    const intent = {
      raw,
      text,
      tokens: text.split(/\s+/).filter((token) => token.length > 1),
      units: [],
      status: '',
      hasPdf: null,
      hasEmpenho: null,
      hasAditivo: null,
      daysMax: null,
      year: '',
      contractHint: '',
      cnpj: ''
    };

    UNIT_ALIASES.forEach((alias) => {
      if (alias.keys.some((key) => text.includes(key))) {
        intent.units.push(alias.label);
      }
    });

    if (/\bvencid|\bencerrad|\binativ/.test(text)) intent.status = 'Encerrado';
    else if (/\bvencendo|\bcritic|\ba vencer|\bvence em/.test(text)) intent.status = 'Vencendo';
    else if (/\bativ/.test(text) && !/\binativ/.test(text)) intent.status = 'Ativo';

    if (/sem pdf|sem anexo|sem documento/.test(text)) intent.hasPdf = false;
    else if (/com pdf|com anexo|com documento/.test(text)) intent.hasPdf = true;

    if (/sem empenho/.test(text)) intent.hasEmpenho = false;
    else if (/com empenho|empenhado/.test(text)) intent.hasEmpenho = true;

    if (/\baditiv/.test(text)) intent.hasAditivo = true;

    const daysMatch = text.match(/(\d+)\s*dias/);
    if (daysMatch) intent.daysMax = Number(daysMatch[1]);

    const yearMatch = text.match(/\b(20\d{2})\b/);
    if (yearMatch) intent.year = yearMatch[1];

    const numberMatch = raw.match(/\d{1,4}\s*[\/-]\s*\d{4}/);
    if (numberMatch) intent.contractHint = normalize(numberMatch[0].replace(/\s+/g, ''));

    const cnpjMatch = digits(raw);
    if (cnpjMatch.length >= 8) intent.cnpj = cnpjMatch;

    return intent;
  }

  function describeIntent(intent) {
    const parts = [];
    if (intent.contractHint) parts.push('nº ' + intent.raw.match(/\d{1,4}\s*[\/-]\s*\d{4}/)?.[0]);
    if (intent.status) parts.push(intent.status.toLowerCase());
    if (intent.units.length) parts.push(intent.units.join(', '));
    if (intent.hasPdf === false) parts.push('sem PDF');
    if (intent.hasPdf === true) parts.push('com PDF');
    if (intent.hasEmpenho === false) parts.push('sem empenho');
    if (intent.hasEmpenho === true) parts.push('com empenho');
    if (intent.hasAditivo) parts.push('com aditivo');
    if (intent.daysMax != null) parts.push('até ' + intent.daysMax + ' dias');
    if (intent.year) parts.push('ano ' + intent.year);
    return parts.filter(Boolean);
  }

  function getStatus(contract) {
    const explicit = normalize(contract?.status);
    if (explicit === 'encerrado' || explicit === 'inativo') return 'Encerrado';
    const dias = daysRemaining(contract);
    if (dias !== null && dias < 0) return 'Encerrado';
    if (dias !== null && dias <= 90) return 'Vencendo';
    return 'Ativo';
  }

  function scoreContract(contract, intent) {
    if (!intent.text) {
      return { score: 1, reasons: [] };
    }

    let score = 0;
    const reasons = [];
    const number = normalize(contract?.numContrato);
    const company = normalize(contract?.nomeFantasia || contract?.razaoSocial || contract?.credor);
    const units = unitNames(contract);
    const status = getStatus(contract);
    const dias = daysRemaining(contract);
    const blob = haystack(contract);
    const empenhos = Array.isArray(contract?.empenhos) ? contract.empenhos.length : 0;
    const aditivos = Array.isArray(contract?.aditivos) ? contract.aditivos.length : 0;

    if (intent.contractHint) {
      if (number.includes(intent.contractHint) || number.replace(/\s+/g, '').includes(intent.contractHint)) {
        score += 80;
        reasons.push('número do contrato');
      } else {
        return { score: 0, reasons: [] };
      }
    }

    if (intent.cnpj) {
      const cnpj = digits(contract?.cnpj);
      if (cnpj.includes(intent.cnpj) || intent.cnpj.includes(cnpj)) {
        score += 70;
        reasons.push('CNPJ');
      } else if (intent.cnpj.length >= 11) {
        return { score: 0, reasons: [] };
      }
    }

    if (intent.units.length) {
      const unitBlob = normalize(units.join(' '));
      const matched = intent.units.some((unit) => unitBlob.includes(normalize(unit)) || unitBlob.includes(normalize(unit.replace('-', ''))));
      if (!matched) return { score: 0, reasons: [] };
      score += 40;
      reasons.push(intent.units.join(', '));
    }

    if (intent.status) {
      if (status !== intent.status) return { score: 0, reasons: [] };
      score += 35;
      reasons.push(status);
    }

    if (intent.hasPdf === true && !hasPdf(contract)) return { score: 0, reasons: [] };
    if (intent.hasPdf === false && hasPdf(contract)) return { score: 0, reasons: [] };
    if (intent.hasPdf !== null) {
      score += 20;
      reasons.push(intent.hasPdf ? 'com PDF' : 'sem PDF');
    }

    if (intent.hasEmpenho === true && empenhos === 0) return { score: 0, reasons: [] };
    if (intent.hasEmpenho === false && empenhos > 0) return { score: 0, reasons: [] };
    if (intent.hasEmpenho !== null) {
      score += 20;
      reasons.push(intent.hasEmpenho ? 'com empenho' : 'sem empenho');
    }

    if (intent.hasAditivo) {
      if (aditivos === 0) return { score: 0, reasons: [] };
      score += 20;
      reasons.push('aditivo');
    }

    if (intent.daysMax != null) {
      if (dias === null || dias < 0 || dias > intent.daysMax) return { score: 0, reasons: [] };
      score += 25;
      reasons.push(dias + ' dias');
    }

    if (intent.year) {
      const yearBlob = String(contract?.numContrato || '') + ' ' + String(contract?.dtInicial || '');
      if (!yearBlob.includes(intent.year)) return { score: 0, reasons: [] };
      score += 15;
      reasons.push(intent.year);
    }

    intent.tokens.forEach((token) => {
      if (token.length < 2) return;
      if (['em', 'de', 'da', 'do', 'com', 'sem', 'para', 'dias', 'pdf', 'anexo', 'contrato', 'vencendo', 'vencido', 'ativo', 'encerrado', 'aditivo', 'empenho'].includes(token)) {
        return;
      }
      if (number.includes(token)) {
        score += 18;
        reasons.push('nº');
        return;
      }
      if (company.includes(token)) {
        score += 14;
        reasons.push('empresa');
        return;
      }
      if (blob.includes(token)) {
        score += 8;
        reasons.push('objeto/dados');
      }
    });

    if (score <= 0 && blob.includes(intent.text)) {
      score = 5;
      reasons.push('texto livre');
    }

    return { score, reasons: Array.from(new Set(reasons)) };
  }

  function searchContracts(contracts, query) {
    const list = Array.isArray(contracts) ? contracts : [];
    const intent = parseIntent(query);
    if (!intent.text) {
      return {
        intent,
        results: list.map((contract) => ({ contract, score: 1, reasons: [] }))
      };
    }

    const results = list
      .map((contract) => {
        const ranked = scoreContract(contract, intent);
        return { contract, score: ranked.score, reasons: ranked.reasons };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return { intent, results };
  }

  global.CopalSmartSearch = {
    EXAMPLE_QUERIES,
    parseIntent,
    describeIntent,
    searchContracts,
    daysRemaining,
    unitNames,
    hasPdf,
    getStatus,
    parseMoney,
    parseDate
  };
})(window);
