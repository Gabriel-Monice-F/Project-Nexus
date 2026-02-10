const sql = require('mssql');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); // Permite que o HTML acesse a API
app.use(express.json());

// --- CONFIGURAÇÃO DO BANCO DE DADOS ---
const config = {
    user: 'DATAMAXI',
    password: 'DTM.4332',
    server: 'datamaxi-adm.crju7xrjlmnz.sa-east-1.rds.amazonaws.com', 
    database: 'dtmremoto',
    options: {
        encrypt: true, // Use true para Azure ou conexões seguras
        trustServerCertificate: true // Importante para redes locais/desenvolvimento
    }
};

// --- ROTA DA API ---

app.get('/api/chamados', async (req, res) => {
    try {
        const { dataInicio, dataFim } = req.query;
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
            WHERE b.codigo_tecnico IN (105, 23, 39, 118, 126, 159, 174, 191, 556,558) 
        AND c.codigo_referencia IN (700, 730)
        -- Puxa 90 dias antes da data final escolhida para ter histórico para a ABC
        AND a.data_inicio >= DATEADD(DAY, -90, '${dataFim}')
        AND a.data_inicio <= '${dataFim} 23:59:59'
        ORDER BY c.CODIGO_CHAMADO DESC, a.data_inicio ASC`; // Ordenação cronológica para o log

        let result = await pool.request().query(query);
        
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
            
            // Adiciona cada interação do usuário ao array de inclusões
            acc[curr.cod_chamado].inclusoes.push({
                dia: curr.DIA,
                inicio: curr.INICIO,
                fim: curr.FIM,
                horas: valorHoras.toFixed(2),
                texto: curr.log_texto,
                tecnico_acao: curr.tecnico // Caso queira mostrar quem fez a ação específica
            });

            acc[curr.cod_chamado].totalHorasChamado += valorHoras;
            // O término do chamado passa a ser o término da última ação registrada
            acc[curr.cod_chamado].data_fim = curr.data_bruta_fim; 

            return acc;
        }, {});

        res.json(Object.values(agrupado));
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Inicialização do servidor
const PORT = 3000;
app.use(express.static(__dirname));
app.listen(PORT, () => {
    console.log(`
    -------------------------------------------
    🚀 Servidor de Relatórios Rodando!
    URL: http://localhost:${PORT}/api/chamados
    -------------------------------------------
    `);
});