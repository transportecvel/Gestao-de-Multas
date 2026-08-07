/* ENDPOINTS DO N8N (AZURE) */
const URL_N8N_CTB = "https://n8nd-bjfva4gshggrgbe8.eastus-01.azurewebsites.net/webhook/buscar-ctb";
const URL_N8N_VEICULO = "https://n8nd-bjfva4gshggrgbe8.eastus-01.azurewebsites.net/webhook/buscar-veiculo";
const URL_N8N_SALVAR = "https://n8nd-bjfva4gshggrgbe8.eastus-01.azurewebsites.net/webhook/salvar-multa";
const URL_N8N_LISTAR = "https://n8nd-bjfva4gshggrgbe8.eastus-01.azurewebsites.net/webhook/listar-multas";
const URL_N8N_ATUALIZAR = "https://n8nd-bjfva4gshggrgbe8.eastus-01.azurewebsites.net/webhook/atualizar-multa";
const URL_N8N_EXCLUIR = "https://n8nd-bjfva4gshggrgbe8.eastus-01.azurewebsites.net/webhook/excluir-multa";

const SITUACOES_MAP = {
    IDENTIFICAR_CONDUTOR: { label: "🔍 Identificar Condutor" },
    POSTADA: { label: "✉️ Postada" },
    PAGAR: { label: "💳 Pagar (Boleto)" },
    PAGA: { label: "✅ Paga" },
    ADVERTENCIA: { label: "📜 Advertência" },
    VENCIDA: { label: "⚠️ Vencida" },
    PAGO_LICENCIAMENTO: { label: "🚗 Licenciamento" }
};

const ARTIGOS_PADRAO = [
    { artigo: "257, § 8º", codigo: "50020", descricao: "Multa, por não identificação do condutor infrator, imposta à pessoa jurídica", gravidade: "---", infrator: "PESSOA JURÍDICA" },
    { artigo: "162, I", codigo: "50100", descricao: "Dirigir veículo sem possuir CNH ou Permissão para Dirigir", gravidade: "7 - Gravíss 3X", infrator: "CONDUTOR" },
    { artigo: "162, II", codigo: "50290", descricao: "Dirigir veículo com CNH ou PPD cassada", gravidade: "7 - Gravíss 5X", infrator: "CONDUTOR" },
    { artigo: "162, V", codigo: "50531", descricao: "Dirigir veículo com validade de CNH/PPD vencida há mais de 30 dias", gravidade: "7 - Gravíss", infrator: "CONDUTOR" },
    { artigo: "167", codigo: "51851", descricao: "Deixar o condutor ou passageiro de usar o cinto de segurança", gravidade: "5 - Grave", infrator: "CONDUTOR" }
];

let listaInfracoesCache = [];
let bancoMultas = [];
let multasFiltradas = [];
let chart1Instance = null, chart2Instance = null, chart3Instance = null;

/* CONTROLE DA BARRA DE PROGRESSO DE CARREGAMENTO INICIAL */
function atualizarProgressoGeral(porcentagem, mensagem) {
    const bar = document.getElementById('loaderProgressBar');
    const pct = document.getElementById('loaderPercentage');
    const txt = document.getElementById('loaderStatusText');

    if (bar) bar.style.width = `${porcentagem}%`;
    if (pct) pct.innerText = `${porcentagem}%`;
    if (txt && mensagem) txt.innerText = mensagem;
}

function ocultarLoaderGlobal() {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => loader.style.display = 'none', 500);
    }
}

/* FUNÇÕES AUXILIARES DE CONTROLE DE SPINNER DE CARREGAMENTO LOCAL */
function showLoading(wrapperId) {
    const wrap = document.getElementById(wrapperId);
    if (wrap) wrap.classList.add('is-loading');
}

function hideLoading(wrapperId) {
    const wrap = document.getElementById(wrapperId);
    if (wrap) wrap.classList.remove('is-loading');
}

document.addEventListener('DOMContentLoaded', async () => {
    initTruckCanvasAnimation();
    
    // FLUXO DE CARREGAMENTO INICIAL EM ETAPAS (0% A 100%)
    try {
        atualizarProgressoGeral(10, "Iniciando conexões do sistema...");
        
        await povoarSelectsInfracoes();
        atualizarProgressoGeral(40, "Legislação e artigos CTB carregados...");

        await carregarPlacasDaFrota();
        atualizarProgressoGeral(70, "Frota e lista de veículos conectadas...");

        await carregarMultasDoN8N();
        atualizarProgressoGeral(95, "Multas operacionais finalizadas...");

        atualizarProgressoGeral(100, "Concluído!");
        setTimeout(ocultarLoaderGlobal, 400);

    } catch (err) {
        console.warn("Aviso durante o carregamento inicial:", err);
        atualizarProgressoGeral(100, "Carregado com avisos");
        setTimeout(ocultarLoaderGlobal, 600);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modaisAbertos = document.querySelectorAll('.modal.active');
            modaisAbertos.forEach(m => fecharModal(m.id));
        }
    });
});

/* BUSCA TODAS AS PLACAS CADASTRADAS NA ABA FROTA PARA PREENCHER O SELECT */
async function carregarPlacasDaFrota() {
    const selectPlaca = document.getElementById('mPlaca');
    if (!selectPlaca) return;
    
    showLoading('wrapPlaca');
    selectPlaca.innerHTML = `<option value="">-- Selecione a Placa --</option>`;
    try {
        const response = await fetch(URL_N8N_VEICULO);
        const dados = await response.json();
        
        if (Array.isArray(dados)) {
            dados.forEach(item => {
                const placaBruta = item['PLACA'] || item.placa || '';
                
                if (placaBruta) {
                    const placaLimpa = placaBruta.toString().replace('-', '').trim().toUpperCase();
                    const option = document.createElement('option');
                    option.value = placaLimpa;
                    option.textContent = placaLimpa;
                    selectPlaca.appendChild(option);
                }
            });
        }
    } catch (err) {
        console.warn("Erro ao carregar lista de placas do n8n:", err);
    } finally {
        hideLoading('wrapPlaca');
    }
}

