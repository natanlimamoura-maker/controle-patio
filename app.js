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

// --- REGISTRO DO SERVICE WORKER ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Erro:', err));
}

// --- INICIALIZAÇÃO ---
window.onload = function() {
    carregarTodosDados();
};

async function carregarTodosDados() {
    try {
        let { data: pData } = await _supabase.from('patio').select('*').order('created_at', { ascending: false });
        if (pData) patio = pData;

        let { data: hData } = await _supabase.from('historico').select('*').order('created_at', { ascending: false });
        if (hData) historico = hData;

        let { data: tData } = await _supabase.from('financeiro').select('*').order('created_at', { ascending: false });
        if (tData) transacoes = tData;

        // --- BUSCA NO ESTOQUE (Combina tabela antiga 'produtos' e nova 'estoque') ---
        let estoqueFinal = [];

        // 1. Busca na tabela antiga 'produtos'
        let { data: produtosAntigos } = await _supabase.from('produtos').select('*');
        if (produtosAntigos) {
            produtosAntigos.forEach(item => {
                estoqueFinal.push({
                    id: item.id,
                    codigo: item.code || item.codigo || 'S/C',
                    nome: item.name || item.nome || 'PRODUTO',
                    quantidade: item.qty !== undefined ? item.qty : (item.quantidade || 0),
                    preco_custo: item.preco_custo || 0,
                    preco_venda: item.preco_venda || item.price || 0,
                    tabela_origem: 'produtos'
                });
            });
        }

        // 2. Busca na tabela nova 'estoque'
        let { data: estoqueNovo } = await _supabase.from('estoque').select('*');
        if (estoqueNovo) {
            estoqueNovo.forEach(item => {
                estoqueFinal.push({
                    id: item.id,
                    codigo: item.codigo || 'S/C',
                    nome: item.nome || 'PRODUTO',
                    quantidade: item.quantidade || 0,
                    preco_custo: item.preco_custo || 0,
                    preco_venda: item.preco_venda || 0,
                    tabela_origem: 'estoque'
                });
            });
        }

        // Ordena por nome
        estoque = estoqueFinal.sort((a, b) => a.nome.localeCompare(b.nome));

        renderizarPatio();
        renderizarFinanceiro();
        renderizarEstoque();
    } catch (err) {
        console.error("Erro ao sincronizar com Supabase:", err);
    }
}

// --- MÓDULO PÁTIO ---
function processarFoto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 500;
                canvas.height = img.height * (500 / img.width);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                fotosTemp.push(canvas.toDataURL('image/jpeg', 0.6));
                renderizarPrevias();
            };
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function renderizarPrevias() {
    const c = document.getElementById('container-previa');
    c.innerHTML = '';
    fotosTemp.forEach(f => c.innerHTML += `<img src="${f}" class="h-20 w-full object-cover rounded-xl border">`);
    c.classList.toggle('hidden', fotosTemp.length === 0);
}

document.getElementById('form-entrada').onsubmit = async function(e) {
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
        document.getElementById('form-entrada').reset();
        renderizarPrevias();
        renderizarPatio();
        notificar("ENTRADA REGISTRADA", "#16a34a");
    }
};

function renderizarPatio() {
    const list = document.getElementById('lista-veiculos');
    list.innerHTML = '';
    document.getElementById('contador-patio').innerText = `${patio.length} NO PÁTIO`;
    
    patio.forEach(v => {
        const fotoUrl = (v.fotos && v.fotos[0]) ? v.fotos[0] : 'https://via.placeholder.com/150?text=Sem+Foto';
        list.innerHTML += `
        <div class="bg-white p-5 rounded-[30px] shadow-md border flex gap-4 items-center">
            <img src="${fotoUrl}" class="w-20 h-20 rounded-3xl object-cover bg-gray-100">
            <div class="flex-1">
                <div class="font-black text-xl uppercase italic leading-none">${v.placa}</div>
                <div class="text-[10px] text-gray-400 font-bold mb-3">${v.modelo} - ${v.cliente}</div>
                <button onclick="abrirSaida('${v.id}')" class="w-full bg-black text-white p-3 rounded-2xl text-[9px] font-black uppercase">Finalizar & Cobrar</button>
            </div>
        </div>`;
    });
}

function abrirSaida(id) {
    document.getElementById('saida-id-temp').value = id;
    document.getElementById('modal-saida').style.display = 'flex';
}

async function confirmarSaidaFinal() {
    const id = document.getElementById('saida-id-temp').value;
    const v = patio.find(x => x.id == id);
    const servico = document.getElementById('input-servico-final').value.toUpperCase();
    const valor = parseFloat(document.getElementById('input-valor-servico').value) || 0;
    const dataHoje = new Date().toLocaleDateString('pt-BR');

    if (!v) return;

    // 1. Histórico
    const novoHist = { placa: v.placa, modelo: v.modelo, cliente: v.cliente, entrada: v.entrada, saida: dataHoje, servico: servico, valor: valor, fotos: v.fotos };
    await _supabase.from('historico').insert([novoHist]);

    // 2. Financeiro Automático
    if (valor > 0) {
        const lancamento = { tipo: 'RECEITA', descricao: `SERVIÇO: ${v.placa} (${v.modelo})`, valor: valor, data: dataHoje };
        const { data: tData } = await _supabase.from('financeiro').insert([lancamento]).select();
        if (tData) transacoes.unshift(tData[0]);
    }

    // 3. Remover do Pátio
    await _supabase.from('patio').delete().eq('id', id);
    patio = patio.filter(x => x.id != id);

    fecharModal('modal-saida');
    renderizarPatio();
    renderizarFinanceiro();
    notificar("SERVIÇO CONCLUÍDO E FATURADO!", "#16a34a");
}

// --- MÓDULO FINANCEIRO ---
function renderizarFinanceiro() {
    const container = document.getElementById('lista-transacoes');
    container.innerHTML = '';
    let totalRec = 0; 
    let totalDesp = 0;

    transacoes.forEach(t => {
        if (t.tipo === 'RECEITA') totalRec += t.valor;
        else totalDesp += t.valor;

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

    document.getElementById('total-receitas').innerText = `R$ ${totalRec.toFixed(2)}`;
    document.getElementById('total-despesas').innerText = `R$ ${totalDesp.toFixed(2)}`;
}

function abrirModalTransacao() { document.getElementById('modal-transacao').style.display = 'flex'; }

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

// --- MÓDULO ESTOQUE ---
function renderizarEstoque() {
    const container = document.getElementById('lista-estoque');
    container.innerHTML = '';
    
    if (estoque.length === 0) {
        container.innerHTML = '<div class="text-center font-bold text-gray-400 py-6 text-xs uppercase">Nenhum item encontrado no estoque</div>';
        return;
    }

    estoque.forEach(item => {
        container.innerHTML += `
            <div class="bg-white p-4 rounded-3xl shadow-sm border flex justify-between items-center">
                <div>
                    <div class="font-black text-sm uppercase">${item.nome}</div>
                    <div class="text-[10px] text-gray-400 font-bold">CÓD: ${item.codigo} | QTD: <span class="text-black font-black">${item.quantidade}</span></div>
                    <div class="text-[10px] text-emerald-600 font-bold">VENDA: R$ ${(item.preco_venda || 0).toFixed(2)}</div>
                </div>
                <div class="flex gap-2">
                    <button onclick="alterarQtdEstoque('${item.id}', -1, '${item.tabela_origem}')" class="bg-gray-100 font-black px-3 py-2 rounded-xl text-xs">-</button>
                    <button onclick="alterarQtdEstoque('${item.id}', 1, '${item.tabela_origem}')" class="bg-black text-white font-black px-3 py-2 rounded-xl text-xs">+</button>
                </div>
            </div>
        `;
    });
}

function abrirModalEstoque() { document.getElementById('modal-estoque').style.display = 'flex'; }

async function salvarItemEstoque() {
    const codigo = document.getElementById('est-codigo').value.toUpperCase();
    const nome = document.getElementById('est-nome').value.toUpperCase();
    const qtd = parseInt(document.getElementById('est-qtd').value) || 0;
    const custo = parseFloat(document.getElementById('est-custo').value) || 0;
    const venda = parseFloat(document.getElementById('est-venda').value) || 0;

    if (!nome) { notificar("INFORME O NOME DA PEÇA", "#dc2626"); return; }

    const novoItem = { codigo, nome, quantidade: qtd, preco_custo: custo, preco_venda: venda };
    const { data } = await _supabase.from('estoque').insert([novoItem]).select();

    if (data) {
        estoque.push({ ...data[0], tabela_origem: 'estoque' });
        renderizarEstoque();
        fecharModal('modal-estoque');
        notificar("ITEM ADICIONADO AO ESTOQUE", "#16a34a");
    }
}

async function alterarQtdEstoque(id, delta, tabelaOrigem) {
    const item = estoque.find(x => x.id === id);
    if (!item) return;

    const novaQtd = Math.max(0, item.quantidade + delta);
    const tabela = tabelaOrigem || 'estoque';
    const campoQtd = tabela === 'produtos' ? 'qty' : 'quantidade';

    const { error } = await _supabase.from(tabela).update({ [campoQtd]: novaQtd }).eq('id', id);

    if (!error) {
        item.quantidade = novaQtd;
        renderizarEstoque();
    } else {
        console.error("Erro ao atualizar quantidade:", error);
    }
}

// --- NAVEGAÇÃO E SISTEMA ---
function mudarAba(id, titulo) {
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`aba-${id}`).classList.add('active');
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    document.getElementById('titulo-modulo').innerText = titulo;

    if (id === 'relatorio') renderizarRelatorio();
}

function renderizarRelatorio() {
    const container = document.getElementById('lista-relatorio');
    container.innerHTML = '';
    const busca = document.getElementById('busca-historico').value.toUpperCase();
    
    historico.filter(v => v.placa.includes(busca) || v.cliente.includes(busca)).forEach(v => {
        container.innerHTML += `
            <div class="bg-white p-4 rounded-3xl shadow-sm border flex justify-between items-center">
                <div>
                    <div class="font-black text-sm">${v.placa} - ${v.cliente}</div>
                    <div class="text-[9px] font-bold text-gray-400 uppercase">SAÍDA: ${v.saida} | R$ ${(v.valor || 0).toFixed(2)}</div>
                </div>
            </div>`;
    });
}

function fecharModal(id) { document.getElementById(id).style.display = 'none'; }

function notificar(msg, cor) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast'; 
    toast.style.background = cor;
    toast.innerText = msg; 
    container.appendChild(toast);
    setTimeout(() => { 
        toast.style.opacity = '0'; 
        setTimeout(() => toast.remove(), 500); 
    }, 3000);
}
