const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const cors = require('cors');
const { createDatabase } = require('./config/database');

dotenv.config();
dotenv.config({ path: path.join(__dirname, '.env') });

let fetchApi = global.fetch;
try {
  if (!fetchApi) {
    fetchApi = require('node-fetch');
  }
} catch (e) {
  if (!fetchApi) {
    console.error('Aviso: fetch não está disponível no ambiente Node e node-fetch não pôde ser carregado. IA GOV MT pode não funcionar.');
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const uploadPath = process.env.UPLOAD_PATH || 'uploads';
const UPLOAD_DIR = path.isAbsolute(uploadPath) ? uploadPath : path.join(ROOT_DIR, uploadPath);
const ADMIN_BOOTSTRAP_LOGIN = String(process.env.ADMIN_BOOTSTRAP_LOGIN || 'ADM@COPAL').trim().toLowerCase();
const ADMIN_BOOTSTRAP_PASSWORD = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || 'COPAL@2026');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const db = createDatabase('users');
const contractsDb = createDatabase('contracts');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function isBcryptHash(value) {
  return typeof value === 'string' && /^\$2[aby]\$/.test(value);
}

async function hashPasswordSecure(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPasswordSecure(rawPassword, storedHash) {
  if (!storedHash) return false;
  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(rawPassword, storedHash);
  }
  return storedHash === rawPassword || storedHash === hashPassword(rawPassword);
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeUnitCodeServer(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const requisitionCodeStore = {};

function createMailTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  if (process.platform === 'win32' || process.env.NODE_ENV !== 'production') {
    // Em ambiente local, usar transporte JSON para permitir teste visual do e-mail sem SMTP real.
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    sendmail: true,
    newline: 'unix',
    path: '/usr/sbin/sendmail',
  });
}

const emailTransporter = createMailTransporter();

function extractEmailDebugInfo(info) {
  if (!info || !info.message) return null;
  if (typeof info.message === 'string') {
    try {
      return JSON.parse(info.message);
    } catch (error) {
      return { raw: info.message };
    }
  }
  return info.message;
}

function sendEmail(mailOptions) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@copal.mt.gov.br';
  return emailTransporter.sendMail({ from: fromAddress, ...mailOptions });
}

function parseEmailRecipients(value) {
  const recipients = String(value || '')
    .split(/[;,\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return [...new Set(recipients)].filter((email) => validEmail.test(email));
}

function runQuery(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getQuery(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function safeJsonParse(value, fallback = []) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

const SIAG_ITEM_LIST_URL = 'https://aquisicoes.seplag.mt.gov.br/sgc/faces/pub/sgc/central/ItemCompraPageList.jsp';

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&ccedil;/gi, 'c')
    .replace(/&Ccedil;/gi, 'C')
    .replace(/&atilde;/gi, 'a')
    .replace(/&Atilde;/gi, 'A')
    .replace(/&aacute;/gi, 'a')
    .replace(/&Aacute;/gi, 'A')
    .replace(/&agrave;/gi, 'a')
    .replace(/&Agrave;/gi, 'A')
    .replace(/&acirc;/gi, 'a')
    .replace(/&Acirc;/gi, 'A')
    .replace(/&eacute;/gi, 'e')
    .replace(/&Eacute;/gi, 'E')
    .replace(/&ecirc;/gi, 'e')
    .replace(/&Ecirc;/gi, 'E')
    .replace(/&iacute;/gi, 'i')
    .replace(/&Iacute;/gi, 'I')
    .replace(/&oacute;/gi, 'o')
    .replace(/&Oacute;/gi, 'O')
    .replace(/&ocirc;/gi, 'o')
    .replace(/&Ocirc;/gi, 'O')
    .replace(/&otilde;/gi, 'o')
    .replace(/&Otilde;/gi, 'O')
    .replace(/&uacute;/gi, 'u')
    .replace(/&Uacute;/gi, 'U')
    .replace(/&#(\d+);/g, (_, code) => {
      const parsed = Number(code);
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : _;
    });
}

function cleanHtmlText(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeSiagCode(value) {
  return String(value || '').replace(/\D/g, '');
}

function extractViewState(html) {
  const match = String(html || '').match(/name="javax\.faces\.ViewState"[^>]*value="([^"]*)"/i);
  return match ? match[1] : '';
}

function parseSetCookieHeader(response) {
  try {
    let cookieList = [];

    if (typeof response?.headers?.getSetCookie === 'function') {
      cookieList = response.headers.getSetCookie();
    } else if (typeof response?.headers?.raw === 'function') {
      cookieList = response.headers.raw()['set-cookie'] || [];
    } else {
      const singleCookie = response?.headers?.get ? response.headers.get('set-cookie') : '';
      if (singleCookie) {
        cookieList = [singleCookie];
      }
    }

    if (!Array.isArray(cookieList) || !cookieList.length) return '';
    return cookieList.map((cookie) => String(cookie).split(';')[0]).join('; ');
  } catch (error) {
    return '';
  }
}

function parseSiagSearchRows(html) {
  const tbodyMatch = String(html || '').match(/<tbody[^>]*id="form_PesquisaItemPageList:editalDataTable:tb"[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];

  const rows = [];
  const rowRegex = /<tr\b[\s\S]*?<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
    const rowHtml = rowMatch[0];

    const indexMatch = rowHtml.match(/editalDataTable:(\d+):/i);
    const codeMatch = rowHtml.match(/idItemCompraText"[^>]*>([\s\S]*?)<\/span>/i);
    const descMatch = rowHtml.match(/descResumidaItemCompraText"[^>]*>([\s\S]*?)<\/span>/i);
    const idItemCompraMatch = rowHtml.match(/'idItemCompra':'([^']+)'/i);

    rows.push({
      index: indexMatch ? Number(indexMatch[1]) : 0,
      codigo: cleanHtmlText(codeMatch ? codeMatch[1] : ''),
      descricaoResumida: cleanHtmlText(descMatch ? descMatch[1] : ''),
      idItemCompra: idItemCompraMatch ? idItemCompraMatch[1] : '',
    });
  }

  return rows.filter((row) => row.codigo && row.idItemCompra);
}

async function fetchSiagItemByCode(code) {
  const lookupCode = String(code || '').trim();
  if (!lookupCode) {
    throw new Error('Código SIAG não informado.');
  }

  const initialResponse = await fetchApi(SIAG_ITEM_LIST_URL, { method: 'GET' });
  if (!initialResponse.ok) {
    throw new Error(`Falha ao carregar página de pesquisa SIAG (${initialResponse.status}).`);
  }

  const initialHtml = await initialResponse.text();
  const viewState = extractViewState(initialHtml);
  if (!viewState) {
    throw new Error('Não foi possível iniciar sessão de consulta SIAG.');
  }

  let cookieHeader = parseSetCookieHeader(initialResponse);

  const searchParams = new URLSearchParams();
  searchParams.set('form_PesquisaItemPageList', 'form_PesquisaItemPageList');
  searchParams.set('form_PesquisaItemPageList:procurarPorCombo', '1');
  searchParams.set('form_PesquisaItemPageList:palavraChaveInput', lookupCode);
  searchParams.set('form_PesquisaItemPageList:pesquisarButton', 'Pesquisar');
  searchParams.set('javax.faces.ViewState', viewState);

  const searchResponse = await fetchApi(SIAG_ITEM_LIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: searchParams.toString(),
  });

  if (!searchResponse.ok) {
    throw new Error(`Falha na pesquisa SIAG (${searchResponse.status}).`);
  }

  const searchHtml = await searchResponse.text();
  const searchRows = parseSiagSearchRows(searchHtml);
  if (!searchRows.length || /Nenhum\s+registro\s+encontrado/i.test(searchHtml)) {
    return null;
  }

  cookieHeader = parseSetCookieHeader(searchResponse) || cookieHeader;
  const normalizedLookup = normalizeSiagCode(lookupCode);

  const selectedRow = searchRows.find((row) => normalizeSiagCode(row.codigo) === normalizedLookup)
    || searchRows.find((row) => String(row.codigo || '').trim() === lookupCode)
    || searchRows[0];

  const searchViewState = extractViewState(searchHtml);
  if (!searchViewState) {
    return {
      codigo: selectedRow.codigo,
      descricao: selectedRow.descricaoResumida,
      unidadeMedida: '',
      situacao: '',
      fonte: 'SIAG',
    };
  }

  const detailParams = new URLSearchParams();
  detailParams.set('form_PesquisaItemPageList', 'form_PesquisaItemPageList');
  detailParams.set('form_PesquisaItemPageList:procurarPorCombo', '1');
  detailParams.set('form_PesquisaItemPageList:palavraChaveInput', lookupCode);
  detailParams.set(`form_PesquisaItemPageList:editalDataTable:${selectedRow.index}:abriDetalhesLink`, `form_PesquisaItemPageList:editalDataTable:${selectedRow.index}:abriDetalhesLink`);
  detailParams.set('idItemCompra', selectedRow.idItemCompra);
  detailParams.set('javax.faces.ViewState', searchViewState);

  const detailResponse = await fetchApi(SIAG_ITEM_LIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: detailParams.toString(),
  });

  if (!detailResponse.ok) {
    return {
      codigo: selectedRow.codigo,
      descricao: selectedRow.descricaoResumida,
      unidadeMedida: '',
      situacao: '',
      fonte: 'SIAG',
    };
  }

  const detailHtml = await detailResponse.text();
  const descricaoMatch = detailHtml.match(/id="form1:descricaoItemText"[^>]*>([\s\S]*?)<\/span>/i);
  const unidadeMatch = detailHtml.match(/id="form1:unidadeText"[^>]*>([\s\S]*?)<\/span>/i);
  const situacaoMatch = detailHtml.match(/id="form1:situacaoText"[^>]*>([\s\S]*?)<\/span>/i);

  return {
    codigo: selectedRow.codigo,
    descricao: cleanHtmlText(descricaoMatch ? descricaoMatch[1] : selectedRow.descricaoResumida),
    unidadeMedida: cleanHtmlText(unidadeMatch ? unidadeMatch[1] : ''),
    situacao: cleanHtmlText(situacaoMatch ? situacaoMatch[1] : ''),
    fonte: 'SIAG',
  };
}

// As senhas são persistidas como hash para compatibilidade com o esquema PostgreSQL.

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

function parseCorsOrigins() {
  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://2001diegodeoliveira-svg.github.io',
    'https://sistema-geral-copal.vercel.app',
  ];

  const fromEnv = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...defaults, ...fromEnv])];
}

const allowedOrigins = parseCorsOrigins();

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);
    const host = String(parsedOrigin.hostname || '').toLowerCase();
    return host.endsWith('.vercel.app') || host === 'vercel.app';
  } catch (error) {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    // Permite ferramentas sem Origin (curl/postman/health-checks internos).
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origem não permitida por CORS: ${origin}`));
  },
  credentials: false,
}));

app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(FRONTEND_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'introdução.html'));
});

app.get('/login.html.html', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'cadastrouser.html.html'));
});

app.get('/api/requisition-consumption', async (req, res) => {
  try {
    const rows = await db.all(
      'SELECT req_contract_num, req_unit_demand, req_items FROM requisitions ORDER BY id ASC'
    );
    res.json({
      requisitions: (rows || []).map((row) => ({
        contractNumber: row.req_contract_num || '',
        unitCode: row.req_unit_demand || '',
        items: safeJsonParse(row.req_items, []),
      })),
    });
  } catch (error) {
    console.error('Falha ao carregar consumo das requisições:', error);
    res.status(500).json({ message: 'Não foi possível carregar o consumo dos contratos.' });
  }
});

app.get('/api/requisition-history', async (req, res) => {
  try {
    const contractNumber = String(req.query.contract || '').trim();
    const requestedUnit = String(req.query.unit || '').trim();

    if (!contractNumber) {
      return res.status(400).json({ message: 'Contrato obrigatório para consultar o histórico.' });
    }

    let sql = `
      SELECT id, req_number_year, req_issue_date, req_unit_demand, requester_name, requester_matricula,
             requester_email, req_contract_num, req_items, email_status, created_at
      FROM requisitions
      WHERE lower(trim(req_contract_num)) = lower(trim(?))
    `;
    const params = [contractNumber];

    if (requestedUnit) {
      sql += ' AND lower(trim(req_unit_demand)) = lower(trim(?))';
      params.push(requestedUnit);
    }

    sql += ' ORDER BY created_at DESC';

    const rows = await db.all(sql, params);

    res.json({
      requisitions: (rows || []).map((row) => ({
        id: row.id,
        number: row.req_number_year || '-',
        issueDate: row.req_issue_date || '',
        unit: row.req_unit_demand || '-',
        requester: row.requester_name || '-',
        matricula: row.requester_matricula || '-',
        email: row.requester_email || '-',
        status: row.email_status || 'pendente',
        items: safeJsonParse(row.req_items, []),
        createdAt: row.created_at || null,
      })),
    });
  } catch (error) {
    console.error('Falha ao carregar histórico de requisições:', error);
    res.status(500).json({ message: 'Não foi possível carregar o histórico de requisições.' });
  }
});

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function sanitizeFileNamePart(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'arquivo';
}

const DEV_TOKEN = 'dev-access-token';

async function initDatabase() {
  const schemaPath = path.join(__dirname, 'database', 'schema.sql');
  const seedPath = path.join(__dirname, 'database', 'seed.sql');

  async function executeSqlFile(sqlFilePath) {
    const rawSql = fs.readFileSync(sqlFilePath, 'utf-8');
    const cleanSql = rawSql.replace(/^--.*$/gm, '');
    const statements = cleanSql
      .split(';')
      .map(statement => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await db.query(statement);
    }
  }

  await executeSqlFile(schemaPath);
  await executeSqlFile(seedPath);
}

function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const normalized = email.toLowerCase().trim();
    db.get(
      'SELECT * FROM users WHERE lower(email) = ? OR lower(name) = ? LIMIT 1',
      [normalized, normalized],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

function getUserByLoginIdentifier(identifier) {
  return new Promise((resolve, reject) => {
    const normalized = String(identifier || '').toLowerCase().trim();
    db.get(
      'SELECT * FROM users WHERE lower(email) = ? OR lower(name) = ? OR lower(matricula) = ? LIMIT 1',
      [normalized, normalized, normalized],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

function getSessionByToken(token) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT sessions.token, sessions.user_id, users.email, users.name, users.matricula, users.cpf, users.phone, users.cargo, users.role, users.unidade, users.perfil, users.status, users.can_view_overview, users.background_image, users.access_level, users.account_status, users.permissions_json
       FROM sessions
       JOIN users ON sessions.user_id = users.id
       WHERE sessions.token = ?`,
      [token],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.replace('Bearer ', '').trim();
}

async function authenticateToken(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ message: 'Token de autenticação ausente.' });
  }

  const session = await getSessionByToken(token);
  if (!session) {
    return res.status(401).json({ message: 'Sessão inválida.' });
  }

  req.user = session;
  touchSessionLastSeen(token);
  next();
}

function authorizeAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'developer' && req.user.role !== 'admin')) {
    return res.status(403).json({ message: 'Acesso negado.' });
  }
  next();
}

app.post('/auth/register', async (req, res) => {
  const {
    email,
    password,
    name,
    unidade,
    perfil,
    role,
    canViewOverview,
    accessLevel,
    accountStatus,
    permissions,
    cpf,
    matricula,
    birthDate,
    phone,
    cargo,
    expirationDate,
    observacoes
  } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const otpCode = generateOtp();
    const otpExpires = Date.now() + 15 * 60 * 1000;
    const passwordHash = await hashPasswordSecure(password);
    const registrationRole = role === 'admin' || role === 'developer' ? 'user' : (role || 'user');
    const permissionsJson = JSON.stringify(safeJsonParse(permissions, {}));
    const normalizedAccountStatus = (accountStatus || 'ativo').toString().toLowerCase();

    db.run(
      'INSERT INTO users (email, password_hash, name, role, unidade, perfil, status, verified, can_view_overview, access_level, account_status, permissions_json, otp_code, otp_expires, cpf, matricula, birthDate, phone, cargo, expirationDate, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        email.toLowerCase(),
        passwordHash,
        name || '',
        registrationRole,
        unidade || '',
        perfil || '',
        'Pendente',
        0,
        canViewOverview ? 1 : 0,
        accessLevel || '',
        normalizedAccountStatus,
        permissionsJson,
        otpCode,
        otpExpires,
        cpf || '',
        matricula || '',
        birthDate || '',
        phone || '',
        cargo || '',
        expirationDate || '',
        observacoes || '',
      ],
      function (err) {
        if (err) {
          if (err.code === '23505') {
            return res.status(400).json({ message: 'E-mail já cadastrado.' });
          }
          return res.status(500).json({ message: 'Erro interno no servidor.' });
        }

        writeAuditLog(this.lastID, 'user_register', 'user', this.lastID, { email: email.toLowerCase(), name: name || '' });
        return res.json({
          message: 'Cadastro realizado com sucesso. Verifique o código enviado por e-mail.',
          devOtpCode: otpCode,
        });
      }
    );
  } catch (error) {
    return res.status(500).json({ message: 'Erro interno no servidor.' });
  }
});

app.post('/auth/verify-otp', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ message: 'E-mail e código são obrigatórios.' });
  }

  const user = await getUserByEmail(email.toLowerCase());
  if (!user || user.otp_code !== code || !user.otp_expires || user.otp_expires < Date.now()) {
    return res.status(400).json({ message: 'Código inválido ou expirado.' });
  }

  db.run(
    'UPDATE users SET verified = TRUE, otp_code = NULL, otp_expires = NULL WHERE id = ?',
    [user.id],
    (err) => {
      if (err) {
        return res.status(500).json({ message: 'Erro interno no servidor.' });
      }
      return res.json({ message: 'Conta verificada com sucesso.' });
    }
  );
});

app.post('/auth/resend-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'E-mail é obrigatório.' });
  }

  const user = await getUserByEmail(email.toLowerCase());
  if (!user) {
    return res.status(404).json({ message: 'Usuário não encontrado.' });
  }

  if (user.verified) {
    return res.status(400).json({ message: 'Conta já verificada.' });
  }

  const otpCode = generateOtp();
  const otpExpires = Date.now() + 15 * 60 * 1000;

  db.run(
    'UPDATE users SET otp_code = ?, otp_expires = ? WHERE id = ?',
    [otpCode, otpExpires, user.id],
    (err) => {
      if (err) {
        return res.status(500).json({ message: 'Erro interno no servidor.' });
      }
      return res.json({
        message: 'Novo código enviado para o e-mail.',
        devOtpCode: otpCode,
      });
    }
  );
});

app.post('/auth/login', async (req, res) => {
  const { email, matricula, password } = req.body;
  const loginIdentifier = String(matricula || email || '').trim();
  const normalizedIdentifier = loginIdentifier.toLowerCase();

  if (!loginIdentifier || !password) {
    return res.status(400).json({ message: 'Matrícula (ou e-mail) e senha são obrigatórios.' });
  }

  if (normalizedIdentifier === ADMIN_BOOTSTRAP_LOGIN && password === ADMIN_BOOTSTRAP_PASSWORD) {
    const adminUser = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM users
         WHERE lower(role) = 'admin' AND lower(coalesce(account_status, 'ativo')) = 'ativo'
         ORDER BY id ASC
         LIMIT 1`,
        [],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });

    if (!adminUser) {
      return res.status(401).json({ message: 'Administrador não configurado no sistema.' });
    }

    const token = generateToken();
    db.run(
      'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)',
      [token, adminUser.id, Date.now()],
      (err) => {
        if (err) {
          return res.status(500).json({ message: 'Erro interno no servidor.' });
        }

        return res.json({
          accessToken: token,
          user: {
            email: adminUser.email,
            matricula: adminUser.matricula || null,
            cpf: adminUser.cpf || null,
            name: adminUser.name,
            phone: adminUser.phone || null,
            cargo: adminUser.cargo || null,
            role: adminUser.role || 'admin',
            unidade: adminUser.unidade || null,
            perfil: adminUser.perfil || null,
            status: adminUser.status || null,
            accessLevel: adminUser.access_level || null,
            accountStatus: adminUser.account_status || null,
            permissions: safeJsonParse(adminUser.permissions_json, {}),
            canViewOverview: !!adminUser.can_view_overview,
            backgroundImage: adminUser.background_image || null,
          },
        });
      }
    );
    return;
  }

  const user = await getUserByLoginIdentifier(loginIdentifier);
  if (!user) {
    detectSuspiciousLogin(loginIdentifier, getClientIp(req), false);
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  if ((user.account_status || 'ativo').toLowerCase() !== 'ativo') {
    return res.status(403).json({ message: 'Conta inativa. Fale com o administrador.' });
  }

  const passwordMatches = await verifyPasswordSecure(password, user.password_hash);
  if (!passwordMatches) {
    detectSuspiciousLogin(loginIdentifier, getClientIp(req), false);
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  if (!isBcryptHash(user.password_hash)) {
    const upgradedHash = await hashPasswordSecure(password);
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [upgradedHash, user.id]);
  }

  if (!user.verified) {
    return res.status(403).json({ message: 'Conta não verificada. Confirme o código enviado por e-mail.' });
  }

  if (String(user.status || '').toLowerCase() !== 'aprovado') {
    return res.status(403).json({ message: 'Cadastro pendente de aprovação do administrador.' });
  }

  const resolvedRole = (String(user.role || '').toLowerCase() === 'admin' || String(user.role || '').toLowerCase() === 'developer')
    ? user.role
    : (String(user.email || '').toLowerCase() === 'adm@copal' || String(user.matricula || '').toLowerCase() === 'adm@copal'
      ? 'admin'
      : user.role || 'user');

  const token = generateToken();
  db.run(
    'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)',
    [token, user.id, Date.now()],
    (err) => {
      if (err) {
        return res.status(500).json({ message: 'Erro interno no servidor.' });
      }

      return res.json({
        accessToken: token,
        user: {
          email: user.email,
          matricula: user.matricula || null,
          cpf: user.cpf || null,
          name: user.name,
          phone: user.phone || null,
          cargo: user.cargo || null,
          role: resolvedRole,
          unidade: user.unidade || null,
          perfil: user.perfil || null,
          status: user.status || null,
          accessLevel: user.access_access_level || null,
          accountStatus: user.account_status || null,
          permissions: safeJsonParse(user.permissions_json, {}),
          canViewOverview: !!user.can_view_overview,
          backgroundImage: user.background_image || null,
        },
      });
    }
  );
});

app.get('/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ message: 'Token de autenticação ausente.' });
  }

  const session = await getSessionByToken(token);
  if (!session) {
    return res.status(401).json({ message: 'Sessão inválida.' });
  }

  res.json({ user: {
    email: session.email,
    matricula: session.matricula,
    cpf: session.cpf,
    name: session.name,
    phone: session.phone,
    cargo: session.cargo,
    role: session.role,
    unidade: session.unidade,
    perfil: session.perfil,
    status: session.status,
    accessLevel: session.access_level,
    accountStatus: session.account_status,
    permissions: safeJsonParse(session.permissions_json, {}),
    canViewOverview: !!session.can_view_overview,
    backgroundImage: session.background_image,
  }});
});

app.post('/api/request-requisition-code', async (req, res) => {
  const { requesterName, requesterMatricula, requesterEmail } = req.body;
  if (!requesterName || !requesterMatricula || !requesterEmail) {
    return res.status(400).json({ message: 'Nome, matrícula e e-mail do servidor são obrigatórios.' });
  }

  const code = generateOtp();
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const createdAt = Date.now();

  try {
    await runQuery(
      db,
      'INSERT INTO requisition_codes (requester_email, requester_name, requester_matricula, code, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [requesterEmail.toLowerCase(), requesterName, requesterMatricula, code, expiresAt, createdAt]
    );

    const emailInfo = await sendEmail({
      to: requesterEmail,
      subject: 'Código de validação de requisição - COPAL SESP',
      text: `Olá ${requesterName},

Seu código temporário de validação de requisição é: ${code}
Matrícula: ${requesterMatricula}

Use este código para validar a requisição e enviar o documento à empresa contratada.
O código expira em 15 minutos.

Atenciosamente,
COPAL SESP`,
    });

    const emailDebugInfo = extractEmailDebugInfo(emailInfo);

    return res.json({
      message: 'Código temporário enviado ao e-mail do servidor.',
      devOtpCode: code,
      ...(emailDebugInfo ? { emailPreview: emailDebugInfo } : {}),
    });
  } catch (error) {
    console.error('Erro ao enviar código de requisição:', error);
    return res.status(500).json({ message: 'Falha ao enviar o e-mail de validação. Verifique a configuração de SMTP.' });
  }
});

app.get('/api/requisition-next-number', async (req, res) => {
  const contractNumber = String(req.query.contract || '').trim();
  if (!contractNumber) return res.status(400).json({ message: 'Contrato é obrigatório.' });

  const row = await getQuery(
    db,
    'SELECT COUNT(*) AS total FROM requisitions WHERE lower(trim(req_contract_num)) = lower(trim(?))',
    [contractNumber]
  );
  const nextNumber = Number(row?.total || 0) + 1;
  res.json({ number: `${String(nextNumber).padStart(3, '0')}/${new Date().getFullYear()}` });
});

app.post('/api/submit-requisition', upload.single('pdfAttachment'), async (req, res) => {
  let {
    reqNumberYear,
    reqUnitDemand,
    reqContractNum,
    reqIssueDate,
    reqCompany,
    reqCompanyEmail,
    reqCnpj,
    reqDeadlineDays,
    reqDaysType,
    reqAddress,
    reqBusinessHours,
    reqFiscalName,
    reqFiscalPhone,
    reqRequesterName,
    reqRequesterMatricula,
    reqRequesterEmail,
    reqVerificationCode,
    reqItems,
    reqLatitude,
    reqLongitude,
    reqLocationAccuracy,
  } = req.body;

  if (!reqRequesterName || !reqRequesterMatricula || !reqRequesterEmail) {
    return res.status(400).json({ message: 'Dados do servidor são obrigatórios.' });
  }

  let parsedItems;
  try {
    parsedItems = JSON.parse(reqItems || '[]');
  } catch (error) {
    return res.status(400).json({ message: 'Itens da requisição inválidos.' });
  }
  if (!Array.isArray(parsedItems) || !parsedItems.length) {
    return res.status(400).json({ message: 'Selecione ao menos um item do contrato.' });
  }

  const latitude = Number(reqLatitude);
  const longitude = Number(reqLongitude);
  const locationAccuracy = String(reqLocationAccuracy || '').trim() ? Number(reqLocationAccuracy) : null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: 'A localização do assinante é obrigatória para emitir a requisição.' });
  }

  const contract = await getQuery(
    contractsDb,
    'SELECT numContrato, unidades, razaoSocial, nomeFantasia, credor, emailEmpresa, cnpj, prazoEntrega, formaContagem FROM contracts WHERE lower(trim(numContrato)) = lower(trim(?))',
    [reqContractNum || '']
  );
  if (!contract) return res.status(404).json({ message: 'Contrato não encontrado.' });
  reqCompany = contract.razaoSocial || contract.nomeFantasia || contract.credor || '';
  reqCompanyEmail = contract.emailEmpresa || '';
  reqCnpj = contract.cnpj || '';
  reqDeadlineDays = contract.prazoEntrega || '';
  reqDaysType = String(contract.formaContagem || '').toLowerCase().includes('ú') || String(contract.formaContagem || '').toLowerCase().includes('ut') ? 'úteis' : 'corridos';
  reqIssueDate = new Date().toISOString().slice(0, 10);
  const contractUnits = safeJsonParse(contract.unidades, []);
  const unitData = contractUnits.find((entry) => normalizeUnitCodeServer(entry?.unidade || entry) === normalizeUnitCodeServer(reqUnitDemand));
  const allocatedItems = Array.isArray(unitData?.itensDetalhados) ? unitData.itensDetalhados : [];
  if (!unitData || !allocatedItems.length) return res.status(400).json({ message: 'A unidade não possui itens disponíveis neste contrato.' });

  const previousNumberRow = await getQuery(
    db,
    'SELECT COUNT(*) AS total FROM requisitions WHERE lower(trim(req_contract_num)) = lower(trim(?))',
    [reqContractNum || '']
  );
  const automaticReqNumber = `${String(Number(previousNumberRow?.total || 0) + 1).padStart(3, '0')}/${new Date().getFullYear()}`;

  const previousRows = await db.all('SELECT req_items, req_unit_demand FROM requisitions WHERE lower(trim(req_contract_num)) = lower(trim(?))', [reqContractNum || '']);
  const consumed = {};
  for (const row of previousRows || []) {
    if (normalizeUnitCodeServer(row.req_unit_demand) !== normalizeUnitCodeServer(reqUnitDemand)) continue;
    for (const item of safeJsonParse(row.req_items, [])) consumed[item.itemIndex] = (consumed[item.itemIndex] || 0) + Number(item.quantity || 0);
  }
  for (const item of parsedItems) {
    const index = Number(item.itemIndex);
    const quantity = Number(item.quantity);
    const allocation = allocatedItems[index];
    const available = Number(allocation?.quantidade || 0) - (consumed[index] || 0);
    if (!Number.isInteger(index) || !allocation || !Number.isFinite(quantity) || quantity <= 0 || quantity > available) {
      return res.status(400).json({ message: `Quantidade inválida ou acima do saldo disponível para ${allocation?.loteNome || `item ${index + 1}`}. Saldo: ${Math.max(0, available)}.` });
    }
  }

  const stored = reqVerificationCode ? await getQuery(
    db,
    'SELECT * FROM requisition_codes WHERE requester_email = ? ORDER BY id DESC LIMIT 1',
    [reqRequesterEmail.toLowerCase()]
  ) : null;

  if (!reqVerificationCode || !stored || stored.code !== reqVerificationCode || stored.used_at || Date.now() > stored.expires_at) {
    return res.status(400).json({ message: 'Código de validação inválido ou expirado.' });
  }

  const companyRecipients = parseEmailRecipients(reqCompanyEmail);
  if (!companyRecipients.length) {
    return res.status(400).json({ message: 'E-mail da empresa contratada é obrigatório.' });
  }
  if (companyRecipients.join(';') !== String(reqCompanyEmail || '').split(/[;,\s]+/).map((email) => email.trim().toLowerCase()).filter(Boolean).join(';')) {
    return res.status(400).json({ message: 'Informe somente e-mails válidos, separados por vírgula ou ponto e vírgula.' });
  }

  const pdfAttachmentName = req.file ? req.file.originalname : '';
  const pdfAttachmentPath = req.file ? req.file.path : '';
  let requisitionRecordId = null;

  const requisitionBody = `Requisição Nº: ${automaticReqNumber}\n` +
    `Unidade Demandante: ${reqUnitDemand || 'N/A'}\n` +
    `Contrato Nº: ${reqContractNum || 'N/A'}\n` +
    `Data da Emissão: ${reqIssueDate || 'N/A'}\n` +
    `Contratada: ${reqCompany || 'N/A'}\n` +
    `CNPJ: ${reqCnpj || 'N/A'}\n` +
    `E-mail da Contratada: ${reqCompanyEmail}\n` +
    `Prazo: ${reqDeadlineDays || 'N/A'} ${reqDaysType || ''}\n` +
    `Endereço de Entrega: ${reqAddress || 'N/A'}\n` +
    `Horário Comercial: ${reqBusinessHours || 'N/A'}\n` +
    `Fiscal do Contrato: ${reqFiscalName || 'N/A'}\n` +
    `Telefone do Fiscal: ${reqFiscalPhone || 'N/A'}\n` +
    `Servidor Solicitante: ${reqRequesterName} (Matrícula: ${reqRequesterMatricula})\n` +
    `Validação por código enviado ao e-mail do servidor: realizada\n` +
    `Localização da assinatura: ${latitude.toFixed(7)}, ${longitude.toFixed(7)} (precisão aproximada: ${Number.isFinite(locationAccuracy) ? `${Math.round(locationAccuracy)} m` : 'não informada'})\n` +
    `Itens solicitados: ${JSON.stringify(parsedItems)}\n`;

  const emailHtml = `
    <h2>Requisição de Materiais e/ou Serviços</h2>
    <p><strong>Requisição Nº:</strong> ${automaticReqNumber}</p>
    <p><strong>Unidade Demandante:</strong> ${reqUnitDemand || 'N/A'}</p>
    <p><strong>Contrato Nº:</strong> ${reqContractNum || 'N/A'}</p>
    <p><strong>Data da Emissão:</strong> ${reqIssueDate || 'N/A'}</p>
    <p><strong>Contratada:</strong> ${reqCompany || 'N/A'}</p>
    <p><strong>CNPJ:</strong> ${reqCnpj || 'N/A'}</p>
    <p><strong>E-mail da Contratada:</strong> ${reqCompanyEmail}</p>
    <p><strong>Prazo:</strong> ${reqDeadlineDays || 'N/A'} ${reqDaysType || ''}</p>
    <p><strong>Endereço de Entrega:</strong> ${reqAddress || 'N/A'}</p>
    <p><strong>Horário Comercial:</strong> ${reqBusinessHours || 'N/A'}</p>
    <p><strong>Fiscal do Contrato:</strong> ${reqFiscalName || 'N/A'}</p>
    <p><strong>Telefone do Fiscal:</strong> ${reqFiscalPhone || 'N/A'}</p>
    <p><strong>Servidor Solicitante:</strong> ${reqRequesterName} (Matrícula: ${reqRequesterMatricula})</p>
    <p><strong>Validação por código enviado ao e-mail do servidor:</strong> realizada</p>
    <p><strong>Localização da assinatura:</strong> ${latitude.toFixed(7)}, ${longitude.toFixed(7)}${Number.isFinite(locationAccuracy) ? ` (precisão aproximada: ${Math.round(locationAccuracy)} m)` : ''}</p>
  `;

  const attachments = [];
  if (req.file) {
    attachments.push({
      filename: req.file.originalname,
      path: req.file.path,
      contentType: 'application/pdf',
    });
  }

  try {
    const requisitionInsert = await runQuery(
      db,
      `INSERT INTO requisitions (
        req_number_year,
        req_unit_demand,
        req_contract_num,
        req_issue_date,
        req_company,
        req_company_email,
        req_cnpj,
        req_deadline_days,
        req_days_type,
        req_address,
        req_business_hours,
        req_fiscal_name,
        req_fiscal_phone,
        requester_name,
        requester_matricula,
        requester_email,
        verification_code,
        pdf_attachment_name,
        pdf_attachment_path,
        email_subject,
        email_text,
        email_html,
        email_status,
        email_error,
        created_at,
        code_id,
        req_items,
        signer_latitude,
        signer_longitude,
        signer_accuracy,
        signer_location_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?)` ,
      [
        automaticReqNumber,
        reqUnitDemand || '',
        reqContractNum || '',
        reqIssueDate || '',
        reqCompany || '',
        reqCompanyEmail || '',
        reqCnpj || '',
        reqDeadlineDays || '',
        reqDaysType || '',
        reqAddress || '',
        reqBusinessHours || '',
        reqFiscalName || '',
        reqFiscalPhone || '',
        reqRequesterName,
        reqRequesterMatricula,
        reqRequesterEmail,
        reqVerificationCode,
        pdfAttachmentName,
        pdfAttachmentPath,
        `Requisição ${automaticReqNumber} - ${reqCompany}`,
        requisitionBody,
        emailHtml,
        'pending',
        '',
        Date.now(),
        stored?.id || null,
        JSON.stringify(parsedItems),
        latitude,
        longitude,
        Number.isFinite(locationAccuracy) ? locationAccuracy : null,
        Date.now(),
      ]
    );
    requisitionRecordId = requisitionInsert.lastID;

    await sendEmail({
      to: companyRecipients,
      subject: `Requisição ${automaticReqNumber} - ${reqCompany}`,
      text: requisitionBody,
      html: emailHtml,
      attachments,
    });

    await runQuery(db, 'UPDATE requisitions SET email_status = ?, sent_at = ?, email_error = ? WHERE id = ?', ['sent', Date.now(), '', requisitionRecordId]);
    if (stored?.id) {
      await runQuery(db, 'UPDATE requisition_codes SET used_at = ? WHERE id = ?', [Date.now(), stored.id]);
    }

    writeAuditLog(req.user?.user_id, 'requisition_submit', 'requisition', requisitionRecordId, { reqNumberYear: automaticReqNumber, reqCompany: reqCompany || '', reqRequesterName });
    return res.json({ message: 'Requisição validada e enviada para o e-mail da empresa contratada.' });
  } catch (error) {
    console.error('Erro ao enviar requisição para a empresa:', error);
    try {
      if (requisitionRecordId) {
        await runQuery(db, 'UPDATE requisitions SET email_status = ?, email_error = ? WHERE id = ?', ['failed', error.message || 'Falha no envio do e-mail.', requisitionRecordId]);
      }
    } catch (persistError) {
      console.error('Erro ao registrar falha da requisição:', persistError);
    }
    return res.status(500).json({ message: 'Falha ao enviar a requisição por e-mail. Verifique a configuração de SMTP e o anexo PDF.' });
  }
});

app.get('/auth/users', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ message: 'Token de autenticação ausente.' });
  }

  const session = await getSessionByToken(token);
  if (!(session && (session.role === 'developer' || session.role === 'admin')) && token !== DEV_TOKEN) {
    return res.status(403).json({ message: 'Acesso negado.' });
  }

  db.all(
    'SELECT id, email, name, matricula, role, unidade, perfil, access_level, account_status, status, verified, permissions_json, background_image FROM users ORDER BY id DESC',
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Erro ao buscar usuários.' });
      }
      return res.json({ users: rows });
    }
  );
});

app.get('/api/work-users', authenticateToken, async (req, res) => {
  db.all(
    `SELECT id, name, email, matricula, role, cargo, unidade
     FROM users
     WHERE lower(coalesce(account_status, 'ativo')) = 'ativo'
       AND lower(coalesce(status, 'aprovado')) = 'aprovado'
     ORDER BY name COLLATE NOCASE ASC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Erro ao buscar usuários do chat.' });
      }
      return res.json({ users: rows || [] });
    }
  );
});

app.put('/auth/users/:id/revoke-access', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;

  db.get('SELECT id, role, name, email FROM users WHERE id = ?', [id], (findErr, user) => {
    if (findErr) {
      return res.status(500).json({ message: 'Erro ao localizar usuário.' });
    }

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const role = String(user.role || '').toLowerCase();
    if (role === 'admin' || role === 'developer') {
      return res.status(403).json({ message: 'Não é permitido remover acesso de administrador.' });
    }

    if (String(req.user.user_id) === String(user.id)) {
      return res.status(400).json({ message: 'Você não pode remover o próprio acesso.' });
    }

    db.run(
      'UPDATE users SET account_status = ?, status = ? WHERE id = ?',
      ['inativo', 'Inativo', id],
      function (updateErr) {
        if (updateErr) {
          return res.status(500).json({ message: 'Erro ao remover acesso do usuário.' });
        }

        writeAuditLog(req.user?.user_id, 'user_revoke', 'user', id, { name: user.name, email: user.email });
        return res.json({
          success: true,
          message: 'Acesso do usuário removido com sucesso.',
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            account_status: 'inativo',
            status: 'Inativo',
          },
        });
      }
    );
  });
});

app.put('/auth/users/:id/permissions', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const incomingPermissions = req.body?.permissions;
  const parsedPermissions = safeJsonParse(incomingPermissions, {});
  const permissionsJson = JSON.stringify(parsedPermissions || {});
  const canViewOverview = !!(req.body?.canViewOverview || parsedPermissions?.visaoGeral);

  db.get('SELECT id, role, name, email FROM users WHERE id = ?', [id], (findErr, user) => {
    if (findErr) {
      return res.status(500).json({ message: 'Erro ao localizar usuário.' });
    }

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const role = String(user.role || '').toLowerCase();
    if (role === 'admin' || role === 'developer') {
      return res.status(403).json({ message: 'Não é permitido editar permissões de administrador.' });
    }

    db.run(
      'UPDATE users SET permissions_json = ?, can_view_overview = ? WHERE id = ?',
      [permissionsJson, canViewOverview ? 1 : 0, id],
      function (updateErr) {
        if (updateErr) {
          return res.status(500).json({ message: 'Erro ao atualizar permissões do usuário.' });
        }

        writeAuditLog(req.user?.user_id, 'user_permissions', 'user', id, { name: user.name, email: user.email, permissions: parsedPermissions });
        return res.json({
          success: true,
          message: 'Permissões atualizadas com sucesso.',
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            canViewOverview,
            permissions: parsedPermissions,
          },
        });
      }
    );
  });
});

app.post('/auth/upload-background', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Arquivo não enviado.' });
  }

  const extension = path.extname(req.file.originalname).toLowerCase();
  const newFilename = `bg-${Date.now()}${extension}`;
  const destination = path.join(UPLOAD_DIR, newFilename);

  fs.rename(req.file.path, destination, (err) => {
    if (err) {
      return res.status(500).json({ message: 'Erro ao salvar o arquivo.' });
    }

    const publicPath = `/uploads/${newFilename}`;
    db.run(
      'UPDATE users SET background_image = ? WHERE id = ?',
      [publicPath, req.user.user_id],
      (updateErr) => {
        if (updateErr) {
          return res.status(500).json({ message: 'Erro ao atualizar o usuário.' });
        }
        return res.json({ backgroundImage: publicPath });
      }
    );
  });
});

app.post('/api/contracts/upload-attachment', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Arquivo não enviado.' });
  }

  const contractNumber = sanitizeFileNamePart(req.body?.numContrato || 'contrato');
  const contractsUploadDir = path.join(UPLOAD_DIR, 'contracts');
  if (!fs.existsSync(contractsUploadDir)) {
    fs.mkdirSync(contractsUploadDir, { recursive: true });
  }

  const extension = path.extname(req.file.originalname || '').toLowerCase() || (req.file.mimetype === 'application/pdf' ? '.pdf' : '');
  const fileName = `${contractNumber}-${Date.now()}${extension}`;
  const destination = path.join(contractsUploadDir, fileName);

  fs.rename(req.file.path, destination, (err) => {
    if (err) {
      return res.status(500).json({ message: 'Erro ao salvar o arquivo.' });
    }

    return res.json({
      arquivoContrato: `/uploads/contracts/${fileName}`,
      arquivoOriginal: req.file.originalname || fileName,
      tipoArquivo: req.file.mimetype || '',
    });
  });
});

app.get('/api/siag/item/:codigo', async (req, res) => {
  const codigo = String(req.params?.codigo || '').trim();
  if (!codigo) {
    return res.status(400).json({ message: 'Código SIAG é obrigatório.' });
  }

  try {
    const item = await fetchSiagItemByCode(codigo);
    if (!item) {
      return res.status(404).json({ message: 'Item SIAG não encontrado.' });
    }

    return res.json(item);
  } catch (error) {
    console.error('[SIAG] Falha ao consultar item:', error?.message || error);
    return res.status(502).json({ message: 'Falha ao consultar o SIAG no momento.' });
  }
});

app.get('/api/contacts', async (req, res) => {
  db.all('SELECT * FROM contacts ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar contatos.' });
    res.json({ contacts: rows });
  });
});

app.post('/api/contacts', async (req, res) => {
  const { unidade, setor, telefone, ramal } = req.body;
  if (!unidade || !setor || !telefone) {
    return res.status(400).json({ message: 'Unidade, setor e telefone são obrigatórios.' });
  }
  db.run(
    'INSERT INTO contacts (unidade, setor, telefone, ramal) VALUES (?, ?, ?, ?)',
    [unidade, setor, telefone, ramal || ''],
    function (err) {
      if (err) return res.status(500).json({ message: 'Erro ao criar contato.' });
      writeAuditLog(req.user?.user_id, 'contact_create', 'contact', this.lastID, { unidade, setor, telefone });
      res.json({ id: this.lastID, unidade, setor, telefone, ramal: ramal || '' });
    }
  );
});

app.put('/api/contacts/:id', async (req, res) => {
  const { id } = req.params;
  const { unidade, setor, telefone, ramal } = req.body;
  if (!unidade || !setor || !telefone) {
    return res.status(400).json({ message: 'Unidade, setor e telefone são obrigatórios.' });
  }
  db.run(
    'UPDATE contacts SET unidade = ?, setor = ?, telefone = ?, ramal = ? WHERE id = ?',
    [unidade, setor, telefone, ramal || '', id],
    function (err) {
      if (err) return res.status(500).json({ message: 'Erro ao atualizar contato.' });
      writeAuditLog(req.user?.user_id, 'contact_update', 'contact', id, { unidade, setor, telefone });
      res.json({ id: Number(id), unidade, setor, telefone, ramal: ramal || '' });
    }
  );
});

app.delete('/api/contacts/:id', async (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM contacts WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ message: 'Erro ao excluir contato.' });
    writeAuditLog(req.user?.user_id, 'contact_delete', 'contact', id, {});
    res.json({ success: true });
  });
});

app.get('/api/patrimonio', async (req, res) => {
  db.all('SELECT id, rp, descricao, quantidade, estado FROM patrimonio ORDER BY rp ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar patrimônio.' });
    res.json({ items: rows });
  });
});

app.post('/api/patrimonio', async (req, res) => {
  const { rp, descricao, quantidade, estado } = req.body;
  if (!rp || !descricao) {
    return res.status(400).json({ message: 'RP e descrição são obrigatórios.' });
  }
  const qtd = Number.isFinite(Number(quantidade)) ? Number(quantidade) : 0;
  db.run(
    'INSERT INTO patrimonio (rp, descricao, quantidade, estado) VALUES (?, ?, ?, ?)',
    [rp, descricao, qtd, estado || 'Bom'],
    function (err) {
      if (err) {
        if (/unique/i.test(err.message)) {
          return res.status(409).json({ message: 'Já existe um item com este Nº de RP.' });
        }
        return res.status(500).json({ message: 'Erro ao criar item de patrimônio.' });
      }
      writeAuditLog(req.user?.user_id, 'patrimonio_create', 'patrimonio', rp, { rp, descricao, quantidade: qtd, estado: estado || 'Bom' });
      res.json({ id: this.lastID, rp, descricao, quantidade: qtd, estado: estado || 'Bom' });
    }
  );
});

app.put('/api/patrimonio/:rp', async (req, res) => {
  const { rp } = req.params;
  const { descricao, quantidade, estado } = req.body;
  const qtd = Number.isFinite(Number(quantidade)) ? Number(quantidade) : 0;
  db.run(
    'UPDATE patrimonio SET descricao = ?, quantidade = ?, estado = ?, updated_at = NOW() WHERE rp = ?',
    [descricao, qtd, estado || 'Bom', rp],
    function (err) {
      if (err) return res.status(500).json({ message: 'Erro ao atualizar item de patrimônio.' });
      writeAuditLog(req.user?.user_id, 'patrimonio_update', 'patrimonio', rp, { rp, descricao, quantidade: qtd, estado: estado || 'Bom' });
      res.json({ rp, descricao, quantidade: qtd, estado: estado || 'Bom' });
    }
  );
});

app.delete('/api/patrimonio/:rp', async (req, res) => {
  const { rp } = req.params;
  db.run('DELETE FROM patrimonio WHERE rp = ?', [rp], function (err) {
    if (err) return res.status(500).json({ message: 'Erro ao excluir item de patrimônio.' });
    writeAuditLog(req.user?.user_id, 'patrimonio_delete', 'patrimonio', rp, { rp });
    res.json({ success: true });
  });
});

app.get('/api/units', async (req, res) => {
  db.all('SELECT id, code, name, location, responsible, status, created_at, updated_at FROM units ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar unidades.' });
    res.json({ units: rows });
  });
});

app.post('/api/units', authenticateToken, authorizeAdmin, async (req, res) => {
  const { code, name, location, responsible, status } = req.body;
  if (!code || !name) {
    return res.status(400).json({ message: 'Código e nome da unidade são obrigatórios.' });
  }
  db.run(
    'INSERT INTO units (code, name, location, responsible, status) VALUES (?, ?, ?, ?, ?)',
    [code, name, location || '', responsible || '', status || 'Ativo'],
    function (err) {
      if (err) return res.status(500).json({ message: 'Erro ao criar unidade.' });
      const unitId = this.lastID;
      const defaultUnitPassHash = hashPassword('123456');
      db.run(
        'INSERT INTO unit_users (unit_code, login, pass, name, doc, email, phone, role, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [code, 'ADM', defaultUnitPassHash, 'Administrador Local', '', '', '', 'Administrator', 1],
        (userErr) => {
          if (userErr && userErr.code !== '23505') {
            console.error('Erro ao criar usuário ADM da unidade:', userErr);
          }
          writeAuditLog(req.user?.user_id, 'unit_create', 'unit', unitId, { code, name });
          res.json({ id: unitId, code, name, location: location || '', responsible: responsible || '', status: status || 'Ativo' });
        }
      );
    }
  );
});

app.delete('/api/units/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;

  db.get('SELECT id, code, name FROM units WHERE id = ?', [id], (findErr, unit) => {
    if (findErr) return res.status(500).json({ message: 'Erro ao localizar unidade.' });
    if (!unit) return res.status(404).json({ message: 'Unidade não encontrada.' });

    db.run('DELETE FROM unit_users WHERE unit_code = ?', [unit.code], (deleteUsersErr) => {
      if (deleteUsersErr) {
        return res.status(500).json({ message: 'Erro ao remover usuários vinculados à unidade.' });
      }

      db.run('DELETE FROM units WHERE id = ?', [id], function (deleteUnitErr) {
        if (deleteUnitErr) {
          return res.status(500).json({ message: 'Erro ao remover unidade.' });
        }

        writeAuditLog(req.user?.user_id, 'unit_delete', 'unit', id, { code: unit.code, name: unit.name });
        return res.json({
          success: true,
          deletedUnit: {
            id: unit.id,
            code: unit.code,
            name: unit.name,
          },
        });
      });
    });
  });
});

app.get('/api/unit-users/:unitCode', async (req, res) => {
  const { unitCode } = req.params;
  db.all('SELECT * FROM unit_users WHERE unit_code = ? ORDER BY id DESC', [unitCode], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar usuários da unidade.' });
    res.json({ users: rows });
  });
});

app.post('/api/unit-users/:unitCode', async (req, res) => {
  const { unitCode } = req.params;
  const { login, pass, name, doc, email, phone, role, is_default } = req.body;
  if (!login || !pass) {
    return res.status(400).json({ message: 'Login e senha são obrigatórios.' });
  }
  const unitPassHash = hashPassword(pass);
  db.run(
    'INSERT INTO unit_users (unit_code, login, pass, name, doc, email, phone, role, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [unitCode, login, unitPassHash, name || '', doc || '', email || '', phone || '', role || '', is_default ? 1 : 0],
    function (err) {
      if (err) return res.status(500).json({ message: 'Erro ao criar usuário da unidade.' });
      writeAuditLog(req.user?.user_id, 'unit_user_create', 'unit_user', this.lastID, { unit_code: unitCode, login, name: name || '' });
      res.json({ id: this.lastID, unit_code: unitCode, login, name: name || '', doc: doc || '', email: email || '', phone: phone || '', role: role || '', is_default: is_default ? 1 : 0 });
    }
  );
});

app.put('/api/unit-users/:id', async (req, res) => {
  const { id } = req.params;
  const { login, pass, name, doc, email, phone, role, is_default } = req.body;
  const unitPassHash = hashPassword(pass || '');
  db.run(
    'UPDATE unit_users SET login = ?, pass = ?, name = ?, doc = ?, email = ?, phone = ?, role = ?, is_default = ? WHERE id = ?',
    [login || '', unitPassHash, name || '', doc || '', email || '', phone || '', role || '', is_default ? 1 : 0, id],
    function (err) {
      if (err) return res.status(500).json({ message: 'Erro ao atualizar usuário da unidade.' });
      writeAuditLog(req.user?.user_id, 'unit_user_update', 'unit_user', id, { login: login || '', name: name || '' });
      res.json({ success: true });
    }
  );
});

app.delete('/api/unit-users/:id', async (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM unit_users WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ message: 'Erro ao excluir usuário da unidade.' });
    writeAuditLog(req.user?.user_id, 'unit_user_delete', 'unit_user', id, {});
    res.json({ success: true });
  });
});

function mapContractRow(row) {
  if (!row) return row;

  const numContrato = row.numContrato || row.numcontrato || '';
  const numProcesso = row.numProcesso || row.numprocesso || '';
  const razaoSocial = row.razaoSocial || row.razaosocial || '';
  const nomeFantasia = row.nomeFantasia || row.nomefantasia || '';
  const cnpj = row.cnpj || row.CNPJ || '';
  const valorGlobal = row.valorGlobal || row.valorglobal || '';
  const dtInicial = row.dtInicial || row.dtinicial || '';
  const dtFinal = row.dtFinal || row.dtfinal || '';
  const arquivoContrato = row.arquivoContrato || row.arquivocontrato || '';
  const conteudoArquivoBase64 = row.conteudoArquivoBase64 || row.conteudoarquivobase64 || '';
  const cep = row.cep || '';
  const logradouro = row.logradouro || '';
  const numEndereco = row.numEndereco || row.numendereco || '';
  const bairro = row.bairro || '';
  const cidade = row.cidade || '';
  const uf = row.uf || '';
  const telefoneFixo = row.telefoneFixo || row.telefonefixo || '';
  const telefoneWhatsapp = row.telefoneWhatsapp || row.telefonewhatsapp || '';
  const emailEmpresa = row.emailEmpresa || row.emailempresa || '';
  const prazoEntrega = row.prazoEntrega || row.prazoentrega || '';
  const formaContagem = row.formaContagem || row.formacontagem || '';
  const tipoEntrega = row.tipoEntrega || row.tipoentrega || '';

  return {
    ...row,
    numContrato,
    numProcesso,
    razaoSocial,
    nomeFantasia,
    cnpj,
    valorGlobal,
    dtInicial,
    dtFinal,
    arquivoContrato,
    conteudoArquivoBase64,
    cep,
    logradouro,
    numEndereco,
    bairro,
    cidade,
    uf,
    telefoneFixo,
    telefoneWhatsapp,
    emailEmpresa,
    prazoEntrega,
    formaContagem,
    tipoEntrega,
    lotes: safeJsonParse(row.lotes, []),
    unidades: safeJsonParse(row.unidades, []),
    aditivos: safeJsonParse(row.aditivos, []),
    empenhos: safeJsonParse(row.empenhos, []),
  };
}

function parseMoneyToNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;

  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDateDiffSeconds(dateValue) {
  const parsed = new Date(dateValue || '');
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }
  const seconds = Math.floor((Date.now() - parsed.getTime()) / 1000);
  return Math.max(0, seconds);
}

function touchSessionLastSeen(token) {
  if (!token) return;
  db.run('UPDATE sessions SET last_seen = ? WHERE token = ?', [Date.now(), token], () => {});
}

function writeAuditLog(userId, action, entityType, entityId, details = {}) {
  const actorId = Number(userId) || null;
  if (!actorId) return Promise.resolve();
  return new Promise((resolve) => {
    db.run(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?::jsonb)',
      [actorId, action, entityType || '', String(entityId == null ? '' : entityId), JSON.stringify(details || {})],
      () => resolve()
    );
  });
}

function actionLabel(action) {
  const labels = {
    contract_create: 'Cadastrou contrato',
    contract_update: 'Atualizou contrato',
    unit_create: 'Cadastrou unidade',
    unit_update: 'Atualizou unidade',
    unit_delete: 'Excluiu unidade',
    unit_user_create: 'Cadastrou usuário de unidade',
    unit_user_update: 'Atualizou usuário de unidade',
    unit_user_delete: 'Excluiu usuário de unidade',
    contact_create: 'Cadastrou contato',
    contact_update: 'Atualizou contato',
    contact_delete: 'Excluiu contato',
    patrimonio_create: 'Cadastrou patrimônio',
    patrimonio_update: 'Atualizou patrimônio',
    patrimonio_delete: 'Excluiu patrimônio',
    user_register: 'Solicitou cadastro de usuário',
    user_approve: 'Aprovou usuário',
    user_revoke: 'Revogou acesso de usuário',
    user_permissions: 'Alterou permissões de usuário',
    requisition_submit: 'Enviou requisição',
  };
  return labels[action] || (action || 'Realizou ação');
}

app.get('/api/kpis', async (req, res) => {
  try {
    const [totalsRow, ativosRow, contratosRows] = await Promise.all([
      contractsDb.get('SELECT COUNT(*) AS total FROM contracts'),
      contractsDb.get("SELECT COUNT(*) AS ativos FROM contracts WHERE lower(coalesce(status, '')) IN ('ativo', 'em execucao', 'execucao')"),
      contractsDb.all('SELECT valorGlobal, aditivos, empenhos FROM contracts ORDER BY id DESC LIMIT 500'),
    ]);

    const totalContratos = Number(totalsRow?.total || 0);
    const contratosAtivos = Number(ativosRow?.ativos || 0);

    let totalAditivos = 0;
    let totalEmpenhos = 0;
    let valorTotal = 0;

    for (const row of contratosRows || []) {
      valorTotal += parseMoneyToNumber(row?.valorglobal || row?.valorGlobal || 0);

      const aditivos = safeJsonParse(row?.aditivos, []);
      const empenhos = safeJsonParse(row?.empenhos, []);
      totalAditivos += Array.isArray(aditivos) ? aditivos.length : 0;
      totalEmpenhos += Array.isArray(empenhos) ? empenhos.length : 0;
    }

    const contratosComDados = Math.max(1, totalContratos);
    const conformidade = totalContratos > 0 ? Math.min(99.9, Math.max(70, 84 + ((contratosAtivos / contratosComDados) * 14))) : 0;
    const pagamentoNotas = Math.max(0, totalEmpenhos + Math.ceil(totalAditivos * 0.25));
    const valorMilhoes = valorTotal > 0 ? (valorTotal / 1000000) : 0;
    const barAtivos = totalContratos > 0 ? Math.min(100, Math.round((contratosAtivos / totalContratos) * 100)) : 0;

    res.json([
      { title: 'Contratos Ativos', value: String(contratosAtivos), trend: totalContratos > 0 ? `${totalContratos} registrados` : 'Sem contratos', neon: 'blue', icon: 'fa-layer-group', bar: barAtivos },
      { title: 'Aditivos Ativos', value: String(totalAditivos), trend: totalAditivos > 0 ? 'Registrados' : 'Sem aditivos', neon: 'cyan', icon: 'fa-file-circle-plus', bar: totalContratos > 0 ? Math.min(100, Math.round((totalAditivos / totalContratos) * 100)) : 0 },
      { title: 'Atualizacoes', value: '0', trend: 'Sem atualizacoes', neon: 'green', icon: 'fa-arrows-rotate', bar: 0 },
      { title: 'Empenhos em Andamento', value: String(totalEmpenhos), trend: totalEmpenhos > 0 ? 'Registrados' : 'Sem empenhos', neon: 'purple', icon: 'fa-receipt', bar: totalContratos > 0 ? Math.min(100, Math.round((totalEmpenhos / totalContratos) * 100)) : 0 },
      { title: 'Conformidade', value: `${conformidade.toFixed(1)}%`, trend: conformidade > 0 ? 'Calculada' : 'Sem dados', neon: 'teal', icon: 'fa-shield-halved', bar: Math.round(conformidade) },
      { title: 'Notas de Pagamento', value: String(pagamentoNotas), trend: pagamentoNotas > 0 ? 'Registradas' : 'Sem notas', neon: 'gold', icon: 'fa-dollar-sign', bar: totalContratos > 0 ? Math.min(100, Math.round((pagamentoNotas / totalContratos) * 100)) : 0 },
      { title: 'Valor Total Contratos', value: `R$ ${valorMilhoes.toFixed(1).replace('.', ',')}M`, trend: valorTotal > 0 ? 'Total contratado' : 'Sem valores', neon: 'light', icon: 'fa-chart-line', bar: 0 },
    ]);
  } catch (error) {
    console.error('Erro em /api/kpis:', error);
    res.status(500).json({ message: 'Erro ao carregar KPIs do painel.' });
  }
});

app.get('/api/funcionarios', async (req, res) => {
  try {
    const rows = await db.all(
      "SELECT id, name, role, cargo, unidade, perfil, status, account_status, updated_at, created_at FROM users WHERE lower(coalesce(account_status, 'ativo')) = 'ativo' ORDER BY id DESC LIMIT 120"
    );

    const lastSeenRows = await db.all(
      `SELECT user_id, MAX(COALESCE(last_seen, created_at)) AS last_seen
       FROM sessions
       GROUP BY user_id`
    );
    const lastSeenMap = {};
    (lastSeenRows || []).forEach((r) => { lastSeenMap[Number(r.user_id)] = r.last_seen; });

    const lastActivityRows = await db.all(
      `SELECT user_id, MAX(id) AS max_id FROM audit_logs GROUP BY user_id`
    );
    const lastActivityIds = (lastActivityRows || []).map((r) => r.max_id);

    let lastActivityMap = {};
    if (lastActivityIds.length) {
      const placeholders = lastActivityIds.map(() => '?').join(',');
      const activityRows = await db.all(
        `SELECT a.id, a.user_id, a.action, a.entity_id, a.details, a.created_at FROM audit_logs a WHERE a.id IN (${placeholders})`,
        lastActivityIds
      );
      (activityRows || []).forEach((r) => { lastActivityMap[Number(r.user_id)] = r; });
    }

    const ONLINE_WINDOW_MS = 10 * 60 * 1000;

    const mapped = (rows || []).map((row) => {
      const id = Number(row?.id || 0);
      const nome = String(row?.name || `Operador ${id || 1}`);
      const lastSeen = Number(lastSeenMap[id]) || 0;
      const now = Date.now();
      const isOnline = lastSeen > 0 && (now - lastSeen) < ONLINE_WINDOW_MS;
      const hasSession = lastSeen > 0;
      const tempoOnlineSeg = hasSession ? Math.max(0, Math.floor((now - lastSeen) / 1000)) : 0;

      let atividade = 'Sem atividades recentes';
      const last = lastActivityMap[id];
      if (last) {
        const details = safeJsonParse(last?.details, {});
        let label = actionLabel(last?.action);
        if (last?.action === 'contract_create' && details?.numContrato) label = `Cadastrou o contrato ${details.numContrato}`;
        if (last?.action === 'contract_update' && details?.numContrato) label = `Atualizou o contrato ${details.numContrato}`;
        if (last?.action === 'unit_create' && details?.name) label = `Cadastrou a unidade ${details.name}`;
        if (last?.action === 'contact_create' && details?.unidade) label = `Cadastrou contato de ${details.unidade}`;
        if (last?.action === 'patrimonio_create' && details?.rp) label = `Cadastrou patrimônio RP ${details.rp}`;
        if (last?.action === 'user_register' && details?.name) label = `Novo cadastro de ${details.name}`;
        if (last?.action === 'user_approve') label = 'Aprovou um usuário';
        if (last?.action === 'user_revoke' && details?.name) label = `Revogou acesso de ${details.name}`;
        if (last?.action === 'requisition_submit') label = `Enviou requisição ${details?.reqNumberYear || ''}`;
        atividade = label;
      }

      const funcao = String(row?.cargo || row?.role || row?.perfil || 'Usuário');
      const unidade = String(row?.unidade || '');

      return {
        id,
        nome,
        email: row?.email || '',
        funcao,
        unidade,
        perfil: row?.perfil || '',
        role: row?.role || 'user',
        status: isOnline ? 'Online' : (hasSession ? 'Ausente' : 'Offline'),
        atividade,
        tempoOnlineSeg,
        online: isOnline ? Math.min(100, 80 + (id % 20)) : (hasSession ? 20 + (id % 20) : 0),
        ultimaAtividade: last?.created_at || null,
      };
    });

    res.json(mapped);
  } catch (error) {
    console.error('Erro em /api/funcionarios:', error);
    res.status(500).json({ message: 'Erro ao carregar funcionários para monitoramento.' });
  }
});