/* BUSCA AS MULTAS CADASTRADAS DA PLANILHA VIA N8N */
async function carregarMultasDoN8N() {
    try {
        const response = await fetch(URL_N8N_LISTAR);
        const dados = await response.json();
        
        if (Array.isArray(dados)) {
            bancoMultas = dados.map(item => ({
                id: String(item["ID"] || item.id || "m_" + Math.random().toString(36).substr(2, 9)),
                placa: item["PLACA"] || item.placa || "",
                frota: item["FROTA"] || item.frota || "",
                modelo: item["MODELO"] || item.modelo || "",
                filial: item["FILIAL"] || item.filial || "",
                cnpj: item["CNPJ"] || item.cnpj || "",
                autoInfracao: item["AUTO INFRAÇÃO"] || item.autoInfracao || "",
                situacao: item["SITUAÇÃO"] || item.situacao || "IDENTIFICAR_CONDUTOR",
                condutor: item["NOME CONDUTOR"] || item.condutor || "",
                artigoCTB: item["AMPARO LEGAL (CTB)"] || item.artigoCTB || "",
                codigoInfracao: item["CÓDIGO INFRAÇÃO"] || item.codigoInfracao || "",
                infracaoNome: item["DESCRIÇÃO INFRAÇÃO"] || item.infracaoNome || "",
                dataInfracao: item["DATA INFRAÇÃO"] || item.dataInfracao || "",
                dataVencimento: item["DATA VENCIMENTO"] || item.dataVencimento || "",
                dataVencimentoBoleto: item["DATA VENCIMENTO BOLETO"] || item.dataVencimentoBoleto || "",
                gravidade: item["GRAVIDADE"] || item.gravidade || "---",
                infratorCTB: item["INFRATOR"] || item.infratorCTB || item["PROPRIETÁRIO/INFRATOR"] || "-",
                valor: parseFloat(item["VALOR BASE"] || item.valor || 0),
                porcentagemDesconto: parseFloat(item["DESCONTO (%)"] || item.porcentagemDesconto || 0),
                valorDesconto: parseFloat(item["VALOR LÍQUIDO"] || item.valorDesconto || 0),
                entregueRH: (item["ENTREGUE RH"] || item.entregueRH) === "SIM" || item.entregueRH === true,
                dataEntregueRH: item["DATA ENTREGUE RH"] || item.dataEntregueRH || "",
                entregueFinanceiro: (item["ENTREGUE FINANCEIRO"] || item.entregueFinanceiro) === "SIM" || item.entregueFinanceiro === true,
                dataEntregueFinanceiro: item["DATA ENTREGUE FINANCEIRO"] || item.dataEntregueFinanceiro || "",
                obs: item["OBSERVAÇÕES"] || item.obs || ""
            }));
        }
    } catch (err) {
        console.warn("Erro ao buscar multas no n8n, tentando recuperar do localStorage cache:", err);
        const salvos = localStorage.getItem('db_multas_master_v11');
        if (salvos) bancoMultas = JSON.parse(salvos);
    }

    aplicarFiltros();
    verificarAlertaPopUpInicial();
}

/* EXIBE/OCULTA A DATA DO BOLETO COM BASE NA SITUAÇÃO */
function toggleDataBoleto() {
    const sit = document.getElementById('mSituacao').value;
    const box = document.getElementById('boxDataBoleto');
    
    if (sit === 'PAGAR' || sit === 'PAGA' || sit === 'VENCIDA') {
        box.style.display = 'block';
    } else {
        box.style.display = 'none';
        document.getElementById('mDataVencimentoBoleto').value = '';
    }
}

/* EXIBE/OCULTA CAMPOS DE DATA COM BASE NOS SWITCHES */
function toggleDataSetor(setor) {
    if (setor === 'RH') {
        const isChecked = document.getElementById('mEntregueRH').checked;
        const box = document.getElementById('boxDataRH');
        const field = document.getElementById('mDataEntregueRH');
        box.style.display = isChecked ? 'block' : 'none';
        if (isChecked && !field.value) {
            field.value = new Date().toISOString().split('T')[0];
        } else if (!isChecked) {
            field.value = '';
        }
    } else if (setor === 'Financeiro') {
        const isChecked = document.getElementById('mEntregueFinanceiro').checked;
        const box = document.getElementById('boxDataFinanceiro');
        const field = document.getElementById('mDataEntregueFinanceiro');
        box.style.display = isChecked ? 'block' : 'none';
        if (isChecked && !field.value) {
            field.value = new Date().toISOString().split('T')[0];
        } else if (!isChecked) {
            field.value = '';
        }
    }
}

