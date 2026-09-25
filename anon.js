/* Anonimizador de XML de DF-e (NF-e, NFC-e, MDF-e, CT-e) — 100% local.
 * Pseudonimização consistente: o mesmo CNPJ/CPF/nome/placa vira sempre o mesmo marcador,
 * inclusive entre documentos diferentes (permite cruzar MDF-e × NF-e na IA).
 * Depende de app.js (chaveValida, toast, copiar).
 */
'use strict';

(() => {
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ regras por tag
  const TAG_DOC = new Set(['CNPJ', 'CPF', 'CNPJReceb', 'CNPJPag', 'CNPJIntermed', 'CNPJCPF', 'CPFCNPJ']);
  const TAG_NOME = new Set(['xNome', 'xFant', 'xSeg', 'xContato']);
  // valor identificador → marcador da categoria (vinculado à entidade quando há CNPJ/CPF no mesmo grupo)
  const TAG_VALOR = {
    IE: 'IE', IEST: 'IEST', IM: 'IM', idEstrangeiro: 'IDESTR', placa: 'PLACA', RENAVAM: 'RENAVAM',
    RNTRC: 'RNTRC', RNTC: 'RNTRC', CIOT: 'CIOT', cInt: 'VEIC', nApol: 'APOLICE', nAver: 'AVERB',
    idCadIntTran: 'INTERMED', cAut: 'AUTCARTAO', nProt: 'PROT', nRECOPI: 'RECOPI',
  };
  const TAG_ENDERECO = new Set(['xLgr', 'nro', 'xCpl', 'xBairro', 'CEP', 'fone', 'email', 'xEnder']);
  const TAG_SUPRIMIR = new Set(['cNF', 'cMDF', 'cCT', 'digVal']);
  const TAG_TEXTO_LIVRE = new Set(['infCpl', 'infAdFisco', 'xTexto', 'xObs', 'infAdProd', 'xCorrecao', 'xJust', 'xCaracAd', 'xCaracSer']);
  const NO_REMOVER = new Set(['Signature', 'infNFeSupl', 'infMDFeSupl', 'infCTeSupl', 'infRespTec']);
  const TAG_GTIN = new Set(['cEAN', 'cEANTrib', 'cBarra', 'cBarraTrib']); // 14 dígitos que não são CNPJ
  const TAG_NUMERO = new Set(['nNF', 'nMDF', 'nCT', 'serie']);
  const ARRAYS = new Set(['det', 'dup', 'detPag', 'vol', 'condutor', 'infMunDescarga', 'infMunCarrega', 'veicReboque', 'lacres', 'infPercurso', 'NFref', 'obsCont', 'obsFisco', 'autXML', 'infSeg']);
  const REMOVIDO = '[REMOVIDO]';

  // ------------------------------------------------------------ validações
  function cnpjValido(s) {
    s = s.toUpperCase();
    if (!/^[A-Z0-9]{12}\d{2}$/.test(s) || /^(\d)\1{13}$/.test(s)) return false;
    const v = [...s].map((c) => c.charCodeAt(0) - 48); // regra do CNPJ alfanumérico (vale p/ numérico)
    const dv = (n) => {
      const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let soma = 0;
      for (let i = 0; i < n; i++) soma += v[i] * w[i];
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === v[12] && dv(13) === v[13];
  }
  function cpfValido(s) {
    if (!/^\d{11}$/.test(s) || /^(\d)\1{10}$/.test(s)) return false;
    const d = [...s].map(Number);
    for (const n of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += d[i] * (n + 1 - i);
      const r = (soma * 10) % 11 % 10;
      if (r !== d[n]) return false;
    }
    return true;
  }
  const soAlnum = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normNome = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  function fmtDoc(d) {
    if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    return d;
  }

  // ------------------------------------------------------------ tabela de-para
  const CHAVE_MAPA = 'chave-dfe:anon:v1';
  let M = { fwd: {}, rev: {}, cont: {} };
  try { const r = localStorage.getItem(CHAVE_MAPA); if (r) M = JSON.parse(r); } catch { /* sem armazenamento */ }
  const salvarMapa = () => { try { localStorage.setItem(CHAVE_MAPA, JSON.stringify(M)); } catch { /* ignora */ } };
  const prox = (cat) => String((M.cont[cat] = (M.cont[cat] || 0) + 1)).padStart(2, '0');

  /** Entidade (pessoa/empresa) a partir do CNPJ/CPF. Retorna id tipo "E01" / "P01". */
  function entidade(doc) {
    const d = soAlnum(doc);
    const k = 'DOC|' + d;
    if (M.fwd[k]) return M.fwd[k];
    const t = d.length === 11 ? 'P' : 'E';
    const id = t + prox(t);
    M.fwd[k] = id;
    M.rev[tokDocDe(id)] = fmtDoc(d);
    return id;
  }
  const tokDocDe = (id) => `[${id[0] === 'P' ? 'CPF' : 'CNPJ'}_${id}]`;
  const tokDoc = (doc) => tokDocDe(entidade(doc));

  // Formas curtas do nome usadas em textos livres ("Transportes Rio Guamá EIRELI" → "TRANSPORTES RIO GUAMA")
  const SUFIXOS = new Set(['LTDA', 'EIRELI', 'EPP', 'ME', 'MEI', 'SLU', 'SA', 'S', 'A', 'CIA', 'E']);
  const CONECTIVOS = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
  function variantesNome(nome, pessoa) {
    const pal = normNome(nome).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const vars = new Set();
    if (pessoa) {
      const sig = pal.filter((p) => !CONECTIVOS.has(p));
      if (sig.length >= 3) { vars.add(`${sig[0]} ${sig[sig.length - 1]}`); vars.add(`${sig[0]} ${sig[1]}`); }
    } else {
      const base = [...pal];
      while (base.length > 1 && SUFIXOS.has(base[base.length - 1])) base.pop();
      if (base.length >= 2) vars.add(base.join(' '));
      if (base.length >= 4) vars.add(base.slice(0, 3).join(' '));
    }
    return [...vars].filter((v) => v.length >= 8 && v.includes(' '));
  }
  function registrarNome(nome, t) {
    const pessoa = /^\[(PESSOA|NOME)/.test(t);
    for (const v of variantesNome(nome, pessoa)) if (!M.fwd['VAR|' + v]) M.fwd['VAR|' + v] = t;
  }

  function tokNome(nome, id) {
    const k = 'NOME|' + normNome(nome);
    let t;
    if (id) {
      t = `[${id[0] === 'P' ? 'PESSOA' : 'EMPRESA'}_${id}]`;
      if (!(t in M.rev)) M.rev[t] = nome.trim();
      if (!M.fwd[k] || M.fwd[k].startsWith('[NOME_')) M.fwd[k] = t;
    } else if (M.fwd[k]) {
      return M.fwd[k];
    } else {
      t = `[NOME_N${prox('N')}]`;
      M.fwd[k] = t; M.rev[t] = nome.trim();
    }
    registrarNome(nome, t);
    return t;
  }

  function tokValor(cat, valor, id) {
    const v = valor.trim();
    const k = cat + '|' + soAlnum(v || '');
    if (M.fwd[k]) return M.fwd[k];
    const t = id ? `[${cat}_${id}]` : `[${cat}_${prox(cat)}]`;
    if (t in M.rev && M.rev[t] !== v) { // mesma entidade com 2 valores da mesma categoria
      const t2 = `[${cat}_${prox(cat)}]`;
      M.fwd[k] = t2; M.rev[t2] = v; return t2;
    }
    M.fwd[k] = t; M.rev[t] = v;
    return t;
  }
  const tokChave = (ch) => tokValor('CHAVE', ch);

  // ------------------------------------------------------------ limpeza de texto
  const ACENTOS = { A: 'AÁÀÂÃÄ', E: 'EÉÈÊË', I: 'IÍÌÎÏ', O: 'OÓÒÔÕÖ', U: 'UÚÙÛÜ', C: 'CÇ', N: 'NÑ' };
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  function regexNome(nome) {
    const n = normNome(nome);
    let p = '';
    for (const ch of n) {
      if (ch === ' ') p += '\\s+';
      else if (ACENTOS[ch]) p += `[${ACENTOS[ch]}${ACENTOS[ch].toLowerCase()}]`;
      else p += escRe(ch);
    }
    return new RegExp(`(?<![\\p{L}\\p{N}])${p}(?![\\p{L}\\p{N}])`, 'giu');
  }

  /** Valores reais já conhecidos (de todos os lotes), do maior para o menor. */
  function conhecidos() {
    const lista = [];
    for (const [tok, real] of Object.entries(M.rev)) {
      if (!real || real === 'ISENTO') continue;
      const cat = tok.slice(1, tok.indexOf('_'));
      if (['CNPJ', 'CPF'].includes(cat)) {
        lista.push([real, tok], [soAlnum(real), tok]);
      } else if (!['EMPRESA', 'PESSOA', 'NOME', 'CHAVE'].includes(cat) && soAlnum(real).length >= 5) {
        lista.push([real, tok]);
      }
    }
    // todos os nomes (razão social, fantasia, nomes de pessoas) e suas formas curtas
    for (const [k, tok] of Object.entries(M.fwd)) {
      if ((k.startsWith('NOME|') || k.startsWith('VAR|')) && k.length - k.indexOf('|') - 1 >= 4) {
        lista.push([k.slice(k.indexOf('|') + 1), tok, true]);
      }
    }
    return lista.sort((a, b) => b[0].length - a[0].length);
  }
  /** Substitui um identificador conhecido só quando não está colado a outras letras/dígitos. */
  const reLiteral = (s) => new RegExp(`(?<![A-Za-z0-9])${escRe(s)}(?![A-Za-z0-9])`, 'g');

  const RE = {
    chave: /(?<!\d)\d{44}(?!\d)/g,
    cnpjFmt: /(?<![A-Z0-9])[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2}(?!\d)/gi,
    cpfFmt: /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g,
    cnpjNu: /(?<![A-Za-z0-9])[A-Z0-9]{12}\d{2}(?![A-Za-z0-9])/g,
    cpfNu: /(?<!\d)\d{11}(?!\d)/g,
    email: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
    placa: /(?<![A-Z0-9])[A-Z]{3}-?\d[A-Z0-9]\d{2}(?![A-Z0-9])/g,
    fone: /(?:\(\d{2}\)\s?|(?<!\d)\d{2}[\s-])?9?\d{4}[-\s.]\d{4}(?!\d)/g,
    cep: /(?<!\d)\d{5}-\d{3}(?!\d)/g,
  };

  /** Troca chaves e CNPJ/CPF válidos em qualquer texto (campos estruturados). */
  function limparBasico(s) {
    return s
      .replace(RE.chave, (m) => (chaveValida(m) ? tokChave(m) : m))
      .replace(RE.cnpjNu, (m) => (cnpjValido(m) ? tokDoc(m) : m))
      .replace(RE.cpfNu, (m) => (cpfValido(m) ? tokDoc(m) : m));
  }

  /** Texto livre: dados conhecidos + padrões (CNPJ, CPF, e-mail, placa, telefone, CEP). */
  function limparTextoLivre(s) {
    // chaves primeiro: o CNPJ embutido nelas não pode ser trocado isoladamente
    s = s.replace(RE.chave, (m) => (chaveValida(m) ? tokChave(m) : m));
    for (const [real, tok, ehNome] of conhecidos()) {
      s = s.replace(ehNome ? regexNome(real) : reLiteral(real), tok);
    }
    return limparBasico(s)
      .replace(RE.cnpjFmt, (m) => tokDoc(m))
      .replace(RE.cpfFmt, (m) => tokDoc(m))
      .replace(RE.email, (m) => tokValor('EMAIL', m))
      .replace(RE.placa, (m) => tokValor('PLACA', m.replace('-', '')))
      .replace(RE.fone, (m) => tokValor('FONE', m.replace(/\D/g, '')))
      .replace(RE.cep, '[CEP]');
  }

  // ------------------------------------------------------------ anonimização
  const folhas = (doc) => [...doc.getElementsByTagName('*')].filter((e) => e.children.length === 0);

  function anonimizar(xmlTexto, opc) {
    const doc = new DOMParser().parseFromString(xmlTexto.replace(/^﻿/, '').trim(), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido');

    // 0) remove assinatura digital (o certificado contém razão social e CNPJ), QR Code e resp. técnico
    [...doc.getElementsByTagName('*')].filter((e) => NO_REMOVER.has(e.localName)).forEach((e) => e.remove());

    // 1) entidades: cada grupo (emit, dest, transporta, condutor, prop…) com seu CNPJ/CPF
    const entDoGrupo = new Map();
    for (const el of folhas(doc)) {
      if (TAG_DOC.has(el.localName) && el.textContent.trim()) {
        entDoGrupo.set(el.parentNode, entidade(el.textContent.trim()));
      }
    }

    // 2) substituições campo a campo
    const livres = [];
    for (const el of folhas(doc)) {
      const n = el.localName;
      const v = el.textContent;
      if (!v.trim()) continue;
      const id = entDoGrupo.get(el.parentNode);
      if (TAG_DOC.has(n)) el.textContent = tokDoc(v);
      else if (TAG_NOME.has(n)) el.textContent = tokNome(v, id);
      else if (TAG_VALOR[n]) el.textContent = v.trim().toUpperCase() === 'ISENTO' ? v : tokValor(TAG_VALOR[n], v, id);
      else if (TAG_ENDERECO.has(n) || TAG_SUPRIMIR.has(n)) el.textContent = REMOVIDO;
      else if (TAG_TEXTO_LIVRE.has(n)) {
        el.textContent = opc.removerLivre ? REMOVIDO : limparTextoLivre(v);
        if (!opc.removerLivre) livres.push({ campo: n, texto: el.textContent });
      } else if (TAG_NUMERO.has(n) && !opc.manterNumero && el.parentNode.localName === 'ide') {
        el.textContent = tokValor(n === 'serie' ? 'SERIE' : 'NUMDOC', v);
      } else if (!TAG_GTIN.has(n)) el.textContent = limparBasico(v);
    }

    // 3) atributos (Id="NFe<chave>", etc.)
    for (const el of doc.getElementsByTagName('*')) {
      for (const a of [...el.attributes]) {
        if (a.name.startsWith('xmlns')) continue;
        const novo = limparBasico(a.value);
        if (novo !== a.value) el.setAttribute(a.name, novo);
      }
    }
    salvarMapa();

    const ide = doc.getElementsByTagNameNS('*', 'ide')[0];
    const campo = (pai, n) => pai?.getElementsByTagNameNS('*', n)[0]?.textContent || '';
    const raiz = doc.documentElement.localName;
    const mod = campo(ide, 'mod');
    const tipo = /mdfe/i.test(raiz) || doc.getElementsByTagNameNS('*', 'infMDFe').length ? 'MDF-e'
      : /cte/i.test(raiz) || doc.getElementsByTagNameNS('*', 'infCte').length ? 'CT-e'
      : mod === '65' ? 'NFC-e' : /evento/i.test(raiz) ? 'Evento' : 'NF-e';
    const emit = doc.getElementsByTagNameNS('*', 'emit')[0];
    const dest = doc.getElementsByTagNameNS('*', 'dest')[0];
    return {
      doc,
      tipo,
      numero: campo(ide, 'nNF') || campo(ide, 'nMDF') || campo(ide, 'nCT'),
      itens: doc.getElementsByTagNameNS('*', 'det').length,
      emit: emit ? `${campo(emit, 'xNome')} (${campo(emit, 'UF')})` : '',
      dest: dest ? `${campo(dest, 'xNome')} (${campo(dest, 'UF')})` : '',
      livres,
    };
  }

  // ------------------------------------------------------------ XML → JSON enxuto
  function paraJson(el) {
    const filhos = [...el.children];
    const o = {};
    for (const a of el.attributes) if (!a.name.startsWith('xmlns')) o[a.localName] = a.value;
    if (!filhos.length) {
      const t = el.textContent.trim();
      if (!t || t === REMOVIDO) return undefined;
      return Object.keys(o).length ? { ...o, valor: t } : t;
    }
    const cont = {};
    filhos.forEach((f) => { cont[f.localName] = (cont[f.localName] || 0) + 1; });
    for (const f of filhos) {
      const v = paraJson(f);
      if (v === undefined) continue;
      const n = f.localName;
      if (cont[n] > 1 || ARRAYS.has(n)) (o[n] = o[n] || []).push(v);
      else o[n] = v;
    }
    return Object.keys(o).length ? o : undefined;
  }

  // ------------------------------------------------------------ verificação final
  function verificar(docs) {
    const bloqueios = [], atencoes = [];
    const mascarar = (s) => (s.length > 6 ? s.slice(0, 3) + '…' + s.slice(-2) : '…');
    const reais = conhecidos().map(([real, , ehNome]) => ({
      real, ehNome, re: ehNome ? new RegExp(regexNome(real).source, 'iu') : null,
    }));
    docs.forEach((d, i) => {
      const onde = (el) => `doc ${i + 1} (${d.tipo}) › ${el.localName}`;
      const nos = [];
      for (const el of d.doc.getElementsByTagName('*')) {
        for (const a of el.attributes) if (!a.name.startsWith('xmlns')) nos.push([el, a.value, `@${a.localName}`]);
        if (!el.children.length) nos.push([el, el.textContent, '']);
      }
      for (const [el, txt, attr] of nos) {
        if (!txt || txt === REMOVIDO) continue;
        const local = onde(el) + attr;
        const t = txt.replace(/\[[A-Z]+_[A-Z]?\d+\]/g, ' '); // ignora marcadores
        for (const m of t.matchAll(RE.chave)) if (chaveValida(m[0])) bloqueios.push(`${local}: chave de acesso ${mascarar(m[0])}`);
        if (!TAG_GTIN.has(el.localName)) {
          for (const m of t.matchAll(RE.cnpjNu)) if (cnpjValido(m[0])) bloqueios.push(`${local}: CNPJ ${mascarar(m[0])}`);
          for (const m of t.matchAll(RE.cpfNu)) if (cpfValido(m[0])) bloqueios.push(`${local}: CPF ${mascarar(m[0])}`);
        }
        for (const m of t.matchAll(RE.cnpjFmt)) bloqueios.push(`${local}: CNPJ ${mascarar(m[0])}`);
        for (const m of t.matchAll(RE.cpfFmt)) bloqueios.push(`${local}: CPF ${mascarar(m[0])}`);
        for (const m of t.matchAll(RE.email)) bloqueios.push(`${local}: e-mail ${mascarar(m[0])}`);
        for (const { real, ehNome, re } of reais) {
          if (ehNome ? re.test(t) : real.length >= 5 && t.includes(real)) {
            // nome dentro de campo estruturado (ex.: marca no xProd igual ao nome fantasia) → alerta
            if (ehNome && !TAG_TEXTO_LIVRE.has(el.localName)) atencoes.push(`${local}: contém nome cadastrado ${mascarar(real)} (pode ser marca do produto)`);
            else bloqueios.push(`${local}: dado cadastrado (${ehNome ? 'nome' : 'identificador'}) ${mascarar(real)}`);
          }
        }
        if (TAG_TEXTO_LIVRE.has(el.localName)) {
          if (t.match(RE.placa)) atencoes.push(`${local}: possível placa`);
          if (t.match(RE.fone)) atencoes.push(`${local}: possível telefone`);
        }
      }
    });
    return { bloqueios: [...new Set(bloqueios)], atencoes: [...new Set(atencoes)] };
  }

  // ------------------------------------------------------------ restaurar resposta da IA
  function restaurar(texto) {
    let n = 0;
    const desconhecidos = new Set();
    const out = texto.replace(/\[?\b([A-Z]+)_([A-Z]?\d{2,})\b\]?/g, (m, cat, id) => {
      const tok = `[${cat}_${id}]`;
      if (tok in M.rev) { n++; return M.rev[tok]; }
      if (m.startsWith('[')) desconhecidos.add(tok);
      return m;
    });
    return { out, n, desconhecidos: [...desconhecidos] };
  }

  // ------------------------------------------------------------ interface
  let lote = [];      // XMLs originais (só em memória)
  let resultado = null;

  const PREFACIO = 'Documentos fiscais eletrônicos (XML convertido em JSON), pseudonimizados. '
    + 'Marcadores entre colchetes — ex.: [EMPRESA_E01], [CNPJ_E01], [IE_E01], [PESSOA_P01], [CHAVE_01], [PLACA_01] — '
    + 'substituem dados identificadores; o mesmo marcador indica sempre a mesma entidade em todos os documentos. '
    + 'Endereços, telefones e e-mails foram suprimidos. Ao responder, use os marcadores exatamente como estão.\n\n';

  function opcoes() {
    return { removerLivre: $('optTextoLivre').checked, manterNumero: $('optNumero').checked };
  }

  function processarLote() {
    if (!lote.length) { $('anonResultado').hidden = true; return; }
    const opc = opcoes();
    const docs = [], erros = [];
    // 1ª passada só registra entidades e nomes de TODOS os documentos (um nome que aparece
    // no MDF-e precisa ser reconhecido no texto livre da NF-e, e vice-versa)
    lote.forEach((x) => { try { anonimizar(x, opc); } catch { /* erro é reportado abaixo */ } });
    lote.forEach((x, i) => {
      try { docs.push(anonimizar(x, opc)); } catch (e) { erros.push(`XML ${i + 1}: ${e.message}`); }
    });
    const json = {
      documentos: docs.map((d, i) => ({ doc: i + 1, tipo: d.tipo, conteudo: paraJson(d.doc.documentElement) })),
    };
    const texto = PREFACIO + JSON.stringify(json, null, 1);
    const verif = verificar(docs);
    resultado = { docs, texto, json, verif };
    renderResultado(erros);
    renderTabela();
  }

  function renderResultado(erros) {
    const { docs, texto, verif } = resultado;
    $('anonResultado').hidden = false;
    $('anonSaida').value = texto;

    const v = $('anonVerif');
    v.textContent = '';
    v.className = 'verif ' + (verif.bloqueios.length ? 'err' : verif.atencoes.length ? 'warn' : 'ok');
    const h = document.createElement('strong');
    h.textContent = verif.bloqueios.length
      ? `Atenção: ${verif.bloqueios.length} possível(is) dado(s) identificador(es) na saída`
      : 'Verificação: nenhum CNPJ, CPF, chave, e-mail ou dado cadastrado encontrado na saída';
    v.appendChild(h);
    const ul = document.createElement('ul');
    [...verif.bloqueios, ...verif.atencoes, ...erros].slice(0, 12).forEach((t) => {
      const li = document.createElement('li'); li.textContent = t; ul.appendChild(li);
    });
    if (ul.children.length) v.appendChild(ul);
    const livres = docs.flatMap((d, i) => d.livres.map((l) => ({ ...l, doc: i + 1 })));
    if (livres.length) {
      const p = document.createElement('p');
      p.textContent = 'Textos livres após a limpeza — confira se sobrou nome de pessoa ou empresa não cadastrada:';
      v.appendChild(p);
      livres.slice(0, 8).forEach((l) => {
        const q = document.createElement('blockquote');
        q.textContent = `doc ${l.doc} › ${l.campo}: ${l.texto.length > 400 ? l.texto.slice(0, 400) + '…' : l.texto}`;
        v.appendChild(q);
      });
    }

    const lista = $('anonDocs');
    lista.textContent = '';
    docs.forEach((d, i) => {
      const li = document.createElement('li');
      const s = document.createElement('span');
      s.textContent = `${i + 1}. ${d.tipo}${d.numero ? ' nº ' + d.numero : ''}`
        + (d.itens ? ` · ${d.itens} item(ns)` : '')
        + (d.emit ? ` · emit. ${d.emit}` : '') + (d.dest ? ` → dest. ${d.dest}` : '');
      const b = document.createElement('button');
      b.className = 'btn mini'; b.type = 'button'; b.textContent = 'XML';
      b.title = 'Baixar o XML anonimizado';
      b.addEventListener('click', () => baixar(new XMLSerializer().serializeToString(d.doc),
        `doc${String(i + 1).padStart(2, '0')}_${d.tipo}_anon.xml`, 'application/xml'));
      li.append(s, b);
      lista.appendChild(li);
    });
    $('anonResumo').textContent = `${docs.length} documento(s) no lote`;
  }

  function renderTabela() {
    const corpo = $('anonTabCorpo');
    corpo.textContent = '';
    const ent = Object.entries(M.rev);
    $('anonTabN').textContent = ent.length;
    ent.forEach(([tok, real]) => {
      const tr = document.createElement('tr');
      const a = document.createElement('td'), b = document.createElement('td');
      a.textContent = tok; b.textContent = real;
      tr.append(a, b); corpo.appendChild(tr);
    });
  }

  function baixar(conteudo, nome, tipo) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo + ';charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function podeSair() {
    if (!resultado) return false;
    if (!resultado.verif.bloqueios.length) return true;
    return confirm('A verificação encontrou possíveis dados identificadores na saída (veja a lista em vermelho).\n\nCopiar mesmo assim?');
  }

  async function adicionarArquivos(files) {
    for (const f of files) lote.push(await f.text());
    processarLote();
    toast(`${files.length} XML(s) adicionado(s) ao lote.`);
  }

  function trocarAba(aba) {
    const anon = aba === 'anon';
    $('abaChaves').hidden = anon;
    $('abaAnon').hidden = !anon;
    $('tabChaves').setAttribute('aria-selected', String(!anon));
    $('tabAnon').setAttribute('aria-selected', String(anon));
    document.body.classList.toggle('aba-anon', anon);
    try { localStorage.setItem('chave-dfe:aba', aba); } catch { /* ignora */ }
  }

  function init() {
    $('tabChaves').addEventListener('click', () => trocarAba('chaves'));
    $('tabAnon').addEventListener('click', () => trocarAba('anon'));
    try { if (localStorage.getItem('chave-dfe:aba') === 'anon') trocarAba('anon'); } catch { /* ignora */ }

    $('anonArquivos').addEventListener('change', (e) => { adicionarArquivos([...e.target.files]); e.target.value = ''; });
    $('anonForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const t = $('anonTexto').value.trim();
      if (!t) return;
      if (!t.startsWith('<')) { toast('Cole o conteúdo XML (começa com "<").'); return; }
      lote.push(t);
      $('anonTexto').value = '';
      processarLote();
    });
    $('optTextoLivre').addEventListener('change', processarLote);
    $('optNumero').addEventListener('change', processarLote);
    $('anonNovoLote').addEventListener('click', () => {
      lote = []; resultado = null; $('anonResultado').hidden = true; $('anonResumo').textContent = '';
      toast('Lote esvaziado. A tabela de-para foi mantida.');
    });
    $('anonCopiar').addEventListener('click', () => { if (podeSair()) copiar(resultado.texto, 'Copiado. Cole no ChatGPT.'); });
    $('anonBaixarJson').addEventListener('click', () => {
      if (podeSair()) baixar(resultado.texto, `lote_anon_${new Date().toISOString().slice(0, 10)}.txt`, 'text/plain');
    });
    $('anonExportar').addEventListener('click', () => {
      const linhas = Object.entries(M.rev).map(([t, r]) => `"${t}";"${String(r).replace(/"/g, '""')}"`);
      baixar('﻿marcador;valor_real\r\n' + linhas.join('\r\n'), 'tabela_de_para.csv', 'text/csv');
    });
    $('anonZerar').addEventListener('click', () => {
      if (!confirm('Apagar a tabela de-para deste aparelho?\n\nRespostas antigas da IA não poderão mais ser restauradas.')) return;
      M = { fwd: {}, rev: {}, cont: {} }; salvarMapa(); renderTabela();
      if (lote.length) processarLote();
      toast('Tabela apagada.');
    });
    $('revBtn').addEventListener('click', () => {
      const { out, n, desconhecidos } = restaurar($('revEntrada').value);
      const msg = $('revMsg');
      msg.className = 'msg ' + (desconhecidos.length ? 'err' : 'ok');
      msg.textContent = `${n} marcador(es) restaurado(s).`
        + (desconhecidos.length ? ` Não encontrados na tabela: ${desconhecidos.slice(0, 5).join(', ')}` : '');
      $('revSaida').value = out;
      $('revSaida').hidden = false; $('revCopiar').hidden = false;
    });
    $('revCopiar').addEventListener('click', () => copiar($('revSaida').value, 'Texto restaurado copiado.'));
    renderTabela();
  }

  // exposto para testes automatizados
  window.__anon = {
    anonimizar, paraJson, verificar, restaurar, cnpjValido, cpfValido, limparTextoLivre,
    get mapa() { return M; }, get resultado() { return resultado; },
  };

  init();
})();