app.get('/api/activities', async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT a.id, a.user_id, u.name AS user_name, u.unidade, u.perfil, u.role, a.action, a.entity_type, a.entity_id, a.details, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.id DESC
       LIMIT 100`
    );

    const activities = (rows || []).map((row) => {
      const details = safeJsonParse(row?.details, {});
      let descricao = actionLabel(row?.action);
      if (row?.action === 'contract_create' && details?.numContrato) {
        descricao = `Cadastrou o contrato ${details.numContrato}`;
      } else if (row?.action === 'contract_update' && details?.numContrato) {
        descricao = `Atualizou o contrato ${details.numContrato}`;
      } else if (row?.action === 'unit_create' && details?.name) {
        descricao = `Cadastrou a unidade ${details.name}`;
      } else if (row?.action === 'contact_create' && details?.unidade) {
        descricao = `Cadastrou o contato de ${details.unidade} (${details.setor || 'setor'})`;
      } else if (row?.action === 'patrimonio_create' && details?.rp) {
        descricao = `Cadastrou patrimônio RP ${details.rp}`;
      } else if (row?.action === 'user_register' && details?.name) {
        descricao = `Novo cadastro de ${details.name}`;
      } else if (row?.action === 'user_approve') {
        descricao = 'Aprovou um usuário';
      } else if (row?.action === 'user_revoke' && details?.name) {
        descricao = `Revogou acesso de ${details.name}`;
      } else if (row?.action === 'requisition_submit') {
        descricao = `Enviou requisição ${details?.reqNumberYear || ''}`;
      }

      return {
        id: row?.id,
        userId: row?.user_id,
        userName: row?.user_name || 'Sistema',
        unidade: row?.unidade || '',
        perfil: row?.perfil || '',
        role: row?.role || 'user',
        action: row?.action,
        entityType: row?.entity_type,
        entityId: row?.entity_id,
        descricao,
        details,
        created_at: row?.created_at,
      };
    });

    res.json({ activities });
  } catch (error) {
    console.error('Erro em /api/activities:', error);
    res.status(500).json({ message: 'Erro ao carregar atividades do monitoramento.' });
  }
});

app.get('/api/empresa/localizacao', async (req, res) => {
  try {
    const row = await contractsDb.get(
      "SELECT cep, credor, logradouro, numEndereco, bairro, cidade, uf FROM contracts WHERE trim(coalesce(cep, '')) <> '' ORDER BY id DESC LIMIT 1"
    );

    if (!row) {
      return res.json({
        cep: '',
        empresa: '',
        logradouro: '',
        numero: '',
        bairro: '',
        cidade: '',
        uf: '',
      });
    }

    const mapped = mapContractRow(row);
    return res.json({
      cep: mapped.cep || '',
      empresa: mapped.credor || '',
      logradouro: mapped.logradouro || '',
      numero: mapped.numEndereco || '',
      bairro: mapped.bairro || '',
      cidade: mapped.cidade || '',
      uf: mapped.uf || '',
    });
  } catch (error) {
    console.error('Erro em /api/empresa/localizacao:', error);
    res.status(500).json({ message: 'Erro ao carregar localização da empresa.' });
  }
});

app.get('/api/contracts', async (req, res) => {
  const { numContrato } = req.query;
  if (numContrato) {
    const normalizedNumContrato = String(numContrato || '').trim();
    contractsDb.get(`SELECT contracts.*
         FROM contracts
         WHERE lower(trim(contracts.numContrato)) = lower(trim(?))`, [normalizedNumContrato], (err, row) => {
      if (err) return res.status(500).json({ message: 'Erro ao buscar contrato.' });
      if (!row) return res.status(404).json({ message: 'Contrato não encontrado.' });
      return res.json(mapContractRow(row));
    });
    return;
  }

  // Omit conteudoArquivoBase64 from list to avoid 60MB+ responses; fetch it per-contract
  contractsDb.all(
        `SELECT contracts.id, contracts.numContrato, contracts.numProcesso, contracts.credor, contracts.razaoSocial, contracts.nomeFantasia, contracts.cnpj, contracts.cep, contracts.logradouro, contracts.numEndereco, contracts.bairro, contracts.cidade, contracts.uf,
            telefoneFixo, telefoneWhatsapp, emailEmpresa, valorGlobal, objeto, dtInicial, dtFinal,
            prazoEntrega, formaContagem, tipoEntrega, arquivoContrato,
            CASE WHEN conteudoArquivoBase64 IS NOT NULL AND conteudoArquivoBase64 != '' THEN '__HAS_PDF__' ELSE '' END AS conteudoArquivoBase64,
          lotes, unidades, aditivos, empenhos, status, contracts.created_by, contracts.updated_by, contracts.created_at, contracts.updated_at,
          NULL AS created_by_name, NULL AS updated_by_name
         FROM contracts
         ORDER BY contracts.id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Erro ao buscar contratos.' });
      const contracts = rows.map(mapContractRow);
      res.json({ contracts });
    }
  );
});

app.get('/api/contracts/:numContrato', async (req, res) => {
  const { numContrato } = req.params;
  const normalizedNumContrato = String(numContrato || '').trim();
  contractsDb.get(`SELECT contracts.*
                   FROM contracts
                   WHERE lower(trim(contracts.numContrato)) = lower(trim(?))`, [normalizedNumContrato], (err, row) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar contrato.' });
    if (!row) return res.status(404).json({ message: 'Contrato não encontrado.' });
    res.json(mapContractRow(row));
  });
});

// ADMIN-ONLY: Delete all contracts (temporary cleanup endpoint)
app.delete('/api/contracts/admin/purge-all', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'developer') {
    return res.status(403).json({ message: 'Acesso negado.' });
  }
  const confirmToken = String(req.query.confirm || '').trim();
  if (confirmToken !== 'PURGE_ALL_CONTRACTS_2026') {
    return res.status(400).json({ message: 'Token de confirmação inválido. Use: ?confirm=PURGE_ALL_CONTRACTS_2026' });
  }
  contractsDb.run('DELETE FROM contracts', [], (err) => {
    if (err) return res.status(500).json({ message: 'Erro ao limpar contratos.' });
    res.json({ message: 'Todos os contratos foram deletados permanentemente.', timestamp: new Date().toISOString() });
  });
});

app.post('/api/contracts', authenticateTokenOrDev, async (req, res) => {
  const {
    numContrato,
    numProcesso,
    credor,
    razaoSocial,
    nomeFantasia,
    cnpj,
    cep,
    logradouro,
    numEndereco,
    bairro,
    cidade,
    uf,
    telefoneFixo,
    telefoneWhatsapp,
    emailEmpresa,
    valorGlobal,
    objeto,
    dtInicial,
    dtFinal,
    prazoEntrega,
    formaContagem,
    tipoEntrega,
    arquivoContrato,
    conteudoArquivoBase64,
    lotes,
    unidades,
    aditivos,
    empenhos,
  } = req.body;

  const normalizedNumContrato = String(numContrato || '').trim();

  if (!normalizedNumContrato) {
    return res.status(400).json({ message: 'Número do contrato é obrigatório.' });
  }

  contractsDb.run(
    `INSERT INTO contracts (
        numContrato,
        created_by,
        updated_by,
        numProcesso,
        credor,
        razaoSocial,
        nomeFantasia,
        cnpj,
        cep,
        logradouro,
        numEndereco,
        bairro,
        cidade,
        uf,
        telefoneFixo,
        telefoneWhatsapp,
        emailEmpresa,
        valorGlobal,
        objeto,
        dtInicial,
        dtFinal,
        prazoEntrega,
        formaContagem,
        tipoEntrega,
        arquivoContrato,
        conteudoArquivoBase64,
        lotes,
        unidades,
        aditivos,
        empenhos
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb)
      ON CONFLICT (numContrato)
      DO UPDATE SET
        numProcesso = EXCLUDED.numProcesso,
        credor = EXCLUDED.credor,
        razaoSocial = EXCLUDED.razaoSocial,
        nomeFantasia = EXCLUDED.nomeFantasia,
        cnpj = EXCLUDED.cnpj,
        cep = EXCLUDED.cep,
        logradouro = EXCLUDED.logradouro,
        numEndereco = EXCLUDED.numEndereco,
        bairro = EXCLUDED.bairro,
        cidade = EXCLUDED.cidade,
        uf = EXCLUDED.uf,
        telefoneFixo = EXCLUDED.telefoneFixo,
        telefoneWhatsapp = EXCLUDED.telefoneWhatsapp,
        emailEmpresa = EXCLUDED.emailEmpresa,
        valorGlobal = EXCLUDED.valorGlobal,
        objeto = EXCLUDED.objeto,
        dtInicial = EXCLUDED.dtInicial,
        dtFinal = EXCLUDED.dtFinal,
        prazoEntrega = EXCLUDED.prazoEntrega,
        formaContagem = EXCLUDED.formaContagem,
        tipoEntrega = EXCLUDED.tipoEntrega,
        arquivoContrato = EXCLUDED.arquivoContrato,
        conteudoArquivoBase64 = EXCLUDED.conteudoArquivoBase64,
        lotes = EXCLUDED.lotes,
        unidades = EXCLUDED.unidades,
        aditivos = EXCLUDED.aditivos,
        empenhos = EXCLUDED.empenhos,
        created_by = COALESCE(contracts.created_by, EXCLUDED.created_by),
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()`,
    [
      normalizedNumContrato,
      req.user?.user_id || null,
      req.user?.user_id || null,
      numProcesso || '',
      credor || '',
      razaoSocial || '',
      nomeFantasia || '',
      cnpj || '',
      cep || '',
      logradouro || '',
      numEndereco || '',
      bairro || '',
      cidade || '',
      uf || '',
      telefoneFixo || '',
      telefoneWhatsapp || '',
      emailEmpresa || '',
      valorGlobal || '',
      objeto || '',
      dtInicial || '',
      dtFinal || '',
      prazoEntrega || '',
      formaContagem || '',
      tipoEntrega || '',
      arquivoContrato || '',
      conteudoArquivoBase64 || '',
      JSON.stringify(lotes || []),
      JSON.stringify(unidades || []),
      JSON.stringify(aditivos || []),
      JSON.stringify(empenhos || []),
    ],
    function (err) {
      if (err) return res.status(500).json({ message: 'Erro ao salvar contrato.' });
      writeAuditLog(req.user?.user_id, 'contract_create', 'contract', normalizedNumContrato, { numContrato: normalizedNumContrato, credor: credor || '', valorGlobal: valorGlobal || '' });
      res.json({ message: 'Contrato salvo com sucesso.', id: this.lastID });
    }
  );
});

app.get('/api/user-requests', authenticateToken, authorizeAdmin, async (req, res) => {
  db.all("SELECT id, email, name, cpf, matricula, phone, cargo, unidade, perfil, status, verified, permissions_json, can_view_overview FROM users WHERE lower(coalesce(status, 'pendente')) <> 'aprovado' ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar solicitações de usuários.' });
    const requests = rows.map((row) => ({
      ...row,
      permissions: safeJsonParse(row.permissions_json, {}),
      canViewOverview: !!row.can_view_overview,
    }));
    res.json({ requests });
  });
});

app.put('/api/user-requests/:id/approve', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const incomingPermissions = req.body?.permissions;
  const parsedPermissions = safeJsonParse(incomingPermissions, {});
  const permissionsJson = JSON.stringify(parsedPermissions || {});
  const canViewOverview = !!(req.body?.canViewOverview || parsedPermissions?.visaoGeral);

  db.run('UPDATE users SET verified = TRUE, status = ?, account_status = ?, permissions_json = ?, can_view_overview = ? WHERE id = ?', ['Aprovado', 'ativo', permissionsJson, canViewOverview ? 1 : 0, id], function (err) {
    if (err) return res.status(500).json({ message: 'Erro ao aprovar usuário.' });
    writeAuditLog(req.user?.user_id, 'user_approve', 'user', id, { permissions: parsedPermissions });
    res.json({ success: true });
  });
});

app.delete('/api/user-requests/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM users WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ message: 'Erro ao remover solicitação.' });
    res.json({ success: true });
  });
});

const iaGovMtConfig = {
  lmStudioUrl: 'http://localhost:1234/v1/chat/completions',
  lmStudioModelsUrl: 'http://localhost:1234/v1/models',
  model: 'local-model',
  temperature: 0.7,
  maxTokens: 1000,
  systemPrompt: 'Você é a IA GOV MT, uma assistente de IA institucional com personalidade calma, precisa e levemente futurista — direta, sem enrolação, mas cordial. Responda em português do Brasil, de forma objetiva.'
};

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nenhuma mensagem enviada.' });
  }

  const payload = {
    model: iaGovMtConfig.model,
    messages: [{ role: 'system', content: iaGovMtConfig.systemPrompt }, ...messages],
    temperature: iaGovMtConfig.temperature,
    max_tokens: iaGovMtConfig.maxTokens,
    stream: false,
  };

  try {
    const response = await fetchApi(iaGovMtConfig.lmStudioUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error('[LM Studio] resposta com erro:', response.status, details);
      return res.status(502).json({ error: 'O LM Studio recusou a solicitação. Verifique se o servidor local está ligado e um modelo está carregado.' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'Não foi possível gerar resposta.';
    return res.json({ reply });
  } catch (err) {
    console.error('[LM Studio] falha de conexão:', err.message);
    return res.status(502).json({ error: 'Não foi possível conectar ao LM Studio. Confirme se ele está aberto com o servidor local ativado (porta 1234).' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const response = await fetchApi(iaGovMtConfig.lmStudioModelsUrl, { method: 'GET' });
    res.json({ backend: true, lmStudio: response.ok });
  } catch (err) {
    console.error('[IA GOV MT health] erro:', err.message);
    res.json({ backend: true, lmStudio: false });
  }
});

// ============================================================
// DEV PANEL — credenciais e helpers
// ============================================================
const DEV_LOGIN = 'DEVFULL';
const DEV_PASSWORD = 'DEV2026';

function devAuthCheck(req, res, next) {
  const secret = req.headers['x-dev-secret'];
  const expected = Buffer.from(`${DEV_LOGIN}:${DEV_PASSWORD}`).toString('base64');
  if (secret !== expected) {
    return res.status(403).json({ message: 'Acesso negado: credenciais dev inválidas.' });
  }
  next();
}

function authenticateTokenOrDev(req, res, next) {
  const secret = req.headers['x-dev-secret'];
  const expected = Buffer.from(`${DEV_LOGIN}:${DEV_PASSWORD}`).toString('base64');
  if (secret === expected) {
    req.user = { role: 'developer', email: 'developer@local' };
    next();
    return;
  }
  authenticateToken(req, res, next);
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || '0.0.0.0';
}

function logVisitor(req, res, next) {
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  const method = req.method;
  const path = req.path || req.url;
  if (path.startsWith('/uploads') || path === '/api/health' || path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.ico') || path.endsWith('.svg') || path.endsWith('.woff2')) {
    return next();
  }
  const userId = req.user?.user_id || null;
  const emailUsed = req.user?.email || null;
  res.on('finish', () => {
    const status = res.statusCode;
    db.run(
      'INSERT INTO visitor_logs (ip_address, user_agent, method, path, user_id, email_used, status_code) VALUES ($1::inet, $2, $3, $4, $5, $6, $7)',
      [ip, ua, method, path, userId, emailUsed, status],
      () => {}
    );
    if (status >= 400) detectSuspiciousPath(ip, path);
  });
  next();
}

// ============================================================
// SECURITY ALERTS — helpers
// ============================================================
function writeSecurityAlert(alertType, ip, severity, description, details = {}) {
  return new Promise((resolve) => {
    db.run(
      'INSERT INTO security_alerts (alert_type, ip_address, severity, description, details) VALUES ($1, $2::inet, $3, $4, $5::jsonb)',
      [alertType, ip || '0.0.0.0', severity || 'warning', description || '', JSON.stringify(details || {})],
      () => resolve()
    );
  });
}

async function detectSuspiciousLogin(email, ip, success) {
  if (success) return;
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  try {
    const row = await new Promise((resolve) => {
      db.get(
        "SELECT COUNT(*) AS cnt FROM visitor_logs WHERE ip_address = $1::inet AND path = '/auth/login' AND created_at > $2",
        [ip, fiveMinAgo],
        (err, r) => resolve(err ? { cnt: 0 } : r)
      );
    });
    if (row.cnt >= 5) {
      await writeSecurityAlert('brute_force_login', ip, 'critical', `Tentativa de força bruta: ${row.cnt} logins falhos em 5min`, { email, attempts: row.cnt });
    } else if (row.cnt >= 3) {
      await writeSecurityAlert('multiple_failed_logins', ip, 'warning', `${row.cnt} tentativas de login falhas em 5min`, { email, attempts: row.cnt });
    }
  } catch (_) {}
}

function detectSuspiciousPath(ip, path) {
  const suspicious = [/\.\.\//i, /union.*select/i, /<script/i, /exec\(/i, /\/etc\/passwd/i, /\/proc\//i, /cmd/i, /eval\(/i];
  if (suspicious.some(rx => rx.test(path))) {
    writeSecurityAlert('suspicious_request', ip, 'critical', `Requisição suspeita detectada: ${path}`, { path });
  }
}

app.use(logVisitor);

// ============================================================
// DEV PANEL — endpoints
// ============================================================
app.post('/api/dev/auth', express.json(), (req, res) => {
  const { login, password } = req.body || {};
  if (login === DEV_LOGIN && password === DEV_PASSWORD) {
    return res.json({ ok: true });
  }
  res.status(401).json({ message: 'Credenciais dev inválidas.' });
});

app.get('/api/dev/visitors', devAuthCheck, async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
           ip_address,
           COUNT(*) AS total_requests,
           COUNT(DISTINCT user_id) AS unique_users,
           MAX(created_at) AS last_access,
           MIN(created_at) AS first_seen
         FROM visitor_logs
         GROUP BY ip_address
         ORDER BY last_access DESC
         LIMIT 100`,
        [],
        (err, r) => err ? reject(err) : resolve(r || [])
      );
    });
    const enriched = await Promise.all(rows.map(async (row) => {
      const lastPath = await new Promise((resolve) => {
        db.get(
          'SELECT path, method FROM visitor_logs WHERE ip_address = $1::inet ORDER BY created_at DESC LIMIT 1',
          [row.ip_address],
          (err, r) => resolve(err ? null : r)
        );
      });
      const lastUser = await new Promise((resolve) => {
        db.get(
          `SELECT email_used FROM visitor_logs WHERE ip_address = $1::inet AND user_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
          [row.ip_address],
          (err, r) => resolve(err ? null : r)
        );
      });
      return {
        ip: row.ip_address,
        totalRequests: row.total_requests,
        uniqueUsers: row.unique_users,
        lastAccess: row.last_access,
        firstSeen: row.first_seen,
        lastPath: lastPath?.path || '-',
        lastMethod: lastPath?.method || '-',
        lastUser: lastUser?.email_used || '-',
      };
    }));
    res.json({ visitors: enriched });
  } catch (err) {
    console.error('[DEV visitors] erro:', err.message);
    res.status(500).json({ message: 'Erro ao buscar visitantes.' });
  }
});

app.get('/api/dev/activity/:ip', devAuthCheck, async (req, res) => {
  const ip = req.params.ip;
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, ip_address, user_agent, method, path, user_id, email_used, status_code, created_at
         FROM visitor_logs
         WHERE ip_address = $1::inet
         ORDER BY created_at DESC
         LIMIT 200`,
        [ip],
        (err, r) => err ? reject(err) : resolve(r || [])
      );
    });
    res.json({ ip, activity: rows });
  } catch (err) {
    console.error('[DEV activity] erro:', err.message);
    res.status(500).json({ message: 'Erro ao buscar atividade.' });
  }
});

app.get('/api/dev/db-status', devAuthCheck, async (req, res) => {
  try {
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_INTERNAL_URL || '';
    const masked = dbUrl ? dbUrl.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@') : 'N/A';
    const tables = await new Promise((resolve, reject) => {
      db.all(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
        [],
        (err, r) => err ? reject(err) : resolve(r || [])
      );
    });
    const tableStats = await Promise.all(tables.map(async (t) => {
      const row = await new Promise((resolve) => {
        db.get(`SELECT COUNT(*) AS cnt FROM ${t.tablename}`, [], (err, r) => resolve(err ? { cnt: 0 } : r));
      });
      return { name: t.tablename, rows: row.cnt };
    }));
    const dbSize = await new Promise((resolve) => {
      db.get("SELECT pg_size_pretty(pg_database_size(current_database())) AS size", [], (err, r) => resolve(err ? { size: 'N/A' } : r));
    });
    const activeConns = await new Promise((resolve) => {
      db.get("SELECT COUNT(*) AS cnt FROM pg_stat_activity WHERE state = 'active'", [], (err, r) => resolve(err ? { cnt: 0 } : r));
    });
    const uptime = await new Promise((resolve) => {
      db.get("SELECT NOW() - pg_postmaster_start_time() AS uptime", [], (err, r) => resolve(err ? { uptime: 'N/A' } : r));
    });
    res.json({
      connectionUrl: masked,
      databaseSize: dbSize?.size || 'N/A',
      activeConnections: activeConns?.cnt || 0,
      uptime: uptime?.uptime || 'N/A',
      tables: tableStats,
    });
  } catch (err) {
    console.error('[DEV db-status] erro:', err.message);
    res.status(500).json({ message: 'Erro ao verificar status do banco.' });
  }
});

app.get('/api/dev/alerts', devAuthCheck, async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, alert_type, ip_address, severity, description, details, resolved, created_at
         FROM security_alerts
         ORDER BY created_at DESC
         LIMIT 100`,
        [],
        (err, r) => err ? reject(err) : resolve(r || [])
      );
    });
    const unresolvedCount = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) AS cnt FROM security_alerts WHERE resolved = false', [], (err, r) => resolve(err ? { cnt: 0 } : r));
    });
    res.json({ alerts: rows, unresolvedCount: unresolvedCount.cnt });
  } catch (err) {
    console.error('[DEV alerts] erro:', err.message);
    res.status(500).json({ message: 'Erro ao buscar alertas.' });
  }
});

app.post('/api/dev/alerts/:id/resolve', devAuthCheck, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido.' });
  try {
    await new Promise((resolve, reject) => {
      db.run('UPDATE security_alerts SET resolved = true WHERE id = $1', [id], (err) => err ? reject(err) : resolve());
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[DEV resolve-alert] erro:', err.message);
    res.status(500).json({ message: 'Erro ao resolver alerta.' });
  }
});

(async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Servidor iniciado em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Erro ao inicializar o banco PostgreSQL:', error?.message || error);
    console.error('Defina DATABASE_URL (ou POSTGRES_INTERNAL_URL) no Render. O backend também tenta detectar automaticamente outras variáveis *_URL de Postgres.');
    console.error('Sem URL, informe ao menos DB_HOST/PGHOST e credenciais do banco no ambiente.');
    process.exit(1);
  }
})();