/* ANIMAÇÃO DE CAMINHÕES (CANVAS) */
function initTruckCanvasAnimation() {
    const canvas = document.getElementById('truckCanvas');
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    let angle = 0;

    const caminhões = [
        { type: 'TOCO', x: -180, y: canvas.height * 0.72, speed: 1.8, scale: 0.85, color: '#2563eb' },
        { type: 'TRUCK', x: -450, y: canvas.height * 0.82, speed: 2.3, scale: 0.95, color: '#059669' }
    ];

    function drawTruck(t) {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.scale(t.scale, t.scale);

        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
        ctx.beginPath(); ctx.ellipse(90, 48, 100, 10, 0, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = t.color;
        ctx.beginPath(); ctx.roundRect(130, 0, 45, 42, [8, 12, 4, 4]); ctx.fill();

        ctx.fillStyle = "#38bdf8";
        ctx.beginPath(); ctx.roundRect(148, 6, 22, 16, [2, 6, 2, 2]); ctx.fill();

        ctx.fillStyle = "#e2e8f0"; ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 2;
        const baúWidth = t.type === 'TRUCK' ? 140 : 100;
        ctx.beginPath(); ctx.roundRect(0, -8, baúWidth, 48, 4); ctx.fill(); ctx.stroke();

        ctx.fillStyle = t.color; ctx.fillRect(0, 14, baúWidth, 6);
        ctx.fillStyle = "#fef08a"; ctx.beginPath(); ctx.arc(174, 28, 4, 0, Math.PI * 2); ctx.fill();

        function drawWheel(wx, wy) {
            ctx.save();
            ctx.translate(wx, wy); ctx.rotate(angle);
            ctx.fillStyle = "#1e293b"; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#94a3b8"; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        drawWheel(150, 42);
        if (t.type === 'TOCO') { drawWheel(25, 42); }
        else { drawWheel(25, 42); drawWheel(50, 42); }

        ctx.restore();
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        angle += 0.08;
        caminhões.forEach(t => {
            t.y = canvas.height * (t.type === 'TRUCK' ? 0.82 : 0.70);
            t.x += t.speed;
            if (t.x > canvas.width + 200) t.x = -300 - Math.random() * 200;
            drawTruck(t);
        });
        requestAnimationFrame(animate);
    }
    animate();
}

function alternarTema() {
    const body = document.body;
    const isDark = body.getAttribute('data-theme') === 'dark';
    body.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('themeIcon').innerText = isDark ? '☀️' : '🌙';
}

/* POVOA OS SELECTS USANDO AS COLUNAS DA PLANILHA "INFRAÇÃO" */
async function povoarSelectsInfracoes() {
    const selectArt = document.getElementById('mArtigoCTB');
    const selectDesc = document.getElementById('mInfracaoNomeSelect');
    const selectCodigo = document.getElementById('mCodigoInfracao'); 

    showLoading('wrapArtigo');
    showLoading('wrapInfracao');
    if (selectCodigo) showLoading('wrapCodigo');

    selectArt.innerHTML = `<option value="">-- Selecione o Artigo CTB --</option>`;
    selectDesc.innerHTML = `<option value="">-- Selecione a Descrição da Infração --</option>`;
    if (selectCodigo) selectCodigo.innerHTML = `<option value="">-- Selecione o Código --</option>`;

    try {
        const response = await fetch(`${URL_N8N_CTB}?listar=todos`);
        const dados = await response.json();
        listaInfracoesCache = Array.isArray(dados) ? dados : ARTIGOS_PADRAO;
    } catch (e) {
        listaInfracoesCache = ARTIGOS_PADRAO;
    } finally {
        hideLoading('wrapArtigo');
        hideLoading('wrapInfracao');
        if (selectCodigo) hideLoading('wrapCodigo');
    }

    listaInfracoesCache.forEach((item, index) => {
        const art = item['Amparo Legal (CTB)'] || item.artigo || '';
        const desc = item['Descrição da Infração'] || item.descricao || '';
        const cod = item['Código da Infração'] || item.codigo || item['Código'] || ''; 
        
        selectArt.innerHTML += `<option value="${index}">${art} - ${desc.substring(0, 40)}...</option>`;
        selectDesc.innerHTML += `<option value="${index}">${desc}</option>`;
        
        if (selectCodigo) {
            selectCodigo.innerHTML += `<option value="${index}">${cod} - ${desc.substring(0, 20)}...</option>`; 
        }
    });
}

function aoSelecionarArtigo() {
    const idx = document.getElementById('mArtigoCTB').value;
    if (idx === "") return;
    document.getElementById('mInfracaoNomeSelect').value = idx;
    
    const selectCodigo = document.getElementById('mCodigoInfracao');
    if (selectCodigo) selectCodigo.value = idx;
    
    processarSelecaoInfracao(listaInfracoesCache[idx]);
}

function aoSelecionarDescricao() {
    const idx = document.getElementById('mInfracaoNomeSelect').value;
    if (idx === "") return;
    document.getElementById('mArtigoCTB').value = idx;
    
    const selectCodigo = document.getElementById('mCodigoInfracao');
    if (selectCodigo) selectCodigo.value = idx;
    
    processarSelecaoInfracao(listaInfracoesCache[idx]);
}

function aoSelecionarCodigo() {
    const selectCodigo = document.getElementById('mCodigoInfracao');
    if (!selectCodigo) return;
    
    const idx = selectCodigo.value;
    if (idx === "") return;
    
    document.getElementById('mArtigoCTB').value = idx; 
    document.getElementById('mInfracaoNomeSelect').value = idx; 
    
    processarSelecaoInfracao(listaInfracoesCache[idx]);
}

function processarSelecaoInfracao(item) {
    if (!item) return;

    const desc = item['Descrição da Infração'] || item.descricao || '';
    const artigo = item['Amparo Legal (CTB)'] || item.artigo || '';
    const gravidadeTexto = (item['Gravidade'] || item.gravidade || '').toUpperCase().trim();
    const infratorValor = item['Infrator'] || item.infrator || item['PROPRIETÁRIO/INFRATOR'] || item['Proprietário / Infrator'] || 'CONDUTOR';

    document.getElementById('mInfracaoNome').value = desc;
    document.getElementById('mGravidade').value = gravidadeTexto;
    document.getElementById('mInfratorCTB').value = infratorValor.toUpperCase().trim();

    const campoCondutor = document.getElementById('mCondutor');
    if (artigo.includes('257') || desc.toLowerCase().includes('não identificação do condutor')) {
        campoCondutor.required = false;
        campoCondutor.placeholder = "Opcional (Multa NIC - Pessoa Jurídica)";
        if (!campoCondutor.value) {
            campoCondutor.value = "NÃO APLICÁVEL (MULTA NIC / PJ)";
        }
    } else {
        campoCondutor.placeholder = "Ex: João da Silva";
        if (campoCondutor.value === "NÃO APLICÁVEL (MULTA NIC / PJ)") {
            campoCondutor.value = "";
        }
    }

    const valAtual = parseFloat(document.getElementById('mValor').value);
    if (!valAtual || valAtual === 0) {
        let valorCalculado = 0;
        if (gravidadeTexto.includes('LEVE') || gravidadeTexto.startsWith('3')) valorCalculado = 88.38;
        else if (gravidadeTexto.includes('MÉD') || gravidadeTexto.includes('MED') || gravidadeTexto.startsWith('4')) valorCalculado = 130.16;
        else if (gravidadeTexto.includes('GRAVE') && !gravidadeTexto.includes('GRAVÍSS') && !gravidadeTexto.includes('GRAVISS')) valorCalculado = 195.23;
        else if (gravidadeTexto.includes('GRAVÍSS') || gravidadeTexto.includes('GRAVISS') || gravidadeTexto.startsWith('7')) {
            let base = 293.47, multiplicador = 1;
            if (gravidadeTexto.includes('2X')) multiplicador = 2;
            else if (gravidadeTexto.includes('3X')) multiplicador = 3;
            else if (gravidadeTexto.includes('5X')) multiplicador = 5;
            else if (gravidadeTexto.includes('10X')) multiplicador = 10;
            valorCalculado = base * multiplicador;
        } else valorCalculado = 260.32;

        document.getElementById('mValor').value = valorCalculado.toFixed(2);
    }
    calcularDesconto();
}

/* BUSCA VEÍCULO NO N8N E MAPEIA A LINHA CORRETA PELA PLACA SELECIONADA */
async function buscarVeiculoNoN8N() {
    const selectElem = document.getElementById('mPlaca');
    const placaSelecionada = selectElem.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    if (!placaSelecionada) {
        document.getElementById('mFrota').value = '';
        document.getElementById('mModelo').value = '';
        document.getElementById('mFilial').value = '';
        document.getElementById('mCnpj').value = '';
        return;
    }

    showLoading('wrapPlaca');
    try {
        const response = await fetch(`${URL_N8N_VEICULO}?placa=${encodeURIComponent(placaSelecionada)}`);
        const dados = await response.json();
        
        let item = null;

        if (Array.isArray(dados)) {
            item = dados.find(v => {
                const p = (v['PLACA'] || v.placa || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
                return p === placaSelecionada;
            });
        } else if (dados && typeof dados === 'object') {
            const p = (dados['PLACA'] || dados.placa || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (p === placaSelecionada) item = dados;
        }

        if (item) {
            document.getElementById('mFrota').value = item['FROTA'] || item.frota || '';
            document.getElementById('mModelo').value = item['MODELO'] || item.modelo || '';
            document.getElementById('mFilial').value = item['FILIAL'] || item.filial || '';
            document.getElementById('mCnpj').value = item['CNPJ'] || item.cnpj || '';
        } else {
            document.getElementById('mFrota').value = '';
            document.getElementById('mModelo').value = '';
            document.getElementById('mFilial').value = '';
            document.getElementById('mCnpj').value = '';
        }
    } catch (e) { 
        console.warn("Erro ao buscar veículo no n8n:", e); 
    } finally {
        hideLoading('wrapPlaca');
    }
}

function calcularDesconto() {
    const valTotal = parseFloat(document.getElementById('mValor').value) || 0;
    const pct = parseFloat(document.getElementById('mPorcentagemDesconto').value) || 0;
    const valLiq = valTotal * (1 - (pct / 100));
    document.getElementById('mValorDesconto').value = valLiq > 0 ? valLiq.toFixed(2) : "0.00";
}

function aplicarFiltros() {
    const bGeral = document.getElementById('fBuscaGeral').value.toLowerCase().trim();
    const fSituacao = document.getElementById('fSituacao').value;
    const fOrdenacao = document.getElementById('fOrdenacao').value;

    multasFiltradas = bancoMultas.filter(m => {
        const matchGeral = !bGeral || [m.placa, m.frota, m.modelo, m.condutor, m.autoInfracao, m.artigoCTB, m.infracaoNome, m.infratorCTB]
            .some(f => String(f || '').toLowerCase().includes(bGeral));
        const matchSituacao = !fSituacao || m.situacao === fSituacao;
        return matchGeral && matchSituacao;
    });

    ordenarDados(multasFiltradas, fOrdenacao);
    document.getElementById('txtTotalMultas').innerText = `${multasFiltradas.length} multa(s) encontrada(s)`;
    renderTabelaMultas();
    renderAgendaPrazos();
    atualizarKPIs();
}

function ordenarDados(lista, criterio) {
    const ordem = { 'IDENTIFICAR_CONDUTOR': 1, 'PAGAR': 2, 'POSTADA': 3, 'VENCIDA': 4, 'ADVERTENCIA': 5, 'PAGO_LICENCIAMENTO': 6, 'PAGA': 7 };
    lista.sort((a, b) => {
        if (criterio === 'SITUACAO_PRIORIDADE') return (ordem[a.situacao] || 99) - (ordem[b.situacao] || 99);
        if (criterio === 'VENCIMENTO_ASC') return (a.dataVencimento || '9999').localeCompare(b.dataVencimento || '9999');
        if (criterio === 'DATA_INFRAÇÃO_DESC') return (b.dataInfracao || '').localeCompare(a.dataInfracao || '');
        if (criterio === 'VALOR_DESC') return (b.valorDesconto || 0) - (a.valorDesconto || 0);
        if (criterio === 'PLACA') return (a.placa || '').localeCompare(b.placa || '');
        return 0;
    });
}

function renderTabelaMultas() {
    const tbody = document.getElementById('tbodyMultas');
    tbody.innerHTML = "";

    multasFiltradas.forEach(m => {
        let tr = document.createElement('tr');
        tr.onclick = () => abrirFichaModal(m.id);
        tr.innerHTML = `
            <td><strong>${m.placa}</strong> <small>(${m.frota || 's/f'})</small></td>
            <td>${m.modelo || '-'}</td>
            <td><strong>${m.autoInfracao}</strong></td>
            <td>${m.condutor ? m.condutor : '<em style="color:#c2410c;">⚠️ Identificar</em>'}</td>
            <td>${formatarData(m.dataInfracao)}</td>
            <td><strong>${m.artigoCTB || ''}</strong></td>
            <td><strong>R$ ${(m.valorDesconto || m.valor || 0).toFixed(2)}</strong></td>
            <td><strong>${formatarData(m.dataVencimento)}</strong></td>
            <td><span class="badge-status status-${m.situacao}">${SITUACOES_MAP[m.situacao] ? SITUACOES_MAP[m.situacao].label : m.situacao}</span></td>
            <td style="text-align:center;">
                <button class="btn-tbl" onclick="event.stopPropagation(); abrirFichaModal('${m.id}')" title="Ver Ficha">👁️</button>
                <button class="btn-tbl" onclick="event.stopPropagation(); editarMulta('${m.id}')" title="Editar">✏️</button>
                <button class="btn-tbl" onclick="event.stopPropagation(); excluirMulta('${m.id}')" title="Excluir">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAgendaPrazos() {
    const grid = document.getElementById('gridAgendaPrazos');
    grid.innerHTML = "";
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    const pendentes = bancoMultas.filter(m => !['PAGA', 'ADVERTENCIA', 'PAGO_LICENCIAMENTO'].includes(m.situacao) && m.dataVencimento);
    pendentes.sort((a,b) => a.dataVencimento.localeCompare(b.dataVencimento));

    pendentes.forEach(m => {
        const dtVenc = new Date(m.dataVencimento + 'T00:00:00');
        const diffDias = Math.ceil((dtVenc - hoje) / (1000 * 60 * 60 * 24));
        let badgeClass = diffDias <= 5 ? "time-red" : "time-yellow";

        grid.innerHTML += `
            <div class="agenda-card" onclick="abrirFichaModal('${m.id}')">
                <div class="agenda-info">
                    <span class="agenda-placa">${m.placa} (${m.frota || 's/f'})</span>
                    <span class="agenda-auto">${m.autoInfracao}</span>
                </div>
                <div class="agenda-time ${badgeClass}">${diffDias < 0 ? 'Atrasada' : diffDias + ' dias'}<br><small>${formatarData(m.dataVencimento)}</small></div>
            </div>
        `;
    });
}

function abrirModalFiltroData() {
    document.getElementById('fCalDataInicio').value = "";
    document.getElementById('fCalDataFim').value = "";
    const modal = document.getElementById('modalFiltroData');
    modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10);
}

function limparFiltroData() {
    document.getElementById('fCalDataInicio').value = "";
    document.getElementById('fCalDataFim').value = "";
}

function executarFiltroData() {
    const inicio = document.getElementById('fCalDataInicio').value;
    const fim = document.getElementById('fCalDataFim').value;

    if (!inicio) {
        alert("Por favor, selecione ao menos a Data Inicial.");
        return;
    }

    const lista = bancoMultas.filter(m => {
        if (!m.dataInfracao) return false;
        if (fim) {
            return m.dataInfracao >= inicio && m.dataInfracao <= fim;
        } else {
            return m.dataInfracao === inicio;
        }
    });

    document.getElementById('resDataTitulo').innerText = fim ? `Multas de ${formatarData(inicio)} até ${formatarData(fim)}` : `Multas do Dia ${formatarData(inicio)}`;
    document.getElementById('resDataSub').innerText = `${lista.length} infração(ões) encontrada(s) neste período`;

    const tbody = document.getElementById('tbodyResultadoData');
    tbody.innerHTML = "";

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Nenhuma multa registrada nesta data/período.</td></tr>`;
    } else {
        lista.forEach(m => {
            tbody.innerHTML += `
                <tr onclick="abrirFichaModal('${m.id}')">
                    <td><strong>${m.placa}</strong> (${m.frota || 's/f'})</td>
                    <td>${m.autoInfracao}</td>
                    <td>${m.condutor || 'Pendente'}</td>
                    <td>${formatarData(m.dataInfracao)}</td>
                    <td>R$ ${(m.valorDesconto || 0).toFixed(2)}</td>
                    <td><span class="badge-status status-${m.situacao}">${SITUACOES_MAP[m.situacao] ? SITUACOES_MAP[m.situacao].label : m.situacao}</span></td>
                </tr>
            `;
        });
    }

    fecharModal('modalFiltroData');
    const modalRes = document.getElementById('modalResultadoData');
    modalRes.style.display = 'flex'; setTimeout(() => modalRes.classList.add('active'), 10);
}

function abrirPopUpSituacao(sit) {
    const lista = bancoMultas.filter(m => m.situacao === sit);
    const tbody = document.getElementById('tbodyKPIPopUp');
    tbody.innerHTML = "";
    document.getElementById('kpiPopUpTitulo').innerText = `Multas: ${SITUACOES_MAP[sit] ? SITUACOES_MAP[sit].label : sit}`;

    lista.forEach(m => {
        tbody.innerHTML += `
            <tr onclick="abrirFichaModal('${m.id}')">
                <td><strong>${m.placa}</strong> (${m.frota || 's/f'})</td>
                <td>${m.autoInfracao}</td>
                <td>${m.condutor || 'Pendente'}</td>
                <td>${formatarData(m.dataVencimento)}</td>
                <td>R$ ${(m.valorDesconto || 0).toFixed(2)}</td>
            </tr>
        `;
    });
    const modal = document.getElementById('modalKPIPopUp');
    modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10);
}

function verificarAlertaPopUpInicial() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const criticas = bancoMultas.filter(m => {
        if (['PAGA', 'ADVERTENCIA', 'PAGO_LICENCIAMENTO'].includes(m.situacao) || !m.dataVencimento) return false;
        const dt = new Date(m.dataVencimento + 'T00:00:00');
        const diff = Math.ceil((dt - hoje) / (1000 * 60 * 60 * 24));
        return diff <= 14;
    });

    if (criticas.length > 0) {
        const tbody = document.getElementById('tbodyAlertaInicial');
        tbody.innerHTML = "";
        criticas.forEach(m => {
            tbody.innerHTML += `
                <tr onclick="abrirFichaModal('${m.id}')">
                    <td><strong>${m.placa}</strong> (${m.frota || 's/f'})</td>
                    <td>${m.autoInfracao}</td>
                    <td>${m.condutor || '⚠️ Indicar'}</td>
                    <td><strong>${formatarData(m.dataVencimento)}</strong></td>
                    <td><span class="badge-status status-${m.situacao}">${SITUACOES_MAP[m.situacao] ? SITUACOES_MAP[m.situacao].label : m.situacao}</span></td>
                </tr>
            `;
        });
        const modal = document.getElementById('modalAlertaInicial');
        modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10);
    }
}

function abrirDashboardAnalitico() {
    const modal = document.getElementById('modalAnalytics');
    modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10);

    const situacoesCounts = {};
    const gravidadeCounts = {};
    const veiculosCounts = {};

    bancoMultas.forEach(m => {
        const s = SITUACOES_MAP[m.situacao] ? SITUACOES_MAP[m.situacao].label : m.situacao;
        situacoesCounts[s] = (situacoesCounts[s] || 0) + 1;

        const g = m.gravidade || "MÉDIA";
        gravidadeCounts[g] = (gravidadeCounts[g] || 0) + 1;

        const v = `${m.placa} (${m.frota || 's/f'})`;
        veiculosCounts[v] = (veiculosCounts[v] || 0) + 1;
    });

    if (chart1Instance) chart1Instance.destroy();
    chart1Instance = new Chart(document.getElementById('chartSituacao'), {
        type: 'doughnut',
        data: { labels: Object.keys(situacoesCounts), datasets: [{ data: Object.values(situacoesCounts), backgroundColor: ['#f97316', '#3b82f6', '#eab308', '#22c55e', '#a855f7', '#ef4444', '#14b8a6'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    if (chart2Instance) chart2Instance.destroy();
    chart2Instance = new Chart(document.getElementById('chartGravidade'), {
        type: 'pie',
        data: { labels: Object.keys(gravidadeCounts), datasets: [{ data: Object.values(gravidadeCounts), backgroundColor: ['#3b82f6', '#eab308', '#f97316', '#ef4444'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    if (chart3Instance) chart3Instance.destroy();
    chart3Instance = new Chart(document.getElementById('chartVeiculos'), {
        type: 'bar',
        data: { labels: Object.keys(veiculosCounts), datasets: [{ label: 'Qtd. de Infrações', data: Object.values(veiculosCounts), backgroundColor: '#2563eb' }] },
        options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}

function abrirModalFiltroRelatorio() {
    const modal = document.getElementById('modalFiltroRelatorio');
    modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10);
}

function gerarEImprimirRelatorio() {
    const fSit = document.getElementById('rptFilterSituacao').value;
    const fFrota = document.getElementById('rptFilterFrota').value.toLowerCase().trim();
    const fCondutor = document.getElementById('rptFilterCondutor').value.toLowerCase().trim();

    const filtradasRpt = bancoMultas.filter(m => {
        const mSit = !fSit || m.situacao === fSit;
        const mFrota = !fFrota || (m.frota && m.frota.toLowerCase().includes(fFrota));
        const mCond = !fCondutor || (m.condutor && m.condutor.toLowerCase().includes(fCondutor));
        return mSit && mFrota && mCond;
    });

    const hoje = new Date();
    document.getElementById('printDataEmissao').innerText = `Emissão: ${hoje.toLocaleDateString('pt-BR')}`;
    document.getElementById('printFiltrosUsados').innerText = `Filtros: ${fSit && SITUACOES_MAP[fSit] ? SITUACOES_MAP[fSit].label : 'Todas'} | Frota: ${fFrota || 'Todas'}`;

    const tbody = document.getElementById('printTbody');
    tbody.innerHTML = "";
    let somaValor = 0;

    filtradasRpt.forEach(m => {
        const vLiq = m.valorDesconto || m.valor || 0;
        somaValor += vLiq;

        const rhTexto = m.entregueRH ? `Sim (${formatarData(m.dataEntregueRH)})` : 'Não';
        const finTexto = m.entregueFinanceiro ? `Sim (${formatarData(m.dataEntregueFinanceiro)})` : 'Não';

        tbody.innerHTML += `
            <tr>
                <td><strong>${m.placa}</strong> (${m.frota || 's/f'})</td>
                <td>${m.modelo || '-'}</td>
                <td>${m.autoInfracao}</td>
                <td>${m.condutor || 'Pendente'}</td>
                <td>${m.artigoCTB || '-'}</td>
                <td>R$ ${vLiq.toFixed(2)}</td>
                <td>${rhTexto}</td>
                <td>${finTexto}</td>
                <td>${SITUACOES_MAP[m.situacao] ? SITUACOES_MAP[m.situacao].label : m.situacao}</td>
            </tr>
        `;
    });

    document.getElementById('printTotalValor').innerText = `R$ ${somaValor.toFixed(2)}`;
    document.getElementById('printTotalQtd').innerText = `${filtradasRpt.length} multa(s)`;

    fecharModal('modalFiltroRelatorio');
    setTimeout(() => window.print(), 300);
}

function atualizarKPIs() {
    let counts = { IDENTIFICAR_CONDUTOR: 0, POSTADA: 0, PAGAR: 0, PAGA: 0, ADVERTENCIA: 0, VENCIDA: 0, PAGO_LICENCIAMENTO: 0 };
    bancoMultas.forEach(m => { if (counts[m.situacao] !== undefined) counts[m.situacao]++; });
    document.getElementById('kpiIdentificar').innerText = counts.IDENTIFICAR_CONDUTOR;
    document.getElementById('kpiPostada').innerText = counts.POSTADA;
    document.getElementById('kpiPagar').innerText = counts.PAGAR;
    document.getElementById('kpiPaga').innerText = counts.PAGA;
    document.getElementById('kpiAdvertencia').innerText = counts.ADVERTENCIA;
    document.getElementById('kpiVencida').innerText = counts.VENCIDA;
    document.getElementById('kpiLicenciamento').innerText = counts.PAGO_LICENCIAMENTO;
}

function abrirFichaModal(id) {
    const m = bancoMultas.find(item => item.id === String(id));
    if (!m) return;
    
    document.getElementById('quickFichaMultaId').value = m.id;
    document.getElementById('quickFichaSituacaoSelect').value = m.situacao;

    document.getElementById('fTituloPlaca').innerText = `Ficha Completa: Placa ${m.placa} (Auto ${m.autoInfracao})`;
    const grid = document.getElementById('fDetalhesGrid');
    grid.innerHTML = `
        <div class="detail-item"><div class="detail-label">PLACA / FROTA</div><div class="detail-val">${m.placa} (${m.frota || 's/f'})</div></div>
        <div class="detail-item"><div class="detail-label">MODELO DO VEÍCULO</div><div class="detail-val">${m.modelo || '-'}</div></div>
        <div class="detail-item"><div class="detail-label">FILIAL / UNIDADE</div><div class="detail-val">${m.filial || '-'}</div></div>
        <div class="detail-item"><div class="detail-label">CNPJ EMPRESA</div><div class="detail-val">${m.cnpj || '-'}</div></div>
        <div class="detail-item"><div class="detail-label">AUTO DE INFRAÇÃO</div><div class="detail-val">${m.autoInfracao}</div></div>
        <div class="detail-item"><div class="detail-label">CONDUTOR RESPONSÁVEL</div><div class="detail-val">${m.condutor ? m.condutor : '⚠️ PENDENTE IDENTIFICAÇÃO'}</div></div>
        <div class="detail-item"><div class="detail-label">CÓDIGO DA INFRAÇÃO</div><div class="detail-val">${m.codigoInfracao || '-'}</div></div>
        <div class="detail-item"><div class="detail-label">ARTIGO DO CTB</div><div class="detail-val">${m.artigoCTB || '-'}</div></div>
        <div class="detail-item"><div class="detail-label">INFRATOR CTB</div><div class="detail-val">${m.infratorCTB || '-'}</div></div>
        <div class="detail-item"><div class="detail-label">GRAVIDADE</div><div class="detail-val">${m.gravidade || '-'}</div></div>
        <div class="detail-item"><div class="detail-label">DATA INFRAÇÃO</div><div class="detail-val">${formatarData(m.dataInfracao)}</div></div>
        <div class="detail-item"><div class="detail-label">LIMITE IDENTIFICAÇÃO</div><div class="detail-val">${formatarData(m.dataVencimento)}</div></div>
        <div class="detail-item"><div class="detail-label">VENCIMENTO BOLETO</div><div class="detail-val">${m.dataVencimentoBoleto ? formatarData(m.dataVencimentoBoleto) : '-'}</div></div>
        <div class="detail-item"><div class="detail-label">VALOR BRUTO</div><div class="detail-val">R$ ${(m.valor || 0).toFixed(2)}</div></div>
        <div class="detail-item"><div class="detail-label">DESCONTO</div><div class="detail-val">${m.porcentagemDesconto || 0}%</div></div>
        <div class="detail-item"><div class="detail-label">VALOR LÍQUIDO</div><div class="detail-val" style="color:var(--accent-blue);">R$ ${(m.valorDesconto || 0).toFixed(2)}</div></div>
        <div class="detail-item"><div class="detail-label">SITUAÇÃO ATUAL</div><div class="detail-val"><span class="badge-status status-${m.situacao}">${SITUACOES_MAP[m.situacao] ? SITUACOES_MAP[m.situacao].label : m.situacao}</span></div></div>
        <div class="detail-item"><div class="detail-label">ENTREGUE AO RH?</div><div class="detail-val">${m.entregueRH ? '✅ SIM (' + formatarData(m.dataEntregueRH) + ')' : '❌ NÃO'}</div></div>
        <div class="detail-item"><div class="detail-label">ENTREGUE AO FINANCEIRO?</div><div class="detail-val">${m.entregueFinanceiro ? '✅ SIM (' + formatarData(m.dataEntregueFinanceiro) + ')' : '❌ NÃO'}</div></div>
        <div class="detail-item" style="grid-column: 1 / -1;"><div class="detail-label">DESCRIÇÃO DA INFRAÇÃO</div><div class="detail-val">${m.infracaoNome || '-'}</div></div>
        <div class="detail-item" style="grid-column: 1 / -1;"><div class="detail-label">OBSERVAÇÕES</div><div class="detail-val">${m.obs || 'Nenhuma observação cadastrada.'}</div></div>
    `;
    const modal = document.getElementById('modalFicha');
    modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10);
}

/* ENVIA ATUALIZAÇÃO RÁPIDA DE SITUAÇÃO AO N8N */
async function salvarSituacaoRapidaFicha() {
    const id = document.getElementById('quickFichaMultaId').value;
    const novaSit = document.getElementById('quickFichaSituacaoSelect').value;

    const idx = bancoMultas.findIndex(m => m.id === String(id));
    if (idx !== -1) {
        bancoMultas[idx].situacao = novaSit;
        localStorage.setItem('db_multas_master_v11', JSON.stringify(bancoMultas));
        aplicarFiltros();
        abrirFichaModal(id);

        try {
            await fetch(URL_N8N_ATUALIZAR, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ "ID": id, "SITUAÇÃO": novaSit })
            });
        } catch (err) {
            console.warn("Erro ao atualizar situação no n8n:", err);
        }
    }
}

function abrirModalCadastro() {
    document.getElementById('formMulta').reset();
    document.getElementById('multaId').value = "";
    document.getElementById('mValor').value = "";
    document.getElementById('mValorDesconto').value = "";
    document.getElementById('mDataVencimento').value = "";
    document.getElementById('mDataVencimentoBoleto').value = "";
    document.getElementById('modalCadastroTitulo').innerText = "Cadastrar Nova Multa de Trânsito";
    
    toggleDataSetor('RH');
    toggleDataSetor('Financeiro');
    toggleDataBoleto();

    const modal = document.getElementById('modalCadastro');
    modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10);
}

/* EDIÇÃO DE MULTA QUE PRESERVA DADOS ORIGINAIS */
function editarMulta(id) {
    const m = bancoMultas.find(item => item.id === String(id));
    if (!m) return;

    document.getElementById('multaId').value = m.id;
    
    const placaFormatada = (m.placa || '').replace('-', '').trim().toUpperCase();
    document.getElementById('mPlaca').value = placaFormatada;
    
    document.getElementById('mFrota').value = m.frota || '';
    document.getElementById('mModelo').value = m.modelo || '';
    document.getElementById('mFilial').value = m.filial || '';
    document.getElementById('mCnpj').value = m.cnpj || '';
    document.getElementById('mAuto').value = m.autoInfracao || '';
    document.getElementById('mSituacao').value = m.situacao || 'IDENTIFICAR_CONDUTOR';
    document.getElementById('mCondutor').value = m.condutor || '';
    
    const foundIdx = listaInfracoesCache.findIndex(item => {
        const art = item['Amparo Legal (CTB)'] || item.artigo || '';
        return art.trim() === (m.artigoCTB || '').trim();
    });

    if (foundIdx !== -1) {
        document.getElementById('mArtigoCTB').value = foundIdx;
        document.getElementById('mInfracaoNomeSelect').value = foundIdx;
        const selectCodigo = document.getElementById('mCodigoInfracao');
        if (selectCodigo) selectCodigo.value = foundIdx;
    } else {
        document.getElementById('mArtigoCTB').value = "";
        document.getElementById('mInfracaoNomeSelect').value = "";
        const selectCodigo = document.getElementById('mCodigoInfracao');
        if (selectCodigo) selectCodigo.value = "";
    }

    document.getElementById('mDataInfracao').value = m.dataInfracao || '';
    
    document.getElementById('mValor').value = m.valor !== undefined && m.valor !== null ? m.valor : 0;
    document.getElementById('mPorcentagemDesconto').value = m.porcentagemDesconto !== undefined ? m.porcentagemDesconto : 20;
    document.getElementById('mValorDesconto').value = m.valorDesconto !== undefined && m.valorDesconto !== null ? parseFloat(m.valorDesconto).toFixed(2) : '0.00';
    
    document.getElementById('mDataVencimento').value = m.dataVencimento || '';
    document.getElementById('mDataVencimentoBoleto').value = m.dataVencimentoBoleto || '';
    toggleDataBoleto();
    
    document.getElementById('mGravidade').value = m.gravidade || 'MÉDIA';
    document.getElementById('mInfratorCTB').value = m.infratorCTB || '-';

    document.getElementById('mEntregueRH').checked = !!m.entregueRH;
    document.getElementById('mDataEntregueRH').value = m.dataEntregueRH || '';
    toggleDataSetor('RH');

    document.getElementById('mEntregueFinanceiro').checked = !!m.entregueFinanceiro;
    document.getElementById('mDataEntregueFinanceiro').value = m.dataEntregueFinanceiro || '';
    toggleDataSetor('Financeiro');

    document.getElementById('mInfracaoNome').value = m.infracaoNome || '';
    document.getElementById('mObs').value = m.obs || '';

    document.getElementById('modalCadastroTitulo').innerText = "Editar Multa: " + m.autoInfracao;

    const modal = document.getElementById('modalCadastro');
    modal.style.display = 'flex'; setTimeout(() => modal.classList.add('active'), 10);
}

/* ENVIO DO PAYLOAD */
async function salvarMulta(e) {
    e.preventDefault();
    const idInput = document.getElementById('multaId').value;
    const isEdicao = Boolean(idInput);
    const id = idInput || "m_" + Date.now();
    
    const valTotal = parseFloat(document.getElementById('mValor').value) || 0;
    const pctDesc = parseFloat(document.getElementById('mPorcentagemDesconto').value) || 0;
    const valLiqCalculado = valTotal * (1 - (pctDesc / 100));

    const artSelIdx = document.getElementById('mArtigoCTB').value;
    let artigoTexto = "";
    let codigoTexto = "";
    
    if (artSelIdx !== "" && listaInfracoesCache[artSelIdx]) {
        artigoTexto = listaInfracoesCache[artSelIdx]['Amparo Legal (CTB)'] || listaInfracoesCache[artSelIdx].artigo || "";
        codigoTexto = listaInfracoesCache[artSelIdx]['Código da Infração'] || listaInfracoesCache[artSelIdx].codigo || listaInfracoesCache[artSelIdx]['Código'] || "";
    } else if (isEdicao) {
        const itemExistente = bancoMultas.find(m => m.id === id);
        if (itemExistente) {
            artigoTexto = itemExistente.artigoCTB;
            codigoTexto = itemExistente.codigoInfracao;
        }
    }

    const payload = {
        "ID": id,
        "PLACA": document.getElementById('mPlaca').value.toUpperCase().trim(),
        "FROTA": document.getElementById('mFrota').value.trim(),
        "MODELO": document.getElementById('mModelo').value.trim(),
        "FILIAL": document.getElementById('mFilial').value.trim(),
        "CNPJ": document.getElementById('mCnpj').value.trim(),
        "AUTO INFRAÇÃO": document.getElementById('mAuto').value.toUpperCase().trim(),
        "SITUAÇÃO": document.getElementById('mSituacao').value,
        "NOME CONDUTOR": document.getElementById('mCondutor').value.trim(),
        "CÓDIGO INFRAÇÃO": codigoTexto,
        "AMPARO LEGAL (CTB)": artigoTexto,
        "DESCRIÇÃO INFRAÇÃO": document.getElementById('mInfracaoNome').value.trim(),
        "DATA INFRAÇÃO": document.getElementById('mDataInfracao').value,
        "DATA VENCIMENTO": document.getElementById('mDataVencimento').value,
        "DATA VENCIMENTO BOLETO": document.getElementById('mDataVencimentoBoleto').value,
        "GRAVIDADE": document.getElementById('mGravidade').value,
        "INFRATOR": document.getElementById('mInfratorCTB').value.trim(),
        "VALOR BASE": valTotal,
        "DESCONTO (%)": pctDesc,
        "VALOR LÍQUIDO": valLiqCalculado,
        "ENTREGUE RH": document.getElementById('mEntregueRH').checked ? "SIM" : "NÃO",
        "DATA ENTREGUE RH": document.getElementById('mEntregueRH').checked ? document.getElementById('mDataEntregueRH').value : "",
        "ENTREGUE FINANCEIRO": document.getElementById('mEntregueFinanceiro').checked ? "SIM" : "NÃO",
        "DATA ENTREGUE FINANCEIRO": document.getElementById('mEntregueFinanceiro').checked ? document.getElementById('mDataEntregueFinanceiro').value : "",
        "OBSERVAÇÕES": document.getElementById('mObs').value.trim()
    };

    const itemLocal = {
        id: payload["ID"], placa: payload["PLACA"], frota: payload["FROTA"], modelo: payload["MODELO"], filial: payload["FILIAL"], cnpj: payload["CNPJ"],
        autoInfracao: payload["AUTO INFRAÇÃO"], situacao: payload["SITUAÇÃO"], condutor: payload["NOME CONDUTOR"], codigoInfracao: payload["CÓDIGO INFRAÇÃO"], 
        artigoCTB: payload["AMPARO LEGAL (CTB)"], infracaoNome: payload["DESCRIÇÃO INFRAÇÃO"], dataInfracao: payload["DATA INFRAÇÃO"], dataVencimento: payload["DATA VENCIMENTO"], 
        dataVencimentoBoleto: payload["DATA VENCIMENTO BOLETO"], gravidade: payload["GRAVIDADE"], infratorCTB: payload["INFRATOR"], valor: payload["VALOR BASE"], 
        porcentagemDesconto: payload["DESCONTO (%)"], valorDesconto: payload["VALOR LÍQUIDO"], entregueRH: payload["ENTREGUE RH"] === "SIM", dataEntregueRH: payload["DATA ENTREGUE RH"], 
        entregueFinanceiro: payload["ENTREGUE FINANCEIRO"] === "SIM", dataEntregueFinanceiro: payload["DATA ENTREGUE FINANCEIRO"], obs: payload["OBSERVAÇÕES"]
    };

    const idx = bancoMultas.findIndex(m => m.id === id);
    if (idx !== -1) bancoMultas[idx] = itemLocal; else bancoMultas.unshift(itemLocal);

    localStorage.setItem('db_multas_master_v11', JSON.stringify(bancoMultas));
    aplicarFiltros();
    fecharModal('modalCadastro');

    const urlEndpoint = isEdicao ? URL_N8N_ATUALIZAR : URL_N8N_SALVAR;
    try {
        await fetch(urlEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.warn("Erro ao salvar no n8n:", err);
    }
}

/* EXCLUSÃO DA MULTA COM DISPARO AO N8N */
async function excluirMulta(id) {
    if (confirm("Tem certeza que deseja excluir esta multa do sistema?")) {
        bancoMultas = bancoMultas.filter(m => m.id !== String(id));
        localStorage.setItem('db_multas_master_v11', JSON.stringify(bancoMultas));
        aplicarFiltros();

        try {
            await fetch(URL_N8N_EXCLUIR, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ "ID": id })
            });
        } catch (err) {
            console.warn("Erro ao excluir no n8n:", err);
        }
    }
}

function formatarData(d) {
    if (!d) return '-';
    const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function fecharModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

function fecharModalClickFora(e, id) { if (e.target.id === id) fecharModal(id); }