// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://ywybppfkyekqlrndwhdn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_R08_JT0lLER2lnRE-v4xSw_4Dgl8BDU';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- ESTADOS DA APLICAÇÃO ---
let patio = [];
let historico = [];
let transacoes = [];
let estoque = [];
let fotosTemp = [];
let fotosTempEstoque = null;
let veiculoFotoAddId = null;

// --- INICIALIZAÇÃO ---
window.onload = function() {
    injetarBotaoSincronizacao();
    carregarTodosDados();
};

function injetarBotaoSincronizacao() {
    if (document.getElementById('btn-sync-global')) return;
    const header = document.querySelector('header') || document.body;
    const divSync = document.createElement('div');
    divSync.innerHTML = `
        <div id="btn-sync-global" onclick="forcarSincronizacaoManual()" style="background:#dc2626; color:white; padding:10px 14px; text-align:center; font-size:11px; font-weight:900; cursor:pointer; text-transform:uppercase; display:flex; justify-content:center; align-items:center; gap:6px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); z-index:99999; position:relative;">
            <span>🔄</span> FORÇAR ENVIO DO CELULAR PARA O PC (NUVEM)
        </div>
    `;
    header.prepend(divSync);
}

// --- CARREGAMENTO DE DADOS (SUPABASE + FALLBACK LOCAL) ---
async function carregarTodosDados() {
    try {
        // 1. Pátio (Tabela: patio)
        let { data: pData, error: pErr } = await _supabase.from('patio').select('*');
        if (pErr) console.error("Erro ao ler pátio:", pErr);

        if (pData && pData.length > 0) {
            patio = pData;
        } else {
            let dadosLocais = localStorage.getItem('patio_v3') || localStorage.getItem('patio_v2') || localStorage.getItem('patio') || '[]';
            patio = JSON.parse(dadosLocais);
        }

        // 2. Histórico de Veículos (Tabela: historicoveiculos)
        let { data: hData } = await _supabase.from('historicoveiculos').select('*');
        if (hData && hData.length > 0) {
            historico = hData;
        } else {
            historico = JSON.parse(localStorage.getItem('historico_v3')) || JSON.parse(localStorage.getItem('historico')) || [];
        }

        // 3. Financeiro (Tabela: financeiro)
        let { data: tData } = await _supabase.from('financeiro').select('*');
        if (tData && tData.length > 0) {
            transacoes = tData;
        } else {
            transacoes = JSON.parse(localStorage.getItem('transacoes')) || [];
        }

        // 4. Estoque (Tabela: estoque)
        let estoqueFinal = [];
        let { data: estoqueNovo } = await _supabase.from('estoque').select('*');
        if (estoqueNovo && estoqueNovo.length > 0) {
            estoqueNovo.forEach(item => {
                estoqueFinal.push({
                    id: item.id,
                    codigo: item.codigo || 'S/C',
                    nome: item.nome || 'PRODUTO',
                    quantidade: item.quantidade || 0,
                    preco_custo: item.preco_custo || 0,
                    preco_venda: item.preco_venda || 0,
                    img: item.img || item.foto || null,
                    tabela_origem: 'estoque'
                });
            });
        }
        estoque = estoqueFinal.sort((a, b) => a.nome.localeCompare(b.nome));

        renderizarPatio();
        renderizarFinanceiro();
        renderizarEstoque();

    } catch (err) {
        console.error("Erro crítico ao carregar dados:", err);
        let dadosLocais = localStorage.getItem('patio_v3') || localStorage.getItem('patio_v2') || localStorage.getItem('patio') || '[]';
        patio = JSON.parse(dadosLocais);
        renderizarPatio();
    }
}

// --- SINCRONIZAÇÃO MANUAL (FORÇAR ENVIO DO CELULAR PARA A NUVEM) ---
async function forcarSincronizacaoManual() {
    notificar("BUSCANDO DADOS NO CELULAR...", "#1e40af");
    
    let dadosBrutos = localStorage.getItem('patio_v3') || 
                      localStorage.getItem('patio_v2') || 
                      localStorage.getItem('patio') || '[]';
    
    let localPatio = [];
    try {
        localPatio = JSON.parse(dadosBrutos);
    } catch(e) {
        localPatio = [];
    }

    if (!Array.isArray(localPatio) || localPatio.length === 0) {
        notificar("Nenhum veículo local pendente para enviar.", "#d97706");
        return;
    }

    notificar(`Encontrados ${localPatio.length} veículos. Enviando...`, "#1e40af");

    const patioFormatado = localPatio.map(v => ({
        placa: (v.placa || '').toUpperCase(),
        modelo: (v.modelo || '').toUpperCase(),
        cliente: (v.cliente || '').toUpperCase(),
        entrada: v.entrada || new Date().toLocaleDateString('pt-BR'),
        fotos: Array.isArray(v.fotos) ? v.fotos : []
    }));

    const { error } = await _supabase.from('patio').insert(patioFormatado).select();

    if (error) {
        console.error("Erro Supabase Insert:", error);
        notificar("ERRO DO SUPABASE: " + error.message, "#dc2626");
        return;
    }

    notificar("SUCESSO! DADOS ENVIADOS PARA A NUVEM.", "#16a34a");
    
    localStorage.removeItem('patio_v3');
    localStorage.removeItem('patio_v2');
    localStorage.removeItem('patio');
    
    setTimeout(() => {
        window.location.reload();
    }, 1500);
}

// --- COMPRESSOR DE IMAGEM ---
function comprimirFoto(input, callback) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 600;
                canvas.height = img.height * (600 / img.width);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                callback(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function processarFotoPatio(input) {
    comprimirFoto(input, (fotoBase64) => {
        fotosTemp.push(fotoBase64);
        renderizarPrevias();
    });
}

function renderizarPrevias() {
    const c = document.getElementById('container-previa');
    if (!c) return;
    c.innerHTML = '';
    fotosTemp.forEach(f => c.innerHTML += `<img src="${f}" class="h-20 w-full object-cover rounded-xl border">`);
    c.classList.toggle('hidden', fotosTemp.length === 0);
}

function abrirAdicionarFotoVeiculo(id) {
    veiculoFotoAddId = id;
    const input = document.getElementById('input-foto-extra-patio');
    if (input) input.click();
}

async function processarFotoExtraPatio(input) {
    if (!veiculoFotoAddId) return;
    comprimirFoto(input, async (fotoBase64) => {
        const v = patio.find(x => String(x.id) === String(veiculoFotoAddId) || String(x.placa).toUpperCase() === String(veiculoFotoAddId).toUpperCase());
        
        if (v) {
            const fotosAtuais = Array.isArray(v.fotos) ? v.fotos : [];
            const novasFotos = [...fotosAtuais, fotoBase64];

            if (v.id) {
                await _supabase.from('patio').update({ fotos: novasFotos }).eq('id', v.id);
            }
            v.fotos = novasFotos;
            renderizarPatio();
            notificar("FOTO ADICIONADA!", "#16a34a");
        } else {
            notificar("ERRO: Veículo não encontrado.", "#dc2626");
        }
        veiculoFotoAddId = null;
    });
}

// --- CADASTRO DE ENTRADA NO PÁTIO ---
const formEntrada = document.getElementById('form-entrada');
if (formEntrada) {
    formEntrada.onsubmit = async function(e) {
        e.preventDefault();
        const dataAtual = new Date().toLocaleDateString('pt-BR');
        const v = { 
            placa: document.getElementById('placa').value.toUpperCase(),
            modelo: document.getElementById('modelo').value.toUpperCase(),
            cliente: document.getElementById('cliente').value.toUpperCase(),
            entrada: dataAtual,
            fotos: [...fotosTemp]
        };

        const { data, error } = await _supabase.from('patio').insert([v]).select();
        if (!error && data) {
            patio.unshift(data[0]);
            fotosTemp = [];
            formEntrada.reset();
            renderizarPrevias();
            renderizarPatio();
            notificar("ENTRADA REGISTRADA NA NUVEM", "#16a34a");
        } else {
            console.error("Erro ao inserir:", error);
            patio.unshift(v);
            let localPatio = JSON.parse(localStorage.getItem('patio_v3')) || [];
            localPatio.unshift(v);
            localStorage.setItem('patio_v3', JSON.stringify(localPatio));
            
            fotosTemp = [];
            formEntrada.reset();
            renderizarPrevias();
            renderizarPatio();
            notificar("SALVO LOCALMENTE (CLIQUE NO BOTÃO VERMELHO ACIMA PARA SINCRONIZAR)", "#d97706");
        }
    };
}

// --- RENDERIZAÇÃO DO PÁTIO ---
function renderizarPatio() {
    const list = document.getElementById('lista-veiculos');
    if (!list) return;
    list.innerHTML = '';
    
    const contador = document.getElementById('contador-patio');
    if (contador) contador.innerText = `${patio.length} NO PÁTIO`;
    
    if (patio.length === 0) {
        list.innerHTML = '<div class="text-center font-bold text-gray-400 py-6 text-xs uppercase">Nenhum veículo no pátio</div>';
        return;
    }

    patio.forEach(v => {
        const identificador = v.id || v.placa;
        const fotos = Array.isArray(v.fotos) && v.fotos.length > 0 ? v.fotos : ['https://via.placeholder.com/150?text=Sem+Foto'];
        const fotoCapa = fotos[0];
        let fotosHtml = fotos.map(f => `<img src="${f}" class="w-12 h-12 rounded-xl object-cover border">`).join('');

        list.innerHTML += `
        <div class="bg-white p-5 rounded-[30px] shadow-md border flex flex-col gap-3">
            <div class="flex gap-4 items-center">
                <img src="${fotoCapa}" class="w-20 h-20 rounded-3xl object-cover bg-gray-100 border">
                <div class="flex-1">
                    <div class="font-black text-xl uppercase italic leading-none">${v.placa}</div>
                    <div class="text-[10px] text-gray-400 font-bold mb-2">${v.modelo} - ${v.cliente}</div>
                    <div class="flex gap-2">
                        <button onclick="abrirSaida('${identificador}')" class="flex-1 bg-black text-white p-2.5 rounded-2xl text-[9px] font-black uppercase">Finalizar & Cobrar</button>
                        <button onclick="abrirAdicionarFotoVeiculo('${identificador}')" class="bg-red-50 text-red-600 border border-red-200 px-3 py-2.5 rounded-2xl text-[10px] font-black">📷 +Foto</button>
                    </div>
                </div>
            </div>
            <div class="flex gap-1.5 overflow-x-auto pt-2 border-t">
                ${fotosHtml}
            </div>
        </div>`;
    });
}

function abrirSaida(id) {
    const inputTemp = document.getElementById('saida-id-temp');
    const modal = document.getElementById('modal-saida');
    if (inputTemp) inputTemp.value = id;
    if (modal) modal.style.display = 'flex';
}

async function confirmarSaidaFinal() {
    const id = document.getElementById('saida-id-temp').value;
    const v = patio.find(x => String(x.id) === String(id) || String(x.placa).toUpperCase() === String(id).toUpperCase());
    const servico = document.getElementById('input-servico-final').value.toUpperCase();
    const valor = parseFloat(document.getElementById('input-valor-servico').value) || 0;
    const dataHoje = new Date().toLocaleDateString('pt-BR');

    if (!v) return;

    // Salva na tabela dedicada 'historicoveiculos'
    const novoHist = { placa: v.placa, modelo: v.modelo, cliente: v.cliente, entrada: v.entrada, saida: dataHoje, servico: servico, valor: valor, fotos: v.fotos };
    await _supabase.from('historicoveiculos').insert([novoHist]);

    if (valor > 0) {
        const lancamento = { tipo: 'RECEITA', descricao: `SERVIÇO: ${v.placa} (${v.modelo})`, valor: valor, data: dataHoje };
        await _supabase.from('financeiro').insert([lancamento]);
    }

    if (v.id) {
        await _supabase.from('patio').delete().eq('id', v.id);
    } else {
        await _supabase.from('patio').delete().eq('placa', v.placa);
    }

    patio = patio.filter(x => String(x.id) !== String(id) && String(x.placa).toUpperCase() !== String(id).toUpperCase());

    fecharModal('modal-saida');
    renderizarPatio();
    notificar("SERVIÇO CONCLUÍDO!", "#16a34a");
}

// --- FINANCEIRO ---
function renderizarFinanceiro() {
    const container = document.getElementById('lista-transacoes');
    if (!container) return;
    container.innerHTML = '';
    
    transacoes.forEach(t => {
        container.innerHTML += `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-2xl border">
                <div>
                    <div class="font-black text-xs uppercase">${t.descricao}</div>
                    <div class="text-[9px] font-bold text-gray-400">${t.data || ''}</div>
                </div>
                <span class="font-black text-sm ${t.tipo === 'RECEITA' ? 'text-emerald-600' : 'text-red-600'}">
                    ${t.tipo === 'RECEITA' ? '+' : '-'} R$ ${t.valor.toFixed(2)}
                </span>
            </div>
        `;
    });
}

function abrirModalTransacao() { 
    const m = document.getElementById('modal-transacao');
    if (m) m.style.display = 'flex'; 
}

async function salvarTransacaoManual() {
    const tipo = document.getElementById('trans-tipo').value;
    const desc = document.getElementById('trans-descricao').value.toUpperCase();
    const val = parseFloat(document.getElementById('trans-valor').value) || 0;
    const dataHoje = new Date().toLocaleDateString('pt-BR');

    if (!desc || val <= 0) { notificar("PREENCHA OS CAMPOS", "#dc2626"); return; }

    const lancamento = { tipo: tipo, descricao: desc, valor: val, data: dataHoje };
    const { data } = await _supabase.from('financeiro').insert([lancamento]).select();
    
    if (data) {
        transacoes.unshift(data[0]);
        renderizarFinanceiro();
        fecharModal('modal-transacao');
        notificar("TRANSAÇÃO REGISTRADA", "#16a34a");
    }
}

// --- ESTOQUE ---
function renderizarEstoque() {
    const container = document.getElementById('lista-estoque');
    if (!container) return;
    container.innerHTML = '';
    
    if (estoque.length === 0) {
        container.innerHTML = '<div class="text-center font-bold text-gray-400 py-6 text-xs uppercase">Nenhum item encontrado</div>';
        return;
    }

    estoque.forEach(item => {
        const imgUrl = item.img ? item.img : 'https://via.placeholder.com/80?text=Pe%C3%A7a';
        container.innerHTML += `
            <div class="bg-white p-4 rounded-3xl shadow-sm border flex justify-between items-center gap-3">
                <img src="${imgUrl}" class="w-14 h-14 rounded-2xl object-cover bg-gray-100 border">
                <div class="flex-1">
                    <div class="font-black text-sm uppercase leading-tight">${item.nome}</div>
                    <div class="text-[10px] text-gray-400 font-bold">CÓD: ${item.codigo} | QTD: <span class="text-black font-black">${item.quantidade}</span></div>
                </div>
            </div>
        `;
    });
}

// --- NAVEGAÇÃO E UTILITÁRIOS ---
function mudarAba(id, titulo) {
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
    
    const aba = document.getElementById(`aba-${id}`);
    if (aba) aba.classList.add('active');

    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    }
    
    const tituloElem = document.getElementById('titulo-modulo');
    if (tituloElem) tituloElem.innerText = titulo;
}

function fecharModal(id) { 
    const m = document.getElementById(id);
    if (m) m.style.display = 'none'; 
}

function notificar(msg, cor) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.top = '65px';
        container.style.right = '20px';
        container.style.zIndex = '99999';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.background = cor;
    toast.style.color = '#fff';
    toast.style.padding = '12px 20px';
    toast.style.marginBottom = '8px';
    toast.style.borderRadius = '12px';
    toast.style.fontWeight = 'bold';
    toast.style.fontSize = '12px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.transition = 'opacity 0.5s ease';
    toast.innerText = msg; 

    container.appendChild(toast);
    setTimeout(() => { 
        toast.style.opacity = '0'; 
        setTimeout(() => toast.remove(), 500); 
    }, 4000);
}
