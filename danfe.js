/* DANFE pseudonimizado — gera, no aparelho, um PDF no leiaute do DANFE a partir do XML JÁ ANONIMIZADO.
 * Nenhum dado real entra no documento: só os marcadores ([EMPRESA_E01], [CHAVE_02]…) e os dados fiscais.
 * Código de barras e QR Code não são desenhados (codificariam a chave de acesso).
 * Depende de vendor/jspdf (carregado sob demanda).
 */
'use strict';

(() => {
  const REMOVIDO = '[REMOVIDO]';
  const MARGEM = 5, LARG = 200;
  const MOD_FRETE = {
    0: '0 - Emitente (CIF)', 1: '1 - Destinatário (FOB)', 2: '2 - Terceiros',
    3: '3 - Próprio remetente', 4: '4 - Próprio destinatário', 9: '9 - Sem frete',
  };

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
  const filho = (el, nome) => (el ? [...el.children].find((c) => c.localName === nome) : null);
  const primeiro = (el, nome) => (el ? el.getElementsByTagNameNS('*', nome)[0] || null : null);
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
  const docDe = (el) => txt(el, 'CNPJ') || txt(el, 'CPF') || txt(el, 'idEstrangeiro');
  const fmtNumNF = (n) => (n && /^\d+$/.test(n) ? n.padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3') : n);

  function extrair(xmlDoc) {
    const inf = primeiro(xmlDoc, 'infNFe');
    if (!inf) throw new Error('o documento não é uma NF-e/NFC-e');
    const ide = filho(inf, 'ide'), emit = filho(inf, 'emit'), dest = filho(inf, 'dest');
    const tot = primeiro(inf, 'ICMSTot'), ibs = primeiro(inf, 'IBSCBSTot');
    const transp = filho(inf, 'transp'), transporta = filho(transp, 'transporta');
    const veic = filho(transp, 'veicTransp'), vol = filho(transp, 'vol');
    const prot = primeiro(xmlDoc, 'infProt');
    const endE = filho(emit, 'enderEmit'), endD = filho(dest, 'enderDest');
    const emi = data(txt(ide, 'dhEmi') || txt(ide, 'dEmi'));
    const sai = data(txt(ide, 'dhSaiEnt'));
    const rec = data(txt(prot, 'dhRecbto'));

    const itens = [...inf.getElementsByTagNameNS('*', 'det')].map((det) => {
      const prod = filho(det, 'prod'), imp = filho(det, 'imposto');
      const icmsGrupo = filho(imp, 'ICMS')?.firstElementChild;
      const ipiTrib = primeiro(filho(imp, 'IPI'), 'IPITrib');
      const cst = txt(icmsGrupo, 'CST') || txt(icmsGrupo, 'CSOSN');
      const adic = txt(det, 'infAdProd');
      return [
        txt(prod, 'cProd'),
        txt(prod, 'xProd') + (adic ? `\n${adic}` : ''),
        txt(prod, 'NCM'),
        `${txt(icmsGrupo, 'orig')}${cst}`,
        txt(prod, 'CFOP'),
        txt(prod, 'uCom'),
        num(txt(prod, 'qCom'), 4),
        num(txt(prod, 'vUnCom'), 4),
        num(txt(prod, 'vProd')),
        num(txt(icmsGrupo, 'vBC')),
        num(txt(icmsGrupo, 'vICMS')),
        num(txt(ipiTrib, 'vIPI')),
        num(txt(icmsGrupo, 'pICMS')),
        num(txt(ipiTrib, 'pIPI')),
      ].map(limpo);
    });

    const dups = [...(filho(inf, 'cobr')?.getElementsByTagNameNS('*', 'dup') || [])].map((d) => ({
      n: txt(d, 'nDup'), venc: data(txt(d, 'dVenc')).d, v: num(txt(d, 'vDup')),
    }));
    const fat = filho(filho(inf, 'cobr'), 'fat');

    return {
      nfce: txt(ide, 'mod') === '65',
      tpNF: txt(ide, 'tpNF'),
      numero: fmtNumNF(txt(ide, 'nNF')),
      serie: txt(ide, 'serie'),
      natOp: txt(ide, 'natOp'),
      chave: (inf.getAttribute('Id') || '').replace(/^NFe/, ''),
      tpAmb: txt(ide, 'tpAmb'),
      emi, sai,
      protocolo: [txt(prot, 'nProt'), rec.d && `${rec.d} ${rec.h}`].filter(Boolean).join(' - '),
      situacao: txt(prot, 'xMotivo'),
      emit: {
        nome: txt(emit, 'xNome'), fant: txt(emit, 'xFant'), doc: docDe(emit), ie: txt(emit, 'IE'), iest: txt(emit, 'IEST'),
        mun: txt(endE, 'xMun'), uf: txt(endE, 'UF'), crt: txt(emit, 'CRT'),
      },
      dest: {
        nome: txt(dest, 'xNome'), doc: docDe(dest), ie: txt(dest, 'IE'),
        lgr: endD ? [...new Set([txt(endD, 'xLgr'), txt(endD, 'nro'), txt(endD, 'xCpl')].filter(Boolean))].join(', ') : '',
        bairro: txt(endD, 'xBairro'), cep: txt(endD, 'CEP'), mun: txt(endD, 'xMun'), uf: txt(endD, 'UF'), fone: txt(endD, 'fone'),
      },
      tot: {
        vBC: num(txt(tot, 'vBC')), vICMS: num(txt(tot, 'vICMS')), vBCST: num(txt(tot, 'vBCST')), vST: num(txt(tot, 'vST')),
        vII: num(txt(tot, 'vII')), vProd: num(txt(tot, 'vProd')), vFrete: num(txt(tot, 'vFrete')), vSeg: num(txt(tot, 'vSeg')),
        vDesc: num(txt(tot, 'vDesc')), vOutro: num(txt(tot, 'vOutro')), vIPI: num(txt(tot, 'vIPI')), vNF: num(txt(tot, 'vNF')),
        vICMSUFDest: num(txt(tot, 'vICMSUFDest')), vFCPUFDest: num(txt(tot, 'vFCPUFDest')), vFCP: num(txt(tot, 'vFCP')),
        vTotTrib: num(txt(tot, 'vTotTrib')),
        vIBS: num(primeiro(ibs, 'vIBS')?.textContent), vCBS: num(primeiro(ibs, 'vCBS')?.textContent),
      },
      transp: {
        mod: MOD_FRETE[txt(transp, 'modFrete')] || txt(transp, 'modFrete'),
        nome: txt(transporta, 'xNome'), doc: docDe(transporta), ie: txt(transporta, 'IE'),
        ender: txt(transporta, 'xEnder'), mun: txt(transporta, 'xMun'), uf: txt(transporta, 'UF'),
        antt: txt(veic, 'RNTC'), placa: txt(veic, 'placa'), ufPlaca: txt(veic, 'UF'),
        qVol: txt(vol, 'qVol'), esp: txt(vol, 'esp'), marca: txt(vol, 'marca'), nVol: txt(vol, 'nVol'),
        pesoB: num(txt(vol, 'pesoB'), 3), pesoL: num(txt(vol, 'pesoL'), 3),
      },
      fat: fat ? `Fatura ${txt(fat, 'nFat')} · original ${num(txt(fat, 'vOrig'))} · desconto ${num(txt(fat, 'vDesc'))} · líquido ${num(txt(fat, 'vLiq'))}` : '',
      dups,
      infCpl: txt(filho(inf, 'infAdic'), 'infCpl'),
      infAdFisco: txt(filho(inf, 'infAdic'), 'infAdFisco'),
      itens,
    };
  }

  // ------------------------------------------------------------ desenho
  function gerarPdf(d) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pdf.setProperties({ title: 'DANFE pseudonimizado - sem valor fiscal', subject: 'Gerado a partir de XML pseudonimizado', creator: 'DF-e Offline' });
    pdf.setLineWidth(0.2);
    pdf.setDrawColor(0);

    // campo com rótulo pequeno em cima e valor embaixo
    function campo(x, y, w, h, rotulo, valor, o = {}) {
      pdf.rect(x, y, w, h);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5); pdf.setTextColor(60);
      pdf.text(limpo(rotulo).toUpperCase(), x + 1, y + 2.2);
      pdf.setTextColor(0);
      pdf.setFont('helvetica', o.bold ? 'bold' : 'normal'); pdf.setFontSize(o.size || 7.5);
      const linhas = pdf.splitTextToSize(limpo(valor), w - 2).slice(0, o.linhas || 1);
      const xs = o.align === 'right' ? x + w - 1 : o.align === 'center' ? x + w / 2 : x + 1;
      pdf.text(linhas, xs, y + 5.4, { align: o.align || 'left' });
    }
    function linha(y, h, defs) { // defs: [largura, rótulo, valor, opções]
      let x = MARGEM;
      for (const [w, r, v, o] of defs) { campo(x, y, w, h, r, v, o); x += w; }
      return y + h;
    }
    function secao(y, titulo) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.setTextColor(0);
      pdf.text(titulo, MARGEM, y + 2.6);
      return y + 3.4;
    }

    let y = MARGEM;
    // faixa de aviso
    pdf.setFillColor(179, 38, 30);
    pdf.rect(MARGEM, y, LARG, 6, 'F');
    pdf.setTextColor(255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8);
    pdf.text('DOCUMENTO PSEUDONIMIZADO — SEM VALOR FISCAL — gerado a partir de XML anonimizado', MARGEM + LARG / 2, y + 4, { align: 'center' });
    pdf.setTextColor(0);
    y += 7.5;

    // cabeçalho: emitente | DANFE | chave
    const hCab = 32;
    pdf.rect(MARGEM, y, 85, hCab);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5); pdf.setTextColor(60);
    pdf.text('IDENTIFICAÇÃO DO EMITENTE', MARGEM + 1, y + 2.2); pdf.setTextColor(0);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
    pdf.text(pdf.splitTextToSize(limpo(d.emit.nome), 81).slice(0, 2), MARGEM + 42.5, y + 9, { align: 'center' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
    pdf.text([
      d.emit.fant && d.emit.fant !== d.emit.nome ? limpo(`Nome fantasia: ${d.emit.fant}`) : '',
      'Endereço: (suprimido)',
      limpo(`${d.emit.mun} - ${d.emit.uf}`),
    ].filter(Boolean), MARGEM + 42.5, y + 18, { align: 'center' });

    const xD = MARGEM + 85;
    pdf.rect(xD, y, 35, hCab);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
    pdf.text(d.nfce ? 'DANFE NFC-e' : 'DANFE', xD + 17.5, y + 6, { align: 'center' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5);
    pdf.text(['Documento Auxiliar da', `Nota Fiscal ${d.nfce ? 'de Consumidor ' : ''}Eletrônica`], xD + 17.5, y + 9.5, { align: 'center' });
    pdf.setFontSize(6.5);
    pdf.text(['0 - ENTRADA', '1 - SAÍDA'], xD + 3, y + 15.5);
    pdf.rect(xD + 24, y + 13.5, 7, 6);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
    pdf.text(d.tpNF || '', xD + 27.5, y + 18, { align: 'center' });
    pdf.setFontSize(8);
    pdf.text([`Nº ${limpo(d.numero)}`, `SÉRIE ${limpo(d.serie)}`], xD + 17.5, y + 24, { align: 'center' });
    const yFolha = y + 30.5;

    const xC = xD + 35, wC = LARG - 120;
    pdf.rect(xC, y, wC, hCab);
    pdf.setFillColor(235); pdf.rect(xC + 2, y + 2, wC - 4, 11, 'F');
    pdf.setFont('helvetica', 'italic'); pdf.setFontSize(6.5); pdf.setTextColor(90);
    pdf.text(['código de barras omitido', '(codificaria a chave de acesso)'], xC + wC / 2, y + 6.8, { align: 'center' });
    pdf.setTextColor(0);
    campo(xC, y + 15, wC, 8, 'Chave de acesso', d.chave, { bold: true, align: 'center', size: 9 });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6);
    pdf.text(pdf.splitTextToSize('Consulta de autenticidade não aplicável: documento pseudonimizado para análise.', wC - 4), xC + wC / 2, y + 27, { align: 'center' });
    y += hCab;

    y = linha(y, 8, [[120, 'Natureza da operação', d.natOp], [80, 'Protocolo de autorização de uso', d.protocolo, { align: 'center' }]]);
    y = linha(y, 8, [[67, 'Inscrição estadual', d.emit.ie], [67, 'Insc. estadual do subst. tributário', d.emit.iest], [66, 'CNPJ / CPF', d.emit.doc]]);

    // destinatário
    y = secao(y + 1, 'DESTINATÁRIO / REMETENTE');
    y = linha(y, 8, [[120, 'Nome / razão social', d.dest.nome], [45, 'CNPJ / CPF', d.dest.doc], [35, 'Data da emissão', d.emi.d, { align: 'center' }]]);
    y = linha(y, 8, [[95, 'Endereço', d.dest.lgr], [45, 'Bairro / distrito', d.dest.bairro], [25, 'CEP', d.dest.cep], [35, 'Data da saída/entrada', d.sai.d, { align: 'center' }]]);
    y = linha(y, 8, [[70, 'Município', d.dest.mun], [35, 'Fone / fax', d.dest.fone], [15, 'UF', d.dest.uf, { align: 'center' }], [45, 'Inscrição estadual', d.dest.ie], [35, 'Hora da saída', d.sai.h, { align: 'center' }]]);

    // fatura
    if (d.dups.length || d.fat) {
      y = secao(y + 1, 'FATURA / DUPLICATAS');
      if (d.fat) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.text(limpo(d.fat), MARGEM + 1, y + 2.5); y += 3.5; }
      const porLinha = 6, w = LARG / porLinha;
      d.dups.forEach((dp, i) => {
        const col = i % porLinha;
        if (col === 0 && i) y += 8;
        campo(MARGEM + col * w, y, w, 8, `Nº ${dp.n}  ·  venc. ${dp.venc}`, `R$ ${dp.v}`);
      });
      if (d.dups.length) y += 8;
    }

    // cálculo do imposto
    const t = d.tot, w6 = LARG / 6;
    y = secao(y + 1, 'CÁLCULO DO IMPOSTO');
    const dir = { align: 'right' };
    y = linha(y, 8, [[w6, 'Base de cálc. do ICMS', t.vBC, dir], [w6, 'Valor do ICMS', t.vICMS, dir], [w6, 'Base de cálc. ICMS ST', t.vBCST, dir],
      [w6, 'Valor do ICMS subst.', t.vST, dir], [w6, 'V. imp. importação', t.vII, dir], [w6, 'V. total dos produtos', t.vProd, dir]]);
    y = linha(y, 8, [[w6, 'Valor do frete', t.vFrete, dir], [w6, 'Valor do seguro', t.vSeg, dir], [w6, 'Desconto', t.vDesc, dir],
      [w6, 'Outras desp. acessórias', t.vOutro, dir], [w6, 'Valor do IPI', t.vIPI, dir], [w6, 'V. total da nota', t.vNF, { align: 'right', bold: true }]]);
    const extras = [['V. ICMS UF destino', t.vICMSUFDest], ['V. FCP UF destino', t.vFCPUFDest], ['Valor do FCP', t.vFCP],
      ['V. aprox. tributos', t.vTotTrib], ['Valor do IBS', t.vIBS], ['Valor da CBS', t.vCBS]].filter(([, v]) => v);
    if (extras.length) y = linha(y, 8, extras.map(([r, v]) => [LARG / extras.length, r, v, dir]));

    // transportador
    const tr = d.transp;
    y = secao(y + 1, 'TRANSPORTADOR / VOLUMES TRANSPORTADOS');
    y = linha(y, 8, [[68, 'Nome / razão social', tr.nome], [34, 'Frete por conta', tr.mod], [25, 'Código ANTT', tr.antt], [25, 'Placa do veículo', tr.placa],
      [10, 'UF', tr.ufPlaca, { align: 'center' }], [38, 'CNPJ / CPF', tr.doc]]);
    y = linha(y, 8, [[90, 'Endereço', tr.ender], [60, 'Município', tr.mun], [10, 'UF', tr.uf, { align: 'center' }], [40, 'Inscrição estadual', tr.ie]]);
    y = linha(y, 8, [[w6, 'Quantidade', tr.qVol], [w6, 'Espécie', tr.esp], [w6, 'Marca', tr.marca], [w6, 'Numeração', tr.nVol],
      [w6, 'Peso bruto', tr.pesoB, dir], [w6, 'Peso líquido', tr.pesoL, dir]]);

    // produtos
    y = secao(y + 1, 'DADOS DOS PRODUTOS / SERVIÇOS');
    const numDir = { halign: 'right' };
    pdf.autoTable({
      startY: y,
      margin: { left: MARGEM, right: MARGEM, top: 14, bottom: 12 },
      head: [['CÓDIGO', 'DESCRIÇÃO DO PRODUTO / SERVIÇO', 'NCM/SH', 'O/CST', 'CFOP', 'UN', 'QUANT.', 'V. UNIT.', 'V. TOTAL', 'BC ICMS', 'V. ICMS', 'V. IPI', 'ALÍQ. ICMS', 'ALÍQ. IPI']],
      body: d.itens,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 5.8, cellPadding: 0.8, lineColor: 0, lineWidth: 0.1, textColor: 0, overflow: 'linebreak' },
      headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: 'bold', fontSize: 5.2, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 15 }, 1: { cellWidth: 51 }, 2: { cellWidth: 12 }, 3: { cellWidth: 9, halign: 'center' }, 4: { cellWidth: 9, halign: 'center' },
        5: { cellWidth: 8, halign: 'center' }, 6: { cellWidth: 14, ...numDir }, 7: { cellWidth: 14, ...numDir }, 8: { cellWidth: 15, ...numDir },
        9: { cellWidth: 14, ...numDir }, 10: { cellWidth: 12, ...numDir }, 11: { cellWidth: 11, ...numDir }, 12: { cellWidth: 8, ...numDir }, 13: { cellWidth: 8, ...numDir },
      },
      didDrawPage: (info) => {
        if (info.pageNumber > 1) {
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(179, 38, 30);
          pdf.text(limpo(`DANFE PSEUDONIMIZADO — SEM VALOR FISCAL · Nº ${d.numero} · SÉRIE ${d.serie} · continuação`), MARGEM, 10);
          pdf.setTextColor(0);
        }
      },
    });
    y = pdf.lastAutoTable.finalY + 1;

    // dados adicionais
    const adic = [d.infCpl && `Inf. complementares: ${d.infCpl}`, d.infAdFisco && `Inf. de interesse do fisco: ${d.infAdFisco}`,
      d.tpAmb === '2' ? 'Emitida em ambiente de homologação — sem valor fiscal.' : '', d.situacao && `Situação: ${d.situacao}`]
      .filter(Boolean).join('\n');
    pdf.setFontSize(6.5);
    const linhasAdic = pdf.splitTextToSize(limpo(adic || '—'), 128);
    const hAdic = Math.max(24, linhasAdic.length * 2.8 + 6);
    if (y + 3.4 + hAdic > 297 - 12) { pdf.addPage(); y = 14; }
    y = secao(y, 'DADOS ADICIONAIS');
    pdf.rect(MARGEM, y, 130, hAdic);
    pdf.rect(MARGEM + 130, y, LARG - 130, hAdic);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5); pdf.setTextColor(60);
    pdf.text('INFORMAÇÕES COMPLEMENTARES', MARGEM + 1, y + 2.2);
    pdf.text('RESERVADO AO FISCO', MARGEM + 131, y + 2.2);
    pdf.setTextColor(0); pdf.setFontSize(6.5);
    pdf.text(linhasAdic, MARGEM + 1, y + 5.2);

    // em todas as páginas: marca d'água, rodapé e numeração da folha
    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      pdf.saveGraphicsState();
      pdf.setGState(new pdf.GState({ opacity: 0.1 }));
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(46); pdf.setTextColor(179, 38, 30);
      pdf.text('PSEUDONIMIZADO', 105, 150, { align: 'center', angle: 35 });
      pdf.text('SEM VALOR FISCAL', 118, 185, { align: 'center', angle: 35 });
      pdf.restoreGraphicsState();
      pdf.setTextColor(90); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5);
      pdf.text('DF-e Offline · documento gerado no aparelho a partir de XML pseudonimizado · sem valor fiscal · os marcadores só podem ser revertidos com a tabela de-para do aparelho de origem',
        MARGEM, 297 - 5);
      pdf.text(`Folha ${p}/${total}`, 205, 297 - 5, { align: 'right' });
      pdf.setTextColor(0);
    }
    pdf.setPage(1);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7);
    pdf.text(`FOLHA 1/${total}`, xD + 17.5, yFolha, { align: 'center' });
    return pdf;
  }

  /** Gera o PDF a partir do XML anonimizado (Document) e retorna um Blob. */
  async function gerar(xmlDoc) {
    await carregarJsPdf();
    const dados = extrair(xmlDoc);
    return gerarPdf(dados).output('blob');
  }

  window.DanfeAnon = { gerar, extrair, suporta: (tipo) => tipo === 'NF-e' || tipo === 'NFC-e' };
})();
