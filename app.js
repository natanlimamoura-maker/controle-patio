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

        // Combina tabela antiga 'produtos' e nova 'estoque'
        let estoqueFinal = [];

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
                    img: item.img || item.foto || null,
                    tabela_origem: 'produtos'
                });
            });
        }

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
        console.error("Erro ao sincronizar com Supabase:", err);
    }
}

// --- COMPRESSOR REUTILIZÁVEL DE IMAGEM ---
function comprimirFoto(input, callback) {
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
                callback(canvas.toDataURL('image/jpeg', 0.6));
            };
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// --- MÓDULO PÁTIO ---
function processarFotoPatio(input) {
    comprimirFoto(input, (fotoBase64) => {
        fotosTemp.push(fotoBase64);
        renderizarPrevias();
    });
}

function renderizarPrevias() {
    const c = document.getElementById('container-previa');
    c.innerHTML = '';
    fotosTemp.forEach(f => c.innerHTML += `<img src="${f}" class="h-20 w-full object-cover rounded-xl border">`);
    c.classList.toggle('hidden', fotosTemp.length === 0);
}

function abrirAdicionarFotoVeiculo(id) {
    veiculoFotoAddId = id;
    document.getElementById('input-foto-extra-patio').click();
}

async function processarFotoExtraPatio(input) {
    if (!veiculoFotoAddId) return;
    comprimirFoto(input, async (fotoBase64) => {
        const v = patio.find(x => x.id === veiculoFotoAddId);
        if (v) {
            const fotosAtuais = Array.isArray(v.fotos) ? v.fotos : [];
            const novasFotos = [...fotosAtuais, fotoBase64];

            const { error } = await _supabase.from('patio').update({ fotos: novasFotos }).eq('id', veiculoFotoAddId);
            if (!error) {
                v.fotos = novasFotos;
                renderizarPatio();
                notificar("FOTO ADICIONADA AO VEÍCULO!", "#16a34a");
            }
        }
        veiculoFotoAddId = null;
    });
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
                        <button onclick="abrirSaida('${v.id}')" class="flex-1 bg-black text-white p-2.5 rounded-2xl text-[9px] font-black uppercase">Finalizar & Cobrar</button>
                        <button onclick="abrirAdicionarFotoVeiculo('${v.id}')" class="bg-red-50 text-red-600 border border-red-200 px-3 py-2.5 rounded-2xl text-[10px] font-black">📷 +Foto</button>
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

    const novoHist = { placa: v.placa, modelo: v.modelo, cliente: v.cliente, entrada: v.entrada, saida: dataHoje, servico: servico, valor: valor, fotos: v.fotos };
    await _supabase.from('historico').insert([novoHist]);

    if (valor > 0) {
        const lancamento = { tipo: 'RECEITA', descricao: `SERVIÇO: ${v.placa} (${v.modelo})`, valor: valor, data: dataHoje };
        const { data: tData } = await _supabase.from('financeiro').insert([lancamento]).select();
        if (tData) transacoes.unshift(tData[0]);
    }

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
function processarFotoEstoque(input) {
    comprimirFoto(input, (fotoBase64) => {
        fotosTempEstoque = fotoBase64;
        const prev = document.getElementById('previa-foto-estoque');
        prev.src = fotoBase64;
        prev.classList.remove('hidden');
    });
}

function renderizarEstoque() {
    const container = document.getElementById('lista-estoque');
    container.innerHTML = '';
    
    if (estoque.length === 0) {
        container.innerHTML = '<div class="text-center font-bold text-gray-400 py-6 text-xs uppercase">Nenhum item encontrado no estoque</div>';
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
                    <div class="text-[10px] text-emerald-600 font-bold">VENDA: R$ ${(item.preco_venda || 0).toFixed(2)}</div>
                </div>
                <div class="flex gap-1.5">
                    <button onclick="alterarQtdEstoque('${item.id}', -1, '${item.tabela_origem}')" class="bg-gray-100 font-black px-3 py-2 rounded-xl text-xs">-</button>
                    <button onclick="alterarQtdEstoque('${item.id}', 1, '${item.tabela_origem}')" class="bg-black text-white font-black px-3 py-2 rounded-xl text-xs">+</button>
                </div>
            </div>
        `;
    });
}

function abrirModalEstoque() { 
    fotosTempEstoque = null;
    document.getElementById('previa-foto-estoque').classList.add('hidden');
    document.getElementById('modal-estoque').style.display = 'flex'; 
}

async function salvarItemEstoque() {
    const codigo = document.getElementById('est-codigo').value.toUpperCase();
    const nome = document.getElementById('est-nome').value.toUpperCase();
    const qtd = parseInt(document.getElementById('est-qtd').value) || 0;
    const custo = parseFloat(document.getElementById('est-custo').value) || 0;
    const venda = parseFloat(document.getElementById('est-venda').value) || 0;

    if (!nome) { notificar("INFORME O NOME DA PEÇA", "#dc2626"); return; }

    const novoItem = { codigo, nome, quantidade: qtd, preco_custo: custo, preco_venda: venda, img: fotosTempEstoque };
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
    }
}

// --- HISTÓRICO & LAUDO PDF ---
function renderizarRelatorio() {
    const container = document.getElementById('lista-relatorio');
    container.innerHTML = '';
    const busca = document.getElementById('busca-historico').value.toUpperCase();
    
    historico.filter(v => v.placa.includes(busca) || v.cliente.includes(busca)).forEach(v => {
        container.innerHTML += `
            <div class="bg-white p-4 rounded-3xl shadow-sm border flex justify-between items-center gap-3">
                <div class="flex-1">
                    <div class="font-black text-sm">${v.placa} - ${v.cliente}</div>
                    <div class="text-[9px] font-bold text-gray-400 uppercase">SAÍDA: ${v.saida} | R$ ${(v.valor || 0).toFixed(2)}</div>
                    <div class="text-[10px] text-gray-600 mt-1 line-clamp-1">${v.servico || 'Sem descrição'}</div>
                </div>
                <button onclick="gerarLaudoPDF('${v.id}')" class="bg-red-600 text-white font-black px-3 py-2.5 rounded-2xl text-[9px] uppercase shadow-md active:scale-95 flex items-center gap-1">
                    <span>📄</span> Laudo PDF
                </button>
            </div>`;
    });
}

function gerarLaudoPDF(idHistorico) {
    const item = historico.find(x => x.id == idHistorico) || patio.find(x => x.id == idHistorico);
    if (!item) {
        notificar("VEÍCULO NÃO ENCONTRADO", "#dc2626");
        return;
    }

    const fotos = Array.isArray(item.fotos) && item.fotos.length > 0 ? item.fotos : [];
    
    let fotosHtml = '';
    fotos.forEach((foto, index) => {
        fotosHtml += `
            <div style="text-align: center; border: 1px solid #e5e7eb; padding: 10px; border-radius: 12px; page-break-inside: avoid;">
                <img src="${foto}" style="width: 100%; max-height: 220px; object-fit: cover; border-radius: 8px;">
                <p style="font-size: 10px; font-weight: bold; margin-top: 6px; color: #6b7280;">REGISTRO FOTOGRÁFICO #${index + 1}</p>
            </div>
        `;
    });

    const conteudoLaudo = `
        <div id="laudo-container" style="font-family: Arial, sans-serif; padding: 20px; color: #111;">
            <div style="border-bottom: 3px solid #dc2626; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1 style="font-size: 18px; font-weight: 900; color: #dc2626; margin: 0; text-transform: uppercase;">ALCANTARA'S DIESEL LTDA</h1>
                    <p style="font-size: 10px; margin: 2px 0 0 0; font-weight: bold; color: #4b5563;">INJEÇÃO ELETRÔNICA DIESEL & SERVIÇOS ESPECIALIZADOS</p>
                </div>
                <div style="text-align: right; font-size: 10px; color: #6b7280;">
                    <p style="margin: 0;">DATA: <strong>${item.saida || item.entrada || new Date().toLocaleDateString('pt-BR')}</strong></p>
                    <p style="margin: 0; color: #dc2626; font-weight: bold;">LAUDO TÉCNICO FOTOGRÁFICO</p>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px;">
                <tr style="background: #f9fafb;">
                    <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>CLIENTE:</strong> ${item.cliente || 'N/I'}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>PLACA:</strong> ${item.placa}</td>
                </tr>
                <tr style="background: #f9fafb;">
                    <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>VEÍCULO / MODELO:</strong> ${item.modelo}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>ENTRADA:</strong> ${item.entrada}</td>
                </tr>
            </table>

            <div style="margin-bottom: 20px; background: #fff5f5; padding: 12px; border-radius: 8px; border-left: 4px solid #dc2626;">
                <h3 style="font-size: 11px; font-weight: bold; color: #dc2626; margin: 0 0 6px 0; text-transform: uppercase;">SERVIÇO / DIAGNÓSTICO EXECUTADO:</h3>
                <p style="font-size: 11px; margin: 0; white-space: pre-line; color: #1f2937;">${item.servico || 'Revisão geral e manutenção técnica do sistema.'}</p>
            </div>

            <h3 style="font-size: 11px; font-weight: bold; margin-bottom: 10px; text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 4px;">Evidências Fotográficas do Serviço</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                ${fotosHtml || '<p style="font-size: 10px; color: #9ca3af;">Nenhum registro fotográfico anexado.</p>'}
            </div>

            <div style="margin-top: 30px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 9px; color: #9ca3af;">
                <p style="margin: 0;">ALCANTARA'S DIESEL LTDA - Laudo Técnico gerado via sistema de gestão de pátio.</p>
            </div>
        </div>
    `;

    const element = document.createElement('div');
    element.innerHTML = conteudoLaudo;
    document.body.appendChild(element);

    const opt = {
        margin:       8,
        filename:     `Laudo_${item.placa}_${item.cliente.replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    notificar("GERANDO LAUDO EM PDF...", "#1e40af");

    html2pdf().set(opt).from(element).save().then(() => {
        document.body.removeChild(element);
        notificar("LAUDO GERADO COM SUCESSO!", "#16a34a");
    }).catch(err => {
        console.error("Erro ao gerar PDF:", err);
        notificar("ERRO AO GERAR PDF", "#dc2626");
    });
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
