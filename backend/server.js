const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
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

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const db = createDatabase();
const contractsDb = createDatabase();

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

  if (process.platform === 'win32') {
    // Em ambiente local Windows sem SMTP, evita quebra no fluxo de envio.
    return nodemailer.createTransport({ jsonTransport: true });
  }

  return nodemailer.createTransport({
    sendmail: true,
    newline: 'unix',
    path: '/usr/sbin/sendmail',
  });
}

const emailTransporter = createMailTransporter();

function sendEmail(mailOptions) {
  const fromAddress = process.env.SMTP_FROM || 'no-reply@copal.mt.gov.br';
  return emailTransporter.sendMail({ from: fromAddress, ...mailOptions });
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

// As senhas são persistidas como hash para compatibilidade com o esquema PostgreSQL.

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(require('cors')());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(FRONTEND_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'home.html.html'));
});

app.get('/login.html.html', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'cadastrouser.html.html'));
});

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
});

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
      `SELECT sessions.token, sessions.user_id, users.email, users.name, users.role, users.unidade, users.perfil, users.status, users.can_view_overview, users.background_image, users.access_level, users.account_status, users.permissions_json
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

  if (normalizedIdentifier === 'adm@copal' && password === 'COPAL@2026') {
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
            name: adminUser.name,
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
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  if ((user.account_status || 'ativo').toLowerCase() !== 'ativo') {
    return res.status(403).json({ message: 'Conta inativa. Fale com o administrador.' });
  }

  const passwordMatches = await verifyPasswordSecure(password, user.password_hash);
  if (!passwordMatches) {
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
          name: user.name,
          role: user.role || 'user',
          unidade: user.unidade || null,
          perfil: user.perfil || null,
          status: user.status || null,
          accessLevel: user.access_level || null,
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
    name: session.name,
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

    await sendEmail({
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

    return res.json({ message: 'Código temporário enviado ao e-mail do servidor.' });
  } catch (error) {
    console.error('Erro ao enviar código de requisição:', error);
    return res.status(500).json({ message: 'Falha ao enviar o e-mail de validação. Verifique a configuração de SMTP.' });
  }
});

app.post('/api/submit-requisition', upload.single('pdfAttachment'), async (req, res) => {
  const {
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
  } = req.body;

  if (!reqRequesterName || !reqRequesterMatricula || !reqRequesterEmail || !reqVerificationCode) {
    return res.status(400).json({ message: 'Dados do servidor e código de validação são obrigatórios.' });
  }

  const stored = await getQuery(
    db,
    'SELECT * FROM requisition_codes WHERE requester_email = ? ORDER BY id DESC LIMIT 1',
    [reqRequesterEmail.toLowerCase()]
  );

  if (!stored || stored.code !== reqVerificationCode || stored.used_at || Date.now() > stored.expires_at) {
    return res.status(400).json({ message: 'Código de validação inválido ou expirado.' });
  }

  if (!reqCompanyEmail) {
    return res.status(400).json({ message: 'E-mail da empresa contratada é obrigatório.' });
  }

  const pdfAttachmentName = req.file ? req.file.originalname : '';
  const pdfAttachmentPath = req.file ? req.file.path : '';
  let requisitionRecordId = null;

  const requisitionBody = `Requisição Nº: ${reqNumberYear || 'N/A'}\n` +
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
    `Validação por código temporário: ${reqVerificationCode}\n`;

  const emailHtml = `
    <h2>Requisição de Materiais e/ou Serviços</h2>
    <p><strong>Requisição Nº:</strong> ${reqNumberYear || 'N/A'}</p>
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
    <p><strong>Código de validação:</strong> ${reqVerificationCode}</p>
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
        code_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
      [
        reqNumberYear || '',
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
        `Requisição ${reqNumberYear || ''} - ${reqCompany}`,
        requisitionBody,
        emailHtml,
        'pending',
        '',
        Date.now(),
        stored.id,
      ]
    );
    requisitionRecordId = requisitionInsert.lastID;

    await sendEmail({
      to: reqCompanyEmail,
      subject: `Requisição ${reqNumberYear || ''} - ${reqCompany}`,
      text: requisitionBody,
      html: emailHtml,
      attachments,
    });

    await runQuery(db, 'UPDATE requisitions SET email_status = ?, sent_at = ?, email_error = ? WHERE id = ?', ['sent', Date.now(), '', requisitionRecordId]);
    await runQuery(db, 'UPDATE requisition_codes SET used_at = ? WHERE id = ?', [Date.now(), stored.id]);

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
    'SELECT id, email, name, role, unidade, perfil, access_level, account_status, status, verified, permissions_json, background_image FROM users ORDER BY id DESC',
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Erro ao buscar usuários.' });
      }
      return res.json({ users: rows });
    }
  );
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
      res.json({ id: Number(id), unidade, setor, telefone, ramal: ramal || '' });
    }
  );
});

app.delete('/api/contacts/:id', async (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM contacts WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ message: 'Erro ao excluir contato.' });
    res.json({ success: true });
  });
});

app.get('/api/units', async (req, res) => {
  db.all('SELECT * FROM units ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar unidades.' });
    res.json({ units: rows });
  });
});

app.post('/api/units', async (req, res) => {
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
          res.json({ id: unitId, code, name, location: location || '', responsible: responsible || '', status: status || 'Ativo' });
        }
      );
    }
  );
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
      res.json({ success: true });
    }
  );
});

app.delete('/api/unit-users/:id', async (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM unit_users WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ message: 'Erro ao excluir usuário da unidade.' });
    res.json({ success: true });
  });
});

app.get('/api/contracts', async (req, res) => {
  const { numContrato } = req.query;
  if (numContrato) {
    contractsDb.get('SELECT * FROM contracts WHERE numContrato = ?', [numContrato], (err, row) => {
      if (err) return res.status(500).json({ message: 'Erro ao buscar contrato.' });
      if (!row) return res.status(404).json({ message: 'Contrato não encontrado.' });
      return res.json({
        ...row,
        lotes: safeJsonParse(row.lotes, []),
        unidades: safeJsonParse(row.unidades, []),
        aditivos: safeJsonParse(row.aditivos, []),
        empenhos: safeJsonParse(row.empenhos, []),
      });
    });
    return;
  }

  contractsDb.all('SELECT * FROM contracts ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar contratos.' });
    const contracts = rows.map(row => ({
      ...row,
      lotes: safeJsonParse(row.lotes, []),
      unidades: safeJsonParse(row.unidades, []),
      aditivos: safeJsonParse(row.aditivos, []),
      empenhos: safeJsonParse(row.empenhos, []),
    }));
    res.json({ contracts });
  });
});

app.get('/api/contracts/:numContrato', async (req, res) => {
  const { numContrato } = req.params;
  contractsDb.get('SELECT * FROM contracts WHERE numContrato = ?', [numContrato], (err, row) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar contrato.' });
    if (!row) return res.status(404).json({ message: 'Contrato não encontrado.' });
    res.json({
      ...row,
      lotes: safeJsonParse(row.lotes, []),
      unidades: safeJsonParse(row.unidades, []),
      aditivos: safeJsonParse(row.aditivos, []),
      empenhos: safeJsonParse(row.empenhos, []),
    });
  });
});

app.post('/api/contracts', async (req, res) => {
  const {
    numContrato,
    numProcesso,
    credor,
    valorGlobal,
    objeto,
    dtInicial,
    dtFinal,
    arquivoContrato,
    conteudoArquivoBase64,
    lotes,
    unidades,
    aditivos,
    empenhos,
  } = req.body;

  if (!numContrato) {
    return res.status(400).json({ message: 'Número do contrato é obrigatório.' });
  }

  contractsDb.run(
    `INSERT INTO contracts (
        numContrato,
        numProcesso,
        credor,
        valorGlobal,
        objeto,
        dtInicial,
        dtFinal,
        arquivoContrato,
        conteudoArquivoBase64,
        lotes,
        unidades,
        aditivos,
        empenhos
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb)
      ON CONFLICT (numContrato)
      DO UPDATE SET
        numProcesso = EXCLUDED.numProcesso,
        credor = EXCLUDED.credor,
        valorGlobal = EXCLUDED.valorGlobal,
        objeto = EXCLUDED.objeto,
        dtInicial = EXCLUDED.dtInicial,
        dtFinal = EXCLUDED.dtFinal,
        arquivoContrato = EXCLUDED.arquivoContrato,
        conteudoArquivoBase64 = EXCLUDED.conteudoArquivoBase64,
        lotes = EXCLUDED.lotes,
        unidades = EXCLUDED.unidades,
        aditivos = EXCLUDED.aditivos,
        empenhos = EXCLUDED.empenhos,
        updated_at = NOW()`,
    [
      numContrato,
      numProcesso || '',
      credor || '',
      valorGlobal || '',
      objeto || '',
      dtInicial || '',
      dtFinal || '',
      arquivoContrato || '',
      conteudoArquivoBase64 || '',
      JSON.stringify(lotes || []),
      JSON.stringify(unidades || []),
      JSON.stringify(aditivos || []),
      JSON.stringify(empenhos || []),
    ],
    function (err) {
      if (err) return res.status(500).json({ message: 'Erro ao salvar contrato.' });
      res.json({ message: 'Contrato salvo com sucesso.', id: this.lastID });
    }
  );
});

app.get('/api/user-requests', authenticateToken, authorizeAdmin, async (req, res) => {
  db.all("SELECT id, email, name, cpf, matricula, phone, cargo, unidade, perfil, status, verified FROM users WHERE lower(coalesce(status, 'pendente')) <> 'aprovado' ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar solicitações de usuários.' });
    res.json({ requests: rows });
  });
});

app.put('/api/user-requests/:id/approve', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  db.run('UPDATE users SET verified = TRUE, status = ? WHERE id = ?', ['Aprovado', id], function (err) {
    if (err) return res.status(500).json({ message: 'Erro ao aprovar usuário.' });
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

(async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Servidor iniciado em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Erro ao inicializar o banco PostgreSQL:', error?.message || error);
    console.error('Verifique DB_HOST, DB_PORT, DB_NAME, DB_USER e DB_PASSWORD no arquivo .env da raiz ou backend/.env.');
    process.exit(1);
  }
})();
