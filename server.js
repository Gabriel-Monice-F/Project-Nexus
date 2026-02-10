require('dotenv').config(); // Carrega as credenciais do arquivo .env
const sql = require('mssql');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); // Permite acesso da sua página HTML
app.use(express.json());

// --- CONFIGURAÇÃO DO BANCO DE DADOS (VIA VARIÁVEIS DE AMBIENTE) ---
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER, 
    database: process.env.DB_NAME,
    options: {
        encrypt: true, // Necessário para AWS RDS / Azure
        trustServerCertificate: true // Útil para desenvolvimento local
    }
};

// --- ROTA DA API PARA BUSCAR CHAMADOS ---
app.get('/api/chamados', async (req, res) => {
    try {
        const { dataFim } = req.query; // Recebe a data final para o filtro de 90 dias
        let pool = await sql.connect(config);
        
        const query = `
        SELECT
            c.CODIGO_CHAMADO AS cod_chamado,
            d.nome_fantasia AS cliente,
            e.nome AS tecnico,
            f.descricao AS redef,
            g.descricao AS subref,
            h.descricao AS status,
            REPLACE(REPLACE(ISNULL(CAST(c.descricao AS VARCHAR(MAX)), 'Sem resumo'), CHAR(13), ' '), CHAR(10), ' ') AS resumo_chamado,
            a.data_inicio AS data_bruta_inicio,
            a.data_final AS data_bruta_fim,
            CONVERT(VARCHAR(10), a.data_inicio, 103) AS DIA,
            CONVERT(VARCHAR(5), a.data_inicio, 108) AS INICIO,
            CONVERT(VARCHAR(5), a.data_final, 108) AS FIM,
            CAST(DATEDIFF(MINUTE, a.data_inicio, a.data_final) / 60.0 AS DECIMAL(10,2)) AS HORAS,
            -- Captura o log de cada atendimento individual
            REPLACE(REPLACE(ISNULL(CAST(a.descricao AS VARCHAR(MAX)), 'Sem descrição registrada'), CHAR(13), ' '), CHAR(10), ' ') AS log_texto
        FROM tb_rt_chamado_atendimento AS A
            LEFT JOIN tb_rt_chamado_atd_tecnico AS b ON A.CODIGO_CHAMADO = b.codigo_chamado AND a.codigo_atendimento = b.codigo_atendimento
            LEFT JOIN tb_rt_chamado AS c ON A.CODIGO_CHAMADO = c.codigo_chamado
            LEFT JOIN tb_fin_for_desp_cli AS d ON d.codigo_cfd = c.codigo_cliente
            LEFT JOIN tb_cad_usuario AS e ON e.codigo_usuario = b.codigo_tecnico
            LEFT JOIN tb_rt_chamado_referencia AS f ON c.codigo_referencia = f.codigo_referencia
            LEFT JOIN tb_rt_chamado_subreferencia AS g ON c.codigo_subreferencia = g.codigo_subreferencia
            LEFT JOIN tb_rt_chamado_status AS h ON c.status = h.codigo_status
        WHERE b.codigo_tecnico IN (105, 23, 39, 118, 126, 159, 174, 191, 556, 558) 
        AND c.codigo_referencia IN (700, 701, 702) -- Garanta que estes IDs cobrem as referências desejadas
        AND a.data_inicio >= DATEADD(DAY, -90, '${dataFim}')
        AND a.data_inicio <= '${dataFim} 23:59:59'
        ORDER BY c.CODIGO_CHAMADO DESC, a.data_inicio ASC`;

        let result = await pool.request().query(query);
        
        // Agrupamento para consolidar atendimentos dentro do mesmo chamado
        const agrupado = result.recordset.reduce((acc, curr) => {
            if (!acc[curr.cod_chamado]) {
                acc[curr.cod_chamado] = {
                    ...curr,
                    resumo: curr.resumo_chamado,
                    inclusoes: [],
                    totalHorasChamado: 0,
                    data_inicio: curr.data_bruta_inicio,
                    data_fim: curr.data_bruta_fim
                };
            }
            
            const valorHoras = parseFloat(curr.HORAS) || 0;
            
            acc[curr.cod_chamado].inclusoes.push({
                dia: curr.DIA,
                inicio: curr.INICIO,
                fim: curr.FIM,
                horas: valorHoras.toFixed(2),
                texto: curr.log_texto,
                tecnico_acao: curr.tecnico 
            });

            acc[curr.cod_chamado].totalHorasChamado += valorHoras;
            acc[curr.cod_chamado].data_fim = curr.data_bruta_fim; 

            return acc;
        }, {});

        res.json(Object.values(agrupado));
    } catch (err) {
        console.error("Erro na API:", err.message);
        res.status(500).send(err.message);
    }
});

// Servir os arquivos estáticos (HTML, CSS, JS do frontend)
app.use(express.static(__dirname));

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    -------------------------------------------
    🚀 Nexus Report: Servidor Ativo!
    URL: http://localhost:${PORT}
    -------------------------------------------
    `);
});