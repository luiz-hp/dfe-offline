/* Documentos auxiliares pseudonimizados — DANFE (NF-e/NFC-e), DAMDFE (MDF-e) e DACTE (CT-e).
 * Gerados no aparelho a partir do XML JÁ ANONIMIZADO: nenhum dado real entra no PDF,
 * só os marcadores ([EMPRESA_E01], [CHAVE_02]…) e os dados fiscais.
 * Código de barras e QR Code não são desenhados (codificariam a chave de acesso).
 * Depende de vendor/jspdf (carregado sob demanda).
 */
'use strict';

(() => {
  const REMOVIDO = '[REMOVIDO]';
  const M = 5, LARG = 200, ALT_UTIL = 297 - 12;
  const VERMELHO = [179, 38, 30];

  // ------------------------------------------------------------ carga do jsPDF
  let carregando = null;
  function carregarJsPdf() {
    if (window.jspdf?.jsPDF?.API?.autoTable) return Promise.resolve();
    if (!carregando) {
      const script = (src) => new Promise((ok, erro) => {
        const s = document.createElement('script');
        s.src = src; s.onload = ok; s.onerror = () => erro(new Error('falha ao carregar ' + src));
        document.head.appendChild(s);
      });
      carregando = script('vendor/jspdf/jspdf.umd.min.js').then(() => script('vendor/jspdf/jspdf.plugin.autotable.min.js'));
    }
    return carregando;
  }

  // ------------------------------------------------------------ leitura do XML
  const filho = (el, nome) => (el ? [...el.children].find((c) => c.localName === nome) || null : null);
  const filhos = (el, nome) => (el ? [...el.children].filter((c) => c.localName === nome) : []);
  const primeiro = (el, nome) => (el ? el.getElementsByTagNameNS('*', nome)[0] || null : null);
  const todos = (el, nome) => (el ? [...el.getElementsByTagNameNS('*', nome)] : []);
  function txt(el, caminho) {
    let atual = el;
    for (const n of caminho.split('/')) { atual = filho(atual, n); if (!atual) return ''; }
    const v = atual.textContent.trim();
    return v === REMOVIDO ? '(suprimido)' : v;
  }
  const limpo = (s) => String(s ?? '').normalize('NFC').replace(/[^\n\x20-\x7E\xA0-\xFF—–‘’“”•…€›‹]/g, '?');
  function num(s, casas = 2) {
    if (s === '' || s == null || isNaN(Number(s))) return '';
    return Number(s).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }
  function data(dh) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/.exec(dh || '');
    return m ? { d: `${m[3]}/${m[2]}/${m[1]}`, h: m[4] || '' } : { d: '', h: '' };
  }
  const dataHora = (dh) => { const x = data(dh); return [x.d, x.h].filter(Boolean).join(' '); };
  const docDe = (el) => txt(el, 'CNPJ') || txt(el, 'CPF') || txt(el, 'idEstrangeiro');
  const fmtNum = (n) => (n && /^\d+$/.test(n) ? n.padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3') : n);
  const enderecoDe = (el) => (el ? [...el.children].find((c) => c.localName.startsWith('ender')) || null : null);
  function protocolo(xmlDoc) {
    const p = primeiro(xmlDoc, 'infProt');
    return { texto: [txt(p, 'nProt'), dataHora(txt(p, 'dhRecbto'))].filter(Boolean).join(' - '), situacao: txt(p, 'xMotivo') };
  }

  // ------------------------------------------------------------ base comum de desenho
  function novoDoc(titulo) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pdf.setProperties({ title: `${titulo} pseudonimizado - sem valor fiscal`, subject: 'Gerado a partir de XML pseudonimizado', creator: 'DF-e Offline' });
    pdf.setLineWidth(0.2);
    pdf.setDrawColor(0);
    const b = { pdf, y: M };

    b.campo = (x, y, w, h, rotulo, valor, o = {}) => {
      pdf.rect(x, y, w, h);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5); pdf.setTextColor(60);
      pdf.text(limpo(rotulo).toUpperCase(), x + 1, y + 2.2);
      pdf.setTextColor(0);
      pdf.setFont('helvetica', o.bold ? 'bold' : 'normal'); pdf.setFontSize(o.size || 7.5);
      const linhas = pdf.splitTextToSize(limpo(valor), w - 2).slice(0, o.linhas || Math.max(1, Math.floor((h - 3) / 3)));
      const xs = o.align === 'right' ? x + w - 1 : o.align === 'center' ? x + w / 2 : x + 1;
      pdf.text(linhas, xs, y + 5.4, { align: o.align || 'left' });
    };
    /** Linha de campos: [[largura, rótulo, valor, opções], …]. Larguras 0 dividem o restante. */
    b.linha = (h, defs) => {
      b.garantir(h);
      const fixas = defs.reduce((s, d) => s + (d[0] || 0), 0);
      const livres = defs.filter((d) => !d[0]).length;
      let x = M;
      for (const [w, r, v, o] of defs) {
        const ww = w || (LARG - fixas) / livres;
        b.campo(x, b.y, ww, h, r, v, o);
        x += ww;
      }
      b.y += h;
    };
    b.secao = (titulo) => {
      b.garantir(12);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.setTextColor(0);
      pdf.text(titulo, M, b.y + 3.6);
      b.y += 4.4;
    };
    b.garantir = (h) => { if (b.y + h > ALT_UTIL) { pdf.addPage(); b.y = 14; b.continuacao(); } };
    b.faixa = () => {
      pdf.setFillColor(...VERMELHO);
      pdf.rect(M, b.y, LARG, 6, 'F');
      pdf.setTextColor(255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
      pdf.text('DOCUMENTO PSEUDONIMIZADO — SEM VALOR FISCAL — gerado a partir de XML anonimizado', M + LARG / 2, b.y + 4, { align: 'center' });
      pdf.setTextColor(0);
      b.y += 7.5;
    };
    /** Tabela (autoTable) a partir de b.y. colunas: [[título, largura|0, 'l'|'c'|'r'], …] */
    b.tabela = (colunas, linhas, o = {}) => {
      if (!linhas.length) linhas = [colunas.map((_, i) => (i === 0 ? o.vazio || '—' : ''))];
      const livres = colunas.filter((c) => !c[1]).length;
      const fixas = colunas.reduce((s, c) => s + (c[1] || 0), 0);
      const columnStyles = {};
      colunas.forEach((c, i) => {
        columnStyles[i] = { cellWidth: c[1] || (LARG - fixas) / livres, halign: { l: 'left', c: 'center', r: 'right' }[c[2] || 'l'] };
      });
      b.garantir(10);
      pdf.autoTable({
        startY: b.y,
        margin: { left: M, right: M, top: 14, bottom: 12 },
        head: [colunas.map((c) => limpo(c[0]))],
        body: linhas.map((l) => l.map(limpo)),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: o.fonte || 6.3, cellPadding: 0.8, lineColor: 0, lineWidth: 0.1, textColor: 0, overflow: 'linebreak' },
        headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: 'bold', fontSize: 5.4, halign: 'center' },
        columnStyles,
        didDrawPage: () => { if (pdf.getCurrentPageInfo().pageNumber > 1) b.continuacao(); },
      });
      b.y = pdf.lastAutoTable.finalY + 0.5;
    };
    b.continuacaoTexto = '';
    b.continuacao = () => {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(...VERMELHO);
      pdf.text(limpo(b.continuacaoTexto), M, 10);
      pdf.setTextColor(0);
    };
    /** Caixa de texto longo (observações) com altura automática. */
    b.caixaTexto = (rotuloEsq, textoEsq, rotuloDir = 'RESERVADO AO FISCO') => {
      pdf.setFontSize(6.5);
      const linhas = pdf.splitTextToSize(limpo(textoEsq || '—'), 128);
      const h = Math.max(20, linhas.length * 2.8 + 6);
      b.garantir(h);
      pdf.rect(M, b.y, 130, h);
      pdf.rect(M + 130, b.y, LARG - 130, h);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5); pdf.setTextColor(60);
      pdf.text(rotuloEsq, M + 1, b.y + 2.2);
      pdf.text(rotuloDir, M + 131, b.y + 2.2);
      pdf.setTextColor(0); pdf.setFontSize(6.5);
      pdf.text(linhas, M + 1, b.y + 5.2);
      b.y += h;
    };
    /** Cabeçalho padrão: emitente | título | chave. Retorna posição para "FOLHA 1/N". */
    b.cabecalho = (c) => {
      const y = b.y, h = 32;
      pdf.rect(M, y, 85, h);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5); pdf.setTextColor(60);
      pdf.text('IDENTIFICAÇÃO DO EMITENTE', M + 1, y + 2.2); pdf.setTextColor(0);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
      pdf.text(pdf.splitTextToSize(limpo(c.emitNome), 81).slice(0, 2), M + 42.5, y + 9, { align: 'center' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
      pdf.text(c.emitLinhas.filter(Boolean).map(limpo), M + 42.5, y + 17, { align: 'center' });

      const xD = M + 85;
      pdf.rect(xD, y, 35, h);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(c.titulo.length > 8 ? 11 : 13);
      pdf.text(c.titulo, xD + 17.5, y + 6, { align: 'center' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.2);
      pdf.text(pdf.splitTextToSize(c.subtitulo, 33), xD + 17.5, y + 9.5, { align: 'center' });
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
      pdf.text(c.miolo.map(limpo), xD + 17.5, y + 19, { align: 'center' });

      const xC = xD + 35, wC = LARG - 120;
      pdf.rect(xC, y, wC, h);
      pdf.setFillColor(235); pdf.rect(xC + 2, y + 2, wC - 4, 11, 'F');
      pdf.setFont('helvetica', 'italic'); pdf.setFontSize(6.5); pdf.setTextColor(90);
      pdf.text([`${c.omitido} omitido`, '(codificaria a chave de acesso)'], xC + wC / 2, y + 6.8, { align: 'center' });
      pdf.setTextColor(0);
      b.campo(xC, y + 15, wC, 8, 'Chave de acesso', c.chave, { bold: true, align: 'center', size: 9 });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6);
      pdf.text(pdf.splitTextToSize('Consulta de autenticidade não aplicável: documento pseudonimizado para análise.', wC - 4), xC + wC / 2, y + 27, { align: 'center' });
      b.y += h;
      return { x: xD + 17.5, y: y + 30.5 };
    };
    /** Marca d'água, rodapé e numeração em todas as folhas. */
    b.finalizar = (folha) => {
      const total = pdf.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        pdf.setPage(p);
        pdf.saveGraphicsState();
        pdf.setGState(new pdf.GState({ opacity: 0.1 }));
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(46); pdf.setTextColor(...VERMELHO);
        pdf.text('PSEUDONIMIZADO', 105, 150, { align: 'center', angle: 35 });
        pdf.text('SEM VALOR FISCAL', 118, 185, { align: 'center', angle: 35 });
        pdf.restoreGraphicsState();
        pdf.setTextColor(90); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5);
        pdf.text('DF-e Offline · documento gerado no aparelho a partir de XML pseudonimizado · sem valor fiscal · os marcadores só podem ser revertidos com a tabela de-para do aparelho de origem', M, 297 - 5);
        pdf.text(`Folha ${p}/${total}`, 205, 297 - 5, { align: 'right' });
        pdf.setTextColor(0);
      }
      pdf.setPage(1);
      if (folha) { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.text(`FOLHA 1/${total}`, folha.x, folha.y, { align: 'center' }); }
      return pdf;
    };
    return b;
  }

  // ================================================================== DANFE
  const MOD_FRETE = { 0: '0 - Emitente (CIF)', 1: '1 - Destinatário (FOB)', 2: '2 - Terceiros', 3: '3 - Próprio remetente', 4: '4 - Próprio destinatário', 9: '9 - Sem frete' };

  function danfe(xmlDoc) {
    const inf = primeiro(xmlDoc, 'infNFe');
    const ide = filho(inf, 'ide'), emit = filho(inf, 'emit'), dest = filho(inf, 'dest');
    const tot = primeiro(inf, 'ICMSTot'), ibs = primeiro(inf, 'IBSCBSTot');
    const transp = filho(inf, 'transp'), trp = filho(transp, 'transporta'), veic = filho(transp, 'veicTransp'), vol = filho(transp, 'vol');
    const endE = filho(emit, 'enderEmit'), endD = filho(dest, 'enderDest');
    const nfce = txt(ide, 'mod') === '65';
    const numero = fmtNum(txt(ide, 'nNF')), serie = txt(ide, 'serie');
    const emi = data(txt(ide, 'dhEmi') || txt(ide, 'dEmi')), sai = data(txt(ide, 'dhSaiEnt'));
    const prot = protocolo(xmlDoc);

    const b = novoDoc('DANFE'), pdf = b.pdf;
    b.continuacaoTexto = `DANFE PSEUDONIMIZADO — SEM VALOR FISCAL · Nº ${numero} · SÉRIE ${serie} · continuação`;
    b.faixa();
    const fant = txt(emit, 'xFant');
    const folha = b.cabecalho({
      emitNome: txt(emit, 'xNome'),
      emitLinhas: [fant && fant !== txt(emit, 'xNome') ? `Nome fantasia: ${fant}` : '', 'Endereço: (suprimido)', `${txt(endE, 'xMun')} - ${txt(endE, 'UF')}`],
      titulo: nfce ? 'DANFE NFC-e' : 'DANFE',
      subtitulo: `Documento Auxiliar da Nota Fiscal ${nfce ? 'de Consumidor ' : ''}Eletrônica`,
      miolo: [`${txt(ide, 'tpNF') === '0' ? '0 - ENTRADA' : '1 - SAÍDA'}`, `Nº ${numero}`, `SÉRIE ${serie}`],
      chave: (inf.getAttribute('Id') || '').replace(/^NFe/, ''),
      omitido: 'código de barras',
    });
    b.linha(8, [[120, 'Natureza da operação', txt(ide, 'natOp')], [80, 'Protocolo de autorização de uso', prot.texto, { align: 'center' }]]);
    b.linha(8, [[0, 'Inscrição estadual', txt(emit, 'IE')], [0, 'Insc. estadual do subst. tributário', txt(emit, 'IEST')], [0, 'CNPJ / CPF', docDe(emit)]]);

    b.secao('DESTINATÁRIO / REMETENTE');
    const lgr = endD ? [...new Set([txt(endD, 'xLgr'), txt(endD, 'nro'), txt(endD, 'xCpl')].filter(Boolean))].join(', ') : '';
    b.linha(8, [[120, 'Nome / razão social', txt(dest, 'xNome')], [45, 'CNPJ / CPF', docDe(dest)], [35, 'Data da emissão', emi.d, { align: 'center' }]]);
    b.linha(8, [[95, 'Endereço', lgr], [45, 'Bairro / distrito', txt(endD, 'xBairro')], [25, 'CEP', txt(endD, 'CEP')], [35, 'Data da saída/entrada', sai.d, { align: 'center' }]]);
    b.linha(8, [[70, 'Município', txt(endD, 'xMun')], [35, 'Fone / fax', txt(endD, 'fone')], [15, 'UF', txt(endD, 'UF'), { align: 'center' }], [45, 'Inscrição estadual', txt(dest, 'IE')], [35, 'Hora da saída', sai.h, { align: 'center' }]]);

    const cobr = filho(inf, 'cobr'), fat = filho(cobr, 'fat'), dups = filhos(cobr, 'dup');
    if (fat || dups.length) {
      b.secao('FATURA / DUPLICATAS');
      if (fat) b.linha(7, [[0, 'Fatura', txt(fat, 'nFat')], [0, 'Valor original', num(txt(fat, 'vOrig')), { align: 'right' }], [0, 'Desconto', num(txt(fat, 'vDesc')), { align: 'right' }], [0, 'Valor líquido', num(txt(fat, 'vLiq')), { align: 'right' }]]);
      for (let i = 0; i < dups.length; i += 6) {
        b.linha(8, dups.slice(i, i + 6).map((dp) => [LARG / 6, `Nº ${txt(dp, 'nDup')} · venc. ${data(txt(dp, 'dVenc')).d}`, `R$ ${num(txt(dp, 'vDup'))}`]));
      }
    }

    const R = { align: 'right' }, v = (n) => num(txt(tot, n));
    b.secao('CÁLCULO DO IMPOSTO');
    b.linha(8, [[0, 'Base de cálc. do ICMS', v('vBC'), R], [0, 'Valor do ICMS', v('vICMS'), R], [0, 'Base de cálc. ICMS ST', v('vBCST'), R], [0, 'Valor do ICMS subst.', v('vST'), R], [0, 'V. imp. importação', v('vII'), R], [0, 'V. total dos produtos', v('vProd'), R]]);
    b.linha(8, [[0, 'Valor do frete', v('vFrete'), R], [0, 'Valor do seguro', v('vSeg'), R], [0, 'Desconto', v('vDesc'), R], [0, 'Outras desp. acessórias', v('vOutro'), R], [0, 'Valor do IPI', v('vIPI'), R], [0, 'V. total da nota', v('vNF'), { align: 'right', bold: true }]]);
    const extras = [['V. ICMS UF destino', v('vICMSUFDest')], ['V. FCP UF destino', v('vFCPUFDest')], ['Valor do FCP', v('vFCP')], ['V. aprox. tributos', v('vTotTrib')],
      ['Valor do IBS', num(primeiro(ibs, 'vIBS')?.textContent)], ['Valor da CBS', num(primeiro(ibs, 'vCBS')?.textContent)]].filter(([, x]) => x);
    if (extras.length) b.linha(8, extras.map(([r, x]) => [0, r, x, R]));

    b.secao('TRANSPORTADOR / VOLUMES TRANSPORTADOS');
    b.linha(8, [[68, 'Nome / razão social', txt(trp, 'xNome')], [34, 'Frete por conta', MOD_FRETE[txt(transp, 'modFrete')] || txt(transp, 'modFrete')], [25, 'Código ANTT', txt(veic, 'RNTC')],
      [25, 'Placa do veículo', txt(veic, 'placa')], [10, 'UF', txt(veic, 'UF'), { align: 'center' }], [38, 'CNPJ / CPF', docDe(trp)]]);
    b.linha(8, [[90, 'Endereço', txt(trp, 'xEnder')], [60, 'Município', txt(trp, 'xMun')], [10, 'UF', txt(trp, 'UF'), { align: 'center' }], [40, 'Inscrição estadual', txt(trp, 'IE')]]);
    b.linha(8, [[0, 'Quantidade', txt(vol, 'qVol')], [0, 'Espécie', txt(vol, 'esp')], [0, 'Marca', txt(vol, 'marca')], [0, 'Numeração', txt(vol, 'nVol')], [0, 'Peso bruto', num(txt(vol, 'pesoB'), 3), R], [0, 'Peso líquido', num(txt(vol, 'pesoL'), 3), R]]);

    b.secao('DADOS DOS PRODUTOS / SERVIÇOS');
    const itens = todos(inf, 'det').map((det) => {
      const prod = filho(det, 'prod'), imp = filho(det, 'imposto');
      const icms = filho(imp, 'ICMS')?.firstElementChild, ipi = primeiro(filho(imp, 'IPI'), 'IPITrib');
      const adic = txt(det, 'infAdProd');
      return [txt(prod, 'cProd'), txt(prod, 'xProd') + (adic ? `\n${adic}` : ''), txt(prod, 'NCM'), `${txt(icms, 'orig')}${txt(icms, 'CST') || txt(icms, 'CSOSN')}`,
        txt(prod, 'CFOP'), txt(prod, 'uCom'), num(txt(prod, 'qCom'), 4), num(txt(prod, 'vUnCom'), 4), num(txt(prod, 'vProd')),
        num(txt(icms, 'vBC')), num(txt(icms, 'vICMS')), num(txt(ipi, 'vIPI')), num(txt(icms, 'pICMS')), num(txt(ipi, 'pIPI'))];
    });
    b.tabela([['CÓDIGO', 15], ['DESCRIÇÃO DO PRODUTO / SERVIÇO', 51], ['NCM/SH', 12], ['O/CST', 9, 'c'], ['CFOP', 9, 'c'], ['UN', 8, 'c'], ['QUANT.', 14, 'r'],
      ['V. UNIT.', 14, 'r'], ['V. TOTAL', 15, 'r'], ['BC ICMS', 14, 'r'], ['V. ICMS', 12, 'r'], ['V. IPI', 11, 'r'], ['ALÍQ. ICMS', 8, 'r'], ['ALÍQ. IPI', 8, 'r']], itens, { fonte: 5.8 });

    const infAdic = filho(inf, 'infAdic');
    b.secao('DADOS ADICIONAIS');
    b.caixaTexto('INFORMAÇÕES COMPLEMENTARES', [txt(infAdic, 'infCpl') && `Inf. complementares: ${txt(infAdic, 'infCpl')}`,
      txt(infAdic, 'infAdFisco') && `Inf. de interesse do fisco: ${txt(infAdic, 'infAdFisco')}`,
      txt(ide, 'tpAmb') === '2' ? 'Emitida em ambiente de homologação — sem valor fiscal.' : '', prot.situacao && `Situação: ${prot.situacao}`].filter(Boolean).join('\n'));
    return b.finalizar(folha);
  }

  // ================================================================== DAMDFE
  const TP_EMIT_MDFE = { 1: 'Prestador de serviço de transporte', 2: 'Transportador de carga própria', 3: 'Prestador (CT-e globalizado)' };
  const MODAL = { 1: 'Rodoviário', 2: 'Aéreo', 3: 'Aquaviário', 4: 'Ferroviário' };
  const UNID_MDFE = { '01': 'KG', '02': 'TON' };
  const TP_CARGA = { '01': 'Granel sólido', '02': 'Granel líquido', '03': 'Frigorificada', '04': 'Conteinerizada', '05': 'Carga geral', '06': 'Neogranel', '07': 'Perigosa (granel sólido)', '08': 'Perigosa (granel líquido)', '09': 'Perigosa (frigorificada)', 10: 'Perigosa (conteinerizada)', 11: 'Perigosa (carga geral)' };

  function damdfe(xmlDoc) {
    const inf = primeiro(xmlDoc, 'infMDFe');
    const ide = filho(inf, 'ide'), emit = filho(inf, 'emit'), endE = filho(emit, 'enderEmit');
    const rodo = primeiro(inf, 'rodo'), antt = filho(rodo, 'infANTT');
    const tot = filho(inf, 'tot'), pred = filho(inf, 'prodPred');
    const numero = fmtNum(txt(ide, 'nMDF')), serie = txt(ide, 'serie');
    const prot = protocolo(xmlDoc);

    const b = novoDoc('DAMDFE');
    b.continuacaoTexto = `DAMDFE PSEUDONIMIZADO — SEM VALOR FISCAL · Nº ${numero} · SÉRIE ${serie} · continuação`;
    b.faixa();
    const folha = b.cabecalho({
      emitNome: txt(emit, 'xNome'),
      emitLinhas: [`CNPJ/CPF: ${docDe(emit)}`, `IE: ${txt(emit, 'IE')}`, 'Endereço: (suprimido)', `${txt(endE, 'xMun')} - ${txt(endE, 'UF')}`],
      titulo: 'DAMDFE',
      subtitulo: 'Documento Auxiliar do Manifesto Eletrônico de Documentos Fiscais',
      miolo: [`MODELO ${txt(ide, 'mod') || '58'}`, `Nº ${numero}`, `SÉRIE ${serie}`],
      chave: (inf.getAttribute('Id') || '').replace(/^MDFe/, ''),
      omitido: 'QR Code',
    });
    b.linha(8, [[0, 'Data/hora de emissão', dataHora(txt(ide, 'dhEmi')), { align: 'center' }], [0, 'UF de carregamento', txt(ide, 'UFIni'), { align: 'center' }],
      [0, 'UF de descarregamento', txt(ide, 'UFFim'), { align: 'center' }], [0, 'Modal', MODAL[txt(ide, 'modal')] || txt(ide, 'modal'), { align: 'center' }],
      [0, 'Tipo de emitente', TP_EMIT_MDFE[txt(ide, 'tpEmit')] || txt(ide, 'tpEmit')]]);
    b.linha(8, [[120, 'Protocolo de autorização de uso', prot.texto], [80, 'RNTRC do emitente', txt(antt, 'RNTRC')]]);

    b.secao('PERCURSO');
    const carrega = filhos(ide, 'infMunCarrega').map((m) => txt(m, 'xMunCarrega')).join(', ');
    const percurso = [txt(ide, 'UFIni'), ...filhos(ide, 'infPercurso').map((p) => txt(p, 'UFPer')), txt(ide, 'UFFim')].filter(Boolean).join(' › ');
    b.linha(8, [[90, 'Municípios de carregamento', carrega], [110, 'Percurso (UF)', percurso]]);

    b.secao('TOTAIS DA CARGA');
    const R = { align: 'right' };
    b.linha(8, [[0, 'Qtde. CT-e', txt(tot, 'qCTe'), R], [0, 'Qtde. NF-e', txt(tot, 'qNFe'), R], [0, 'Qtde. MDF-e', txt(tot, 'qMDFe'), R],
      [0, `Peso total (${UNID_MDFE[txt(tot, 'cUnid')] || txt(tot, 'cUnid')})`, num(txt(tot, 'qCarga'), 4), R], [0, 'Valor total da carga (R$)', num(txt(tot, 'vCarga')), { align: 'right', bold: true }]]);
    if (pred) {
      b.linha(8, [[45, 'Tipo de carga', TP_CARGA[txt(pred, 'tpCarga')] || txt(pred, 'tpCarga')], [95, 'Produto predominante', txt(pred, 'xProd')],
        [30, 'NCM', txt(pred, 'NCM')], [30, 'GTIN', txt(pred, 'cEAN')]]);
    }

    if (rodo) {
      b.secao('MODAL RODOVIÁRIO — VEÍCULOS');
      const tr = filho(rodo, 'veicTracao');
      const veiculos = [tr, ...filhos(rodo, 'veicReboque')].filter(Boolean).map((vv, i) => {
        const prop = filho(vv, 'prop');
        return [i === 0 ? 'Tração' : `Reboque ${i}`, txt(vv, 'placa'), txt(vv, 'UF'), txt(vv, 'RENAVAM'), num(txt(vv, 'tara'), 0), num(txt(vv, 'capKG'), 0),
          prop ? `${txt(prop, 'xNome')} · ${docDe(prop)} · RNTRC ${txt(prop, 'RNTRC')}` : 'Próprio emitente'];
      });
      b.tabela([['VEÍCULO', 18], ['PLACA', 22, 'c'], ['UF', 9, 'c'], ['RENAVAM', 24, 'c'], ['TARA (KG)', 17, 'r'], ['CAP. (KG)', 17, 'r'], ['PROPRIETÁRIO', 0]], veiculos);

      b.secao('CONDUTORES');
      b.tabela([['CPF', 50], ['NOME', 0]], filhos(tr, 'condutor').map((c) => [txt(c, 'CPF'), txt(c, 'xNome')]));

      const ped = filhos(filho(antt, 'valePed'), 'disp');
      const ciot = filhos(antt, 'infCIOT');
      const contr = filhos(antt, 'infContratante');
      if (ped.length || ciot.length) {
        b.secao('VALE-PEDÁGIO / CIOT');
        b.tabela([['TIPO', 22], ['FORNECEDOR / CIOT', 0], ['RESPONSÁVEL PAGAMENTO', 0], ['Nº COMPRA', 30], ['VALOR', 25, 'r']], [
          ...ped.map((p) => ['Vale-pedágio', txt(p, 'CNPJForn'), txt(p, 'CNPJPg') || txt(p, 'CPFPg'), txt(p, 'nCompra'), num(txt(p, 'vValePed'))]),
          ...ciot.map((c) => ['CIOT', txt(c, 'CIOT'), docDe(c), '', '']),
        ]);
      }
      if (contr.length) {
        b.secao('CONTRATANTES');
        b.tabela([['CNPJ / CPF', 50], ['NOME', 0]], contr.map((c) => [docDe(c), txt(c, 'xNome')]));
      }
    }

    b.secao('DOCUMENTOS VINCULADOS (POR MUNICÍPIO DE DESCARREGAMENTO)');
    const docs = [];
    for (const md of todos(inf, 'infMunDescarga')) {
      const mun = txt(md, 'xMunDescarga');
      filhos(md, 'infNFe').forEach((d) => docs.push([mun, 'NF-e', txt(d, 'chNFe')]));
      filhos(md, 'infCTe').forEach((d) => docs.push([mun, 'CT-e', txt(d, 'chCTe')]));
      filhos(md, 'infMDFeTransp').forEach((d) => docs.push([mun, 'MDF-e', txt(d, 'chMDFe')]));
    }
    b.tabela([['MUNICÍPIO DE DESCARREGAMENTO', 70], ['TIPO', 20, 'c'], ['CHAVE DE ACESSO', 0]], docs);

    const segs = filhos(inf, 'seg');
    if (segs.length) {
      b.secao('SEGURO DA CARGA');
      const RESP = { 1: 'Emitente do MDF-e', 2: 'Contratante do serviço' };
      b.tabela([['RESPONSÁVEL', 0], ['SEGURADORA', 0], ['APÓLICE', 30], ['AVERBAÇÃO', 0]], segs.map((s) => {
        const r = filho(s, 'infResp'), sg = filho(s, 'infSeg');
        return [`${RESP[txt(r, 'respSeg')] || txt(r, 'respSeg')} ${docDe(r)}`.trim(), `${txt(sg, 'xSeg')} ${docDe(sg)}`.trim(),
          txt(s, 'nApol'), filhos(s, 'nAver').map((a) => a.textContent.trim()).join(', ')];
      }));
    }

    const lac = filhos(inf, 'lacres').map((l) => txt(l, 'nLacre')).filter(Boolean);
    const infAdic = filho(inf, 'infAdic');
    b.secao('OBSERVAÇÕES');
    b.caixaTexto('INFORMAÇÕES COMPLEMENTARES', [lac.length && `Lacres: ${lac.join(', ')}`, txt(infAdic, 'infCpl') && `Inf. complementares: ${txt(infAdic, 'infCpl')}`,
      txt(infAdic, 'infAdFisco') && `Inf. de interesse do fisco: ${txt(infAdic, 'infAdFisco')}`,
      txt(ide, 'tpAmb') === '2' ? 'Emitido em ambiente de homologação — sem valor fiscal.' : '', prot.situacao && `Situação: ${prot.situacao}`].filter(Boolean).join('\n'));
    return b.finalizar(folha);
  }

  // ================================================================== DACTE
  const TP_CTE = { 0: 'Normal', 1: 'Complemento de valores', 2: 'Anulação', 3: 'Substituto' };
  const TP_SERV = { 0: 'Normal', 1: 'Subcontratação', 2: 'Redespacho', 3: 'Redespacho intermediário', 4: 'Serviço vinculado a multimodal' };
  const TOMA = { 0: 'Remetente', 1: 'Expedidor', 2: 'Recebedor', 3: 'Destinatário', 4: 'Outros' };
  const MODAL_CTE = { '01': 'Rodoviário', '02': 'Aéreo', '03': 'Aquaviário', '04': 'Ferroviário', '05': 'Dutoviário', '06': 'Multimodal' };
  const UNID_CTE = { '00': 'M3', '01': 'KG', '02': 'TON', '03': 'UNIDADE', '04': 'LITROS', '05': 'MMBTU' };

  function dacte(xmlDoc) {
    const inf = primeiro(xmlDoc, 'infCte');
    const ide = filho(inf, 'ide'), emit = filho(inf, 'emit'), endE = filho(emit, 'enderEmit');
    const compl = filho(inf, 'compl'), vPrest = filho(inf, 'vPrest'), imp = filho(inf, 'imp');
    const norm = filho(inf, 'infCTeNorm'), carga = filho(norm, 'infCarga');
    const numero = fmtNum(txt(ide, 'nCT')), serie = txt(ide, 'serie');
    const prot = protocolo(xmlDoc);

    const b = novoDoc('DACTE');
    b.continuacaoTexto = `DACTE PSEUDONIMIZADO — SEM VALOR FISCAL · Nº ${numero} · SÉRIE ${serie} · continuação`;
    b.faixa();
    const folha = b.cabecalho({
      emitNome: txt(emit, 'xNome'),
      emitLinhas: [`CNPJ/CPF: ${docDe(emit)}`, `IE: ${txt(emit, 'IE')}`, 'Endereço: (suprimido)', `${txt(endE, 'xMun')} - ${txt(endE, 'UF')}`],
      titulo: 'DACTE',
      subtitulo: 'Documento Auxiliar do Conhecimento de Transporte Eletrônico',
      miolo: [`MODAL ${(MODAL_CTE[txt(ide, 'modal')] || txt(ide, 'modal')).toUpperCase()}`, `Nº ${numero}`, `SÉRIE ${serie}`],
      chave: (inf.getAttribute('Id') || '').replace(/^CTe/, ''),
      omitido: 'código de barras',
    });
    const C = { align: 'center' };
    b.linha(8, [[0, 'Modelo', txt(ide, 'mod'), C], [0, 'Data/hora de emissão', dataHora(txt(ide, 'dhEmi')), C], [0, 'Tipo do CT-e', TP_CTE[txt(ide, 'tpCTe')] || txt(ide, 'tpCTe'), C],
      [0, 'Tipo do serviço', TP_SERV[txt(ide, 'tpServ')] || txt(ide, 'tpServ'), C], [0, 'Protocolo de autorização', prot.texto, C]]);
    b.linha(8, [[100, 'CFOP - natureza da operação', `${txt(ide, 'CFOP')} - ${txt(ide, 'natOp')}`], [50, 'Início da prestação', `${txt(ide, 'xMunIni')} - ${txt(ide, 'UFIni')}`],
      [50, 'Término da prestação', `${txt(ide, 'xMunFim')} - ${txt(ide, 'UFFim')}`]]);

    // partes
    const partes = [['REMETENTE', 'rem'], ['DESTINATÁRIO', 'dest'], ['EXPEDIDOR', 'exped'], ['RECEBEDOR', 'receb']];
    b.secao('PARTICIPANTES');
    for (let i = 0; i < partes.length; i += 2) {
      b.garantir(16);
      const y0 = b.y;
      partes.slice(i, i + 2).forEach(([rot, tag], j) => {
        const el = filho(inf, tag), end = enderecoDe(el), x = M + j * 100;
        b.campo(x, y0, 100, 8, rot, el ? txt(el, 'xNome') : '—');
        b.campo(x, y0 + 8, 40, 8, 'CNPJ / CPF', el ? docDe(el) : '');
        b.campo(x + 40, y0 + 8, 25, 8, 'Inscr. estadual', el ? txt(el, 'IE') : '');
        b.campo(x + 65, y0 + 8, 35, 8, 'Município - UF', end ? `${txt(end, 'xMun')} - ${txt(end, 'UF')}` : '');
      });
      b.y = y0 + 16;
    }
    const toma3 = filho(ide, 'toma3'), toma4 = filho(ide, 'toma4');
    const codToma = txt(toma3, 'toma') || txt(toma4, 'toma');
    const tomaEl = toma4 || filho(inf, { 0: 'rem', 1: 'exped', 2: 'receb', 3: 'dest' }[codToma]);
    const endT = enderecoDe(tomaEl);
    b.linha(8, [[35, 'Tomador do serviço', TOMA[codToma] || codToma], [75, 'Nome / razão social', txt(tomaEl, 'xNome')], [40, 'CNPJ / CPF', docDe(tomaEl)],
      [50, 'Município - UF', endT ? `${txt(endT, 'xMun')} - ${txt(endT, 'UF')}` : '']]);

    // carga
    if (carga) {
      b.secao('INFORMAÇÕES DA CARGA');
      b.linha(8, [[90, 'Produto predominante', txt(carga, 'proPred')], [70, 'Outras características', txt(carga, 'xOutCat')], [40, 'Valor total da carga', num(txt(carga, 'vCarga')), { align: 'right' }]]);
      b.tabela([['TIPO DE MEDIDA', 0], ['UNIDADE', 30, 'c'], ['QUANTIDADE', 40, 'r']],
        filhos(carga, 'infQ').map((q) => [txt(q, 'tpMed'), UNID_CTE[txt(q, 'cUnid')] || txt(q, 'cUnid'), num(txt(q, 'qCarga'), 4)]));
    }

    // valores
    b.secao('COMPONENTES DO VALOR DA PRESTAÇÃO DO SERVIÇO');
    const comps = filhos(vPrest, 'Comp').map((c) => [txt(c, 'xNome'), num(txt(c, 'vComp'))]);
    const pares = [];
    for (let i = 0; i < comps.length; i += 2) pares.push([...comps[i], ...(comps[i + 1] || ['', ''])]);
    b.tabela([['COMPONENTE', 0], ['VALOR', 30, 'r'], ['COMPONENTE', 0], ['VALOR', 30, 'r']], pares);
    b.linha(8, [[0, 'Valor total do serviço', num(txt(vPrest, 'vTPrest')), { align: 'right', bold: true }], [0, 'Valor a receber', num(txt(vPrest, 'vRec')), { align: 'right', bold: true }],
      [0, 'V. aprox. tributos', num(txt(imp, 'vTotTrib')), { align: 'right' }]]);

    b.secao('INFORMAÇÕES RELATIVAS AO IMPOSTO');
    const icms = filho(imp, 'ICMS')?.firstElementChild;
    const R = { align: 'right' };
    b.linha(8, [[50, 'Situação tributária', icms ? `${txt(icms, 'CST') || ''} ${icms.localName}`.trim() : ''], [0, 'Base de cálculo', num(txt(icms, 'vBC')), R],
      [0, 'Alíquota ICMS (%)', num(txt(icms, 'pICMS')), R], [0, 'Valor do ICMS', num(txt(icms, 'vICMS')), R], [0, '% redução BC', num(txt(icms, 'pRedBC')), R],
      [0, 'ICMS ST retido', num(txt(icms, 'vICMSSTRet')), R]]);
    const ibs = primeiro(imp, 'IBSCBS');
    if (ibs) b.linha(8, [[0, 'IBS/CBS - CST', txt(ibs, 'CST')], [0, 'Classificação tributária', txt(ibs, 'cClassTrib')], [0, 'Valor do IBS', num(primeiro(ibs, 'vIBS')?.textContent), R], [0, 'Valor da CBS', num(primeiro(ibs, 'vCBS')?.textContent), R]]);

    // documentos originários
    b.secao('DOCUMENTOS ORIGINÁRIOS');
    const infDoc = filho(norm, 'infDoc');
    const docs = [
      ...filhos(infDoc, 'infNFe').map((d) => ['NF-e', txt(d, 'chave'), txt(d, 'PIN')]),
      ...filhos(infDoc, 'infNF').map((d) => [`NF mod. ${txt(d, 'mod')}`, `série ${txt(d, 'serie')} nº ${txt(d, 'nDoc')} · ${data(txt(d, 'dEmi')).d}`, num(txt(d, 'vNF'))]),
      ...filhos(infDoc, 'infOutros').map((d) => [`Outros (${txt(d, 'tpDoc')})`, [txt(d, 'descOutros'), txt(d, 'nDoc')].filter(Boolean).join(' nº '), num(txt(d, 'vDocFisc'))]),
      ...filhos(filho(inf, 'infCteComp'), 'chCTe').map((d) => ['CT-e complementado', d.textContent.trim(), '']),
    ];
    b.tabela([['TIPO', 35], ['CHAVE / IDENTIFICAÇÃO', 0], ['PIN / VALOR', 35, 'r']], docs);

    // modal rodoviário
    const rodo = primeiro(norm, 'rodo');
    if (rodo) {
      b.secao('MODAL RODOVIÁRIO');
      b.linha(8, [[60, 'RNTRC da empresa', txt(rodo, 'RNTRC')], [0, 'Ordens de coleta', filhos(rodo, 'occ').map((o) => txt(o, 'nOcc')).filter(Boolean).join(', ')]]);
    }

    b.secao('OBSERVAÇÕES');
    const obsCont = filhos(compl, 'ObsCont').map((o) => `${o.getAttribute('xCampo') || ''}: ${txt(o, 'xTexto')}`);
    b.caixaTexto('OBSERVAÇÕES GERAIS', [txt(compl, 'xObs') && `Observações: ${txt(compl, 'xObs')}`, ...obsCont,
      txt(compl, 'xCaracAd') && `Característica adicional: ${txt(compl, 'xCaracAd')}`, txt(imp, 'infAdFisco') && `Inf. de interesse do fisco: ${txt(imp, 'infAdFisco')}`,
      txt(ide, 'tpAmb') === '2' ? 'Emitido em ambiente de homologação — sem valor fiscal.' : '', prot.situacao && `Situação: ${prot.situacao}`].filter(Boolean).join('\n'));
    return b.finalizar(folha);
  }

  // ------------------------------------------------------------ API
  const GERADORES = { 'NF-e': ['DANFE', danfe], 'NFC-e': ['DANFE', danfe], 'MDF-e': ['DAMDFE', damdfe], 'CT-e': ['DACTE', dacte] };

  /** Gera o PDF a partir do XML anonimizado (Document). tipo: 'NF-e' | 'NFC-e' | 'MDF-e' | 'CT-e'. */
  async function gerar(xmlDoc, tipo = 'NF-e') {
    const g = GERADORES[tipo];
    if (!g) throw new Error(`tipo não suportado: ${tipo}`);
    await carregarJsPdf();
    return g[1](xmlDoc).output('blob');
  }

  window.DanfeAnon = {
    gerar,
    suporta: (tipo) => tipo in GERADORES,
    rotulo: (tipo) => GERADORES[tipo]?.[0] || 'PDF',
  };
})();
