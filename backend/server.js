const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');

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
const DB_FILE = path.join(ROOT_DIR, 'database.sqlite');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Erro ao abrir o arquivo de banco de dados:', err);
    process.exit(1);
  }
});

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
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

// A partir de agora, o sistema armazena senhas em texto simples para facilitar o uso.
// A função hashPassword é mantida apenas para compatibilidade com registros antigos.

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

function initDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        name TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'user',
        unidade TEXT DEFAULT '',
        perfil TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Pendente',
        verified INTEGER NOT NULL DEFAULT 0,
        can_view_overview INTEGER NOT NULL DEFAULT 0,
        otp_code TEXT,
        otp_expires INTEGER,
        background_image TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unidade TEXT NOT NULL,
        setor TEXT NOT NULL,
        telefone TEXT NOT NULL,
        ramal TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        location TEXT DEFAULT '',
        responsible TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Ativo'
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS unit_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_code TEXT NOT NULL,
        login TEXT NOT NULL,
        pass TEXT NOT NULL,
        name TEXT DEFAULT '',
        doc TEXT DEFAULT '',
        email TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        role TEXT DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(unit_code) REFERENCES units(code)
      )
    `);

    db.run('ALTER TABLE unit_users ADD COLUMN doc TEXT DEFAULT ""', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });
    db.run('ALTER TABLE unit_users ADD COLUMN email TEXT DEFAULT ""', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });
    db.run('ALTER TABLE unit_users ADD COLUMN phone TEXT DEFAULT ""', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });
    db.run('ALTER TABLE unit_users ADD COLUMN role TEXT DEFAULT ""', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });
    db.run('ALTER TABLE users ADD COLUMN can_view_overview INTEGER NOT NULL DEFAULT 0', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });
    db.run('ALTER TABLE users ADD COLUMN cpf TEXT DEFAULT ""', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });
    db.run('ALTER TABLE users ADD COLUMN matricula TEXT DEFAULT ""', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });
    db.run('ALTER TABLE users ADD COLUMN birthDate TEXT DEFAULT ""', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });
    db.run('ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ""', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });
    db.run('ALTER TABLE users ADD COLUMN cargo TEXT DEFAULT ""', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });
    db.run('ALTER TABLE users ADD COLUMN expirationDate TEXT DEFAULT ""', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });
    db.run('ALTER TABLE users ADD COLUMN observacoes TEXT DEFAULT ""', [], (err) => {
      if (err && !err.message.includes('duplicate column')) console.error(err);
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numContrato TEXT NOT NULL UNIQUE,
        numProcesso TEXT,
        credor TEXT,
        valorGlobal TEXT,
        objeto TEXT,
        dtInicial TEXT,
        dtFinal TEXT,
        arquivoContrato TEXT,
        conteudoArquivoBase64 TEXT,
        lotes TEXT,
        unidades TEXT,
        aditivos TEXT,
        empenhos TEXT
      )
    `);

    function ensureDefaultUser(email, plainPassword, name, role) {
      db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()], (err, row) => {
        if (err) {
          console.error('Erro ao verificar usuário padrão:', err);
          return;
        }
        if (!row) {
          db.run(
            'INSERT INTO users (email, password, name, role, status, verified, can_view_overview) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [email.toLowerCase(), plainPassword, name, role, 'Aprovado', 1, (role === 'developer' || role === 'admin') ? 1 : 0],
            (insertErr) => {
              if (insertErr) {
                console.error('Erro ao criar usuário padrão:', insertErr);
              }
            }
          );
        } else {
          db.run(
            'UPDATE users SET password = ?, name = ?, role = ?, status = ?, verified = 1, can_view_overview = ? WHERE email = ?',
            [plainPassword, name, role, 'Aprovado', (role === 'developer' || role === 'admin') ? 1 : 0, email.toLowerCase()],
            (updateErr) => {
              if (updateErr) {
                console.error('Erro ao atualizar usuário padrão:', updateErr);
              }
            }
          );
        }
      });
    }

    ensureDefaultUser('admin@copal.mt.gov', 'Senha123', 'Administrador COPAL', 'admin');
    ensureDefaultUser('dev@copal.mt.gov', 'Dev2026!', 'Desenvolvedor COPAL', 'developer');
    ensureDefaultUser('2001diegodeoliveir@gmail.com', 'Inter@1909', 'Desenvolvedor', 'developer');
    ensureDefaultUser('devhenrique', 'Inter@1909', 'DEV Henrique', 'developer');
    ensureDefaultUser('copal adm', 'Copal@2026', 'Copal ADM', 'admin');

    db.get('SELECT COUNT(*) AS count FROM contacts', [], (err, row) => {
      if (!err && row && row.count === 0) {
        const defaultContacts = [
          { unidade: 'COPAL', setor: 'Coordenação Geral', telefone: '(65) 3613-5500', ramal: '201' },
          { unidade: 'COPAL', setor: 'Gerência de Contratos', telefone: '(65) 3613-5502', ramal: '205' },
          { unidade: 'SESP', setor: 'Diretoria de TI', telefone: '(65) 3613-5540', ramal: '310 / 312' },
          { unidade: 'PM-MT', setor: 'Comando Geral / Protocolo', telefone: '(65) 3613-8800', ramal: '102' },
          { unidade: 'PJC-MT', setor: 'Superintendência Geral', telefone: '(65) 3613-6800', ramal: 'Ramal Direto' }
        ];
        defaultContacts.forEach(contact => {
          db.run(
            'INSERT INTO contacts (unidade, setor, telefone, ramal) VALUES (?, ?, ?, ?)',
            [contact.unidade, contact.setor, contact.telefone, contact.ramal]
          );
        });
      }
    });

    function ensureUnitAdmin(unitCode) {
      db.get(
        'SELECT id FROM unit_users WHERE unit_code = ? AND upper(login) = ? LIMIT 1',
        [unitCode, 'ADM'],
        (err, row) => {
          if (err) {
            console.error('Erro ao verificar usuário ADM da unidade', unitCode, err);
            return;
          }
          if (!row) {
            db.run(
              'INSERT INTO unit_users (unit_code, login, pass, name, doc, email, phone, role, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [unitCode, 'ADM', '123456', 'Administrador Local', '', '', '', 'Administrator', 1],
              (insertErr) => {
                if (insertErr) {
                  console.error('Erro ao criar ADM padrão da unidade', unitCode, insertErr);
                }
              }
            );
          }
        }
      );
    }

    db.get('SELECT COUNT(*) AS count FROM units', [], (err, row) => {
      if (!err && row && row.count === 0) {
        const defaultUnits = [
          { code: 'CBM-MT', name: 'Corpo de Bombeiros Militar', location: 'Cuiabá - MT', responsible: 'Ten. Cel. Silva' },
          { code: 'PM-MT', name: 'Polícia Militar de Mato Grosso', location: 'Cuiabá - MT', responsible: 'Cel. Souza' },
          { code: 'PJC', name: 'Polícia Judiciária Civil', location: 'Cuiabá - MT', responsible: 'Delegado Lima' }
        ];
        defaultUnits.forEach(unit => {
          db.run(
            'INSERT INTO units (code, name, location, responsible, status) VALUES (?, ?, ?, ?, ?)',
            [unit.code, unit.name, unit.location, unit.responsible, 'Ativo'],
            (insertErr) => {
              if (insertErr) {
                console.error('Erro ao criar unidade padrão:', insertErr);
                return;
              }
              ensureUnitAdmin(unit.code);
            }
          );
        });
      } else if (!err && row && row.count > 0) {
        db.each('SELECT code FROM units', [], (eachErr, unitRow) => {
          if (eachErr) {
            console.error('Erro ao listar unidades para criar ADM padrão:', eachErr);
            return;
          }
          ensureUnitAdmin(unitRow.code);
        });
      }
    });
  });
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

function getSessionByToken(token) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT sessions.token, sessions.user_id, users.email, users.name, users.role, users.unidade, users.perfil, users.status, users.can_view_overview, users.background_image
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
    const plainPassword = password;

    db.run(
      'INSERT INTO users (email, password, name, role, unidade, perfil, status, verified, can_view_overview, otp_code, otp_expires, cpf, matricula, birthDate, phone, cargo, expirationDate, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        email.toLowerCase(),
        plainPassword,
        name || '',
        role || 'user',
        unidade || '',
        perfil || '',
        'Pendente',
        0,
        canViewOverview ? 1 : 0,
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
          if (err.code === 'SQLITE_CONSTRAINT') {
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
    'UPDATE users SET verified = 1, otp_code = NULL, otp_expires = NULL WHERE id = ?',
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
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
  }

  const user = await getUserByEmail(email.toLowerCase());
  if (!user) {
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  const passwordMatches = user.password === password || user.password === hashPassword(password);
  if (!passwordMatches) {
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  if (!user.verified) {
    return res.status(403).json({ message: 'Conta não verificada. Confirme o código enviado por e-mail.' });
  }

  if (user.password !== password) {
    db.run('UPDATE users SET password = ? WHERE id = ?', [password, user.id]);
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
          name: user.name,
          role: user.role || 'user',
          unidade: user.unidade || null,
          perfil: user.perfil || null,
          status: user.status || null,
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
  const key = requesterEmail.toLowerCase();
  requisitionCodeStore[key] = {
    code,
    requesterName,
    requesterMatricula,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };

  try {
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

  const stored = requisitionCodeStore[reqRequesterEmail.toLowerCase()];
  if (!stored || stored.code !== reqVerificationCode || Date.now() > stored.expiresAt) {
    return res.status(400).json({ message: 'Código de validação inválido ou expirado.' });
  }

  if (!reqCompanyEmail) {
    return res.status(400).json({ message: 'E-mail da empresa contratada é obrigatório.' });
  }

  delete requisitionCodeStore[reqRequesterEmail.toLowerCase()];

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
    await sendEmail({
      to: reqCompanyEmail,
      subject: `Requisição ${reqNumberYear || ''} - ${reqCompany}`,
      text: requisitionBody,
      html: emailHtml,
      attachments,
    });

    return res.json({ message: 'Requisição validada e enviada para o e-mail da empresa contratada.' });
  } catch (error) {
    console.error('Erro ao enviar requisição para a empresa:', error);
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
    'SELECT id, email, name, role, unidade, perfil, status, verified, background_image FROM users ORDER BY id DESC',
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
      db.run(
        'INSERT INTO unit_users (unit_code, login, pass, name, doc, email, phone, role, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [code, 'ADM', '123456', 'Administrador Local', '', '', '', 'Administrator', 1],
        (userErr) => {
          if (userErr && userErr.code !== 'SQLITE_CONSTRAINT') {
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
  db.run(
    'INSERT INTO unit_users (unit_code, login, pass, name, doc, email, phone, role, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [unitCode, login, pass, name || '', doc || '', email || '', phone || '', role || '', is_default ? 1 : 0],
    function (err) {
      if (err) return res.status(500).json({ message: 'Erro ao criar usuário da unidade.' });
      res.json({ id: this.lastID, unit_code: unitCode, login, pass, name: name || '', doc: doc || '', email: email || '', phone: phone || '', role: role || '', is_default: is_default ? 1 : 0 });
    }
  );
});

app.put('/api/unit-users/:id', async (req, res) => {
  const { id } = req.params;
  const { login, pass, name, doc, email, phone, role, is_default } = req.body;
  db.run(
    'UPDATE unit_users SET login = ?, pass = ?, name = ?, doc = ?, email = ?, phone = ?, role = ?, is_default = ? WHERE id = ?',
    [login || '', pass || '', name || '', doc || '', email || '', phone || '', role || '', is_default ? 1 : 0, id],
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
    db.get('SELECT * FROM contracts WHERE numContrato = ?', [numContrato], (err, row) => {
      if (err) return res.status(500).json({ message: 'Erro ao buscar contrato.' });
      if (!row) return res.status(404).json({ message: 'Contrato não encontrado.' });
      return res.json({
        ...row,
        lotes: row.lotes ? JSON.parse(row.lotes) : [],
        unidades: row.unidades ? JSON.parse(row.unidades) : [],
        aditivos: row.aditivos ? JSON.parse(row.aditivos) : [],
        empenhos: row.empenhos ? JSON.parse(row.empenhos) : [],
      });
    });
    return;
  }

  db.all('SELECT * FROM contracts ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar contratos.' });
    const contracts = rows.map(row => ({
      ...row,
      lotes: row.lotes ? JSON.parse(row.lotes) : [],
      unidades: row.unidades ? JSON.parse(row.unidades) : [],
      aditivos: row.aditivos ? JSON.parse(row.aditivos) : [],
      empenhos: row.empenhos ? JSON.parse(row.empenhos) : [],
    }));
    res.json({ contracts });
  });
});

app.get('/api/contracts/:numContrato', async (req, res) => {
  const { numContrato } = req.params;
  db.get('SELECT * FROM contracts WHERE numContrato = ?', [numContrato], (err, row) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar contrato.' });
    if (!row) return res.status(404).json({ message: 'Contrato não encontrado.' });
    res.json({
      ...row,
      lotes: row.lotes ? JSON.parse(row.lotes) : [],
      unidades: row.unidades ? JSON.parse(row.unidades) : [],
      aditivos: row.aditivos ? JSON.parse(row.aditivos) : [],
      empenhos: row.empenhos ? JSON.parse(row.empenhos) : [],
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

  db.run(
    `INSERT OR REPLACE INTO contracts (
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  db.all('SELECT id, email, name, cpf, matricula, phone, cargo, unidade, perfil, status, verified FROM users WHERE verified = 0 ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Erro ao buscar solicitações de usuários.' });
    res.json({ requests: rows });
  });
});

app.put('/api/user-requests/:id/approve', authenticateToken, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  db.run('UPDATE users SET verified = 1, status = ? WHERE id = ?', ['Aprovado', id], function (err) {
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

app.listen(PORT, () => {
  initDatabase();
  console.log(`Servidor iniciado em http://localhost:${PORT}`);
});
