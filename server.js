require('dotenv').config(); 
const sql = require('mssql');
const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors()); 
app.use(express.json());

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER, 
    database: process.env.DB_NAME,
    pool: {
        max: 10, 
        min: 2,  // Aumentado para manter conexão sempre pronta
        idleTimeoutMillis: 30000 
    },
    connectTimeout: 60000, 
    requestTimeout: 300000, 
    connectionTimeout: 60000,
    options: {
        encrypt: true, 
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

// --- INICIALIZAÇÃO DO POOL DE CONEXÃO (COM RECONEXÃO AUTOMÁTICA) ---

let poolPromise = null;
let connectionAttempts = 0;
const MAX_ATTEMPTS = 5;
const RETRY_DELAY = 5000;

function criarConexao() {
    if (connectionAttempts >= MAX_ATTEMPTS) {
        console.error('\n❌ Falha ao conectar ao banco de dados após múltiplas tentativas!');
        console.error('Verifique:');
        console.error('  1. DB_USER, DB_PASS, DB_SERVER, DB_NAME no arquivo .env');
        console.error('  2. Se SQL Server está ligado e acessível');
        console.error('  3. Conexão de rede e firewall\n');
        process.exit(1);
    }
    
    connectionAttempts++;
    console.log(`🔄 Conectando ao banco... (tentativa ${connectionAttempts}/${MAX_ATTEMPTS})`);
    
    return sql.connect(config)
        .then(pool => {
            console.log('✅ Conectado ao SQL Server com sucesso!');
            connectionAttempts = 0;
            
            pool.on('error', (err) => {
                console.error('⚠️  Conexão com banco perdida:', err.message);
                poolPromise = null;
                setTimeout(() => {
                    poolPromise = criarConexao();
                }, RETRY_DELAY);
            });
            
            return pool;
        })
        .catch(err => {
            console.error(`❌ Erro na tentativa ${connectionAttempts}:`, err.message);
            console.log(`⏳ Tentando novamente em ${RETRY_DELAY/1000}s...\n`);
            
            return new Promise((resolve) => {
                setTimeout(() => {
                    criarConexao().then(resolve);
                }, RETRY_DELAY);
            });
        });
}

poolPromise = criarConexao();

// --- ROTA DA API PARA BUSCAR CHAMADOS ---
app.get('/api/chamados', async (req, res) => {
    try {
        const { dataInicio, dataFim } = req.query;
        
        // --- VALIDAÇÃO E DEFINIÇÃO DOS FILTROS DINÂMICOS ---
        const defaultTecnicos = [556, 558];
        const defaultReferencias = [700, 730, 731];

        let tecnicosIds = req.query.tecnicos 
            ? req.query.tecnicos.split(',').map(id => parseInt(id.trim())).filter(Number.isInteger)
            : defaultTecnicos;
        
        let referenciasIds = req.query.referencias
            ? req.query.referencias.split(',').map(id => parseInt(id.trim())).filter(Number.isInteger)
            : defaultReferencias;

        if (tecnicosIds.length === 0) tecnicosIds = defaultTecnicos;
        if (referenciasIds.length === 0) referenciasIds = defaultReferencias;

      
        const pool = await poolPromise;
        const request = pool.request();

        // --- CONSTRUÇÃO DA QUERY PARAMETRIZADA ---
        request.input('dataInicio', sql.VarChar, `${dataInicio} 00:00:00`);
        request.input('dataFim', sql.VarChar, `${dataFim} 23:59:59`);

        const tecParams = tecnicosIds.map((id, index) => {
            const paramName = `tecId${index}`;
            request.input(paramName, sql.Int, id);
            return `@${paramName}`;
        }).join(',');

        const refParams = referenciasIds.map((id, index) => {
            const paramName = `refId${index}`;
            request.input(paramName, sql.Int, id);
            return `@${paramName}`;
        }).join(',');
        
        const query = `
        SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
        SET ARITHABORT ON;
        WITH AtendimentosNoPeriodo AS (
            SELECT 
                CODIGO_CHAMADO, 
                codigo_atendimento, 
                descricao, 
                data_inicio, 
                data_final
            FROM tb_rt_chamado_atendimento WITH (NOLOCK)
            WHERE data_inicio >= @dataInicio AND data_inicio <= @dataFim
        ),
        AcoesDosTecnicos AS (
            SELECT 
                codigo_chamado, 
                codigo_atendimento, 
                codigo_tecnico
            FROM tb_rt_chamado_atd_tecnico WITH (NOLOCK)
            WHERE codigo_tecnico IN (${tecParams})
        )
        SELECT
             c.codigo_cliente,
             d.nome_fantasia AS cliente,
             A.CODIGO_CHAMADO AS cod_chamado,
             b.codigo_tecnico AS cod_tec,
             e.nome AS tecnico,
             c.codigo_referencia,
             f.descricao AS redef,
             c.codigo_subreferencia,
             g.descricao AS subref,
             ISNULL(tat.descricao, '1- Requisicao') AS des_atendimento,
             ISNULL(CAST(A.descricao AS VARCHAR(MAX)), '') AS log_texto,
             c.status AS cod_status,
             h.descricao AS status,
             c.data_inclusao,
             a.data_inicio AS data_bruta_inicio,
             a.data_final AS data_bruta_fim,
             CONVERT(VARCHAR(10), a.data_inicio, 103) AS DIA,
             CONVERT(VARCHAR(5), a.data_inicio, 108) AS INICIO,
             CONVERT(VARCHAR(5), a.data_final, 108) AS FIM,
             CAST(DATEDIFF(MINUTE, a.data_inicio, a.data_final) / 60.0 AS DECIMAL(10,2)) AS HORAS,
             ISNULL(CAST(c.descricao AS VARCHAR(MAX)), 'Sem resumo') AS resumo_chamado
        FROM AtendimentosNoPeriodo AS A
        INNER JOIN AcoesDosTecnicos AS b ON A.CODIGO_CHAMADO = b.codigo_chamado AND a.codigo_atendimento = b.codigo_atendimento
        INNER JOIN tb_rt_chamado AS c WITH (NOLOCK) ON A.CODIGO_CHAMADO = c.codigo_chamado AND c.codigo_referencia IN (${refParams})
        INNER JOIN tb_cad_usuario AS e WITH (NOLOCK) ON e.codigo_usuario = b.codigo_tecnico
        INNER JOIN tb_rt_chamado_referencia AS f WITH (NOLOCK) ON c.codigo_referencia = f.codigo_referencia
        INNER JOIN tb_rt_chamado_status AS h WITH (NOLOCK) ON c.status = h.codigo_status
        LEFT JOIN tb_fin_for_desp_cli AS d WITH (NOLOCK) ON d.codigo_cfd = c.codigo_cliente
        LEFT JOIN tb_rt_chamado_subreferencia AS g WITH (NOLOCK) ON c.codigo_subreferencia = g.codigo_subreferencia
        LEFT JOIN tb_rt_chamado_solicitacao AS tat WITH (NOLOCK) on tat.codigo_solicitacao = c.codigo_solicitacao`;

        let result = await request.query(query);
        
        
        const agrupado = result.recordset.reduce((acc, curr) => {
            if (!acc[curr.cod_chamado]) {
                
                const resumoLimpo = (curr.resumo_chamado || '').replace(/[\r\n]+/g, ' ');
                acc[curr.cod_chamado] = {
                    ...curr,
                    resumo: resumoLimpo,
                    inclusoes: [],
                    totalHorasChamado: 0,
                    data_inicio: curr.data_bruta_inicio,
                    data_fim: curr.data_bruta_fim
                };
            }
            
            const valorHoras = parseFloat(curr.HORAS) || 0;
            
            if (curr.DIA) {
                acc[curr.cod_chamado].inclusoes.push({
                    dia: curr.DIA,
                    inicio: curr.INICIO,
                    fim: curr.FIM,
                    horas: valorHoras.toFixed(2),
                    texto: curr.log_texto,
                    tecnico_acao: curr.tecnico,
                    data_sort: curr.data_bruta_inicio 
                });
            }

            acc[curr.cod_chamado].totalHorasChamado += valorHoras;
            acc[curr.cod_chamado].data_fim = curr.data_bruta_fim; 

            return acc;
        }, {});

       
        const finalResult = Object.values(agrupado).map(ticket => {
            
            ticket.inclusoes.sort((a, b) => new Date(a.data_sort) - new Date(b.data_sort));
            return ticket;
        });

        
        finalResult.sort((a, b) => b.cod_chamado - a.cod_chamado);

        res.json(finalResult);
    } catch (err) {
        console.error("Erro na API /api/chamados:", err); 
        let userMessage = "Ocorreu um erro interno no servidor ao processar os dados.";
        
        if (err.code === 'ELOGIN') {
            userMessage = "Falha na autenticação com o banco de dados. Verifique as credenciais no arquivo .env.";
        } else if (err.code === 'ETIMEOUT' || err.code === 'ENETUNREACH' || err.code === 'ECONNRESET') {
            userMessage = "Não foi possível conectar ao servidor do banco de dados. Verifique o endereço do servidor e a conexão de rede.";
        }
        res.status(500).send(userMessage);
    }
});

// --- ROTA DA API PARA BUSCAR NOMES DE TÉCNICOS ---
app.post('/api/tecnicos', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).send('A lista de IDs de técnicos é necessária.');
        }

        // Aguarda o pool global estar pronto
        const pool = await poolPromise;
        const request = pool.request();

        const tecParams = ids.map((id, index) => {
            const paramName = `tecId${index}`;
            request.input(paramName, sql.Int, id);
            return `@${paramName}`;
        }).join(',');

        const query = `SELECT codigo_usuario, nome FROM tb_cad_usuario WITH (NOLOCK) WHERE codigo_usuario IN (${tecParams})`;
        
        let result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error("Erro na API /api/tecnicos:", err);
        res.status(500).send("Ocorreu um erro interno no servidor ao buscar os nomes dos técnicos.");
    }
});

// --- ROTAS ESTÁTICAS E REDIRECIONAMENTO ---


app.get('/', (req, res) => {
    res.redirect('/NexusProject');
});


app.use('/NexusProject', express.static(__dirname));

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    -------------------------------------------
    🚀 Nexus Report: Servidor Ativo!
    URL: http://localhost:${PORT}
    -------------------------------------------
    `);

   
        try {
            const browserSync = require('browser-sync').create();
            browserSync.init({
                proxy: `http://localhost:${PORT}`, 
                files: [
                    'index.html' 
                ],
                port: 4000, 
                open: false,
                notify: false, 
                ui: false, 
                ghostMode: false 
            });

            // Função para detectar o IP da máquina na rede local automaticamente
            const getNetworkIp = () => {
                const interfaces = os.networkInterfaces();
                for (const name of Object.keys(interfaces)) {
                    for (const iface of interfaces[name]) {
                        if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
                            return iface.address;
                        }
                    }
                }
                return 'localhost';
            };
            const machineIp = getNetworkIp();

            console.log(`
    🔥 Hot-Reload Ativo!
    Local:       http://localhost:4000/NexusProject
    Rede (Nome): http://nexusProject:4000/NexusProject
    Rede (IP):   http://${machineIp}:4000/NexusProject
    -------------------------------------------
            `);
        } catch (err) {
            console.log(`
    -------------------------------------------
    ⚠️  Aviso: O Hot-Reload (browser-sync) não pôde ser iniciado.
    Causa: Módulo 'browser-sync' não encontrado.
    Solução: Pare o servidor (Ctrl+C) e rode 'npm install' no terminal.
    O servidor principal continua funcionando em http://localhost:${PORT}
    -------------------------------------------
            `);
        }
});