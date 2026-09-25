/* DF-e Offline — leitor de chave de acesso. Processamento 100% local (sem rede).
 * Leitura: BarcodeDetector nativo (se houver) → ZXing (WebAssembly) → OCR Tesseract (reserva, só em fotos).
 * Toda chave só é aceita se o dígito verificador (módulo 11) conferir.
 */
'use strict';

const VERSAO = '1.3.0';
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ tabelas
const UF = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI',
  23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES',
  33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF',
};
const MODELO = { 55: 'NF-e', 57: 'CT-e', 58: 'MDF-e', 59: 'CF-e SAT', 65: 'NFC-e', 67: 'CT-e OS' };
const FONTE = { camera: 'câmera', foto: 'foto', ocr: 'OCR', manual: 'digitada', mdfe: 'no MDF-e', xml: 'XML' };

// ------------------------------------------------------------ chave de acesso
function dvMod11(base43) {
  let soma = 0;
  for (let i = 0; i < 43; i++) soma += Number(base43[42 - i]) * (2 + (i % 8));
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

/** Retorna null se válida, ou o motivo da rejeição. */
function motivoInvalida(ch) {
  if (!/^\d{44}$/.test(ch)) return `tem ${ch.replace(/\D/g, '').length} dígitos (esperado 44)`;
  if (!UF[ch.slice(0, 2)]) return `código de UF inexistente (${ch.slice(0, 2)})`;
  if (!MODELO[ch.slice(20, 22)]) return `modelo desconhecido (${ch.slice(20, 22)})`;
  const dv = dvMod11(ch.slice(0, 43));
  if (dv !== Number(ch[43])) return `dígito verificador não confere (lido ${ch[43]}, calculado ${dv}) — algum dígito está errado`;
  return null;
}
const chaveValida = (ch) => motivoInvalida(ch) === null;

function fmtCnpj(c) {
  // CNPJ numérico; o alfanumérico ainda não aparece na chave de 44 dígitos numéricos
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
function decompor(ch) {
  const doc = ch.slice(6, 20);
  return {
    chave: ch,
    uf: UF[ch.slice(0, 2)],
    aamm: `${ch.slice(4, 6)}/20${ch.slice(2, 4)}`,
    // CPF de emitente (ex.: produtor rural) vem com 000 à esquerda
    emitente: doc.startsWith('000') && !/^0{14}$/.test(doc) ? `CPF ${doc.slice(3)}` : fmtCnpj(doc),
    modelo: MODELO[ch.slice(20, 22)],
    serie: String(Number(ch.slice(22, 25))),
    numero: String(Number(ch.slice(25, 34))),
    tpEmis: ch[34],
  };
}
const agrupar = (ch) => ch.replace(/(\d{4})(?=\d)/g, '$1 ');

/** Procura chaves em qualquer texto (conteúdo de código de barras, QR, OCR, XML colado). */
function chavesNoTexto(txt) {
  const achadas = new Set();
  if (!txt) return achadas;
  // QR Code: ...?p=<chave>|...  ou  chNFe=/chMDFe=/chCTe=<chave>
  for (const m of txt.matchAll(/(?:ch[A-Za-z]*=|[?&]p=)(\d{44})/g)) achadas.add(m[1]);
  // 44 dígitos seguidos
  for (const m of txt.matchAll(/(?<!\d)\d{44}(?!\d)/g)) achadas.add(m[0]);
  // 11 blocos de 4 separados por espaço/ponto (como impresso no DANFE)
  for (const m of txt.matchAll(/(?<!\d)(?:\d{4}[ .]?){10}\d{4}(?!\d)/g)) achadas.add(m[0].replace(/\D/g, ''));
  return achadas;
}

// ------------------------------------------------------------------ estado
const CHAVE_STORAGE = 'chave-dfe:lista:v1';
let itens = []; // {chave, fontes:[], consultada:bool, arquivo, ts}

function carregar() {
  try {
    const raw = localStorage.getItem(CHAVE_STORAGE);
    if (raw) itens = JSON.parse(raw).filter((i) => chaveValida(i.chave));
  } catch { itens = []; }
}
function salvar() {
  try { localStorage.setItem(CHAVE_STORAGE, JSON.stringify(itens)); } catch { /* armazenamento indisponível */ }
}

/** Adiciona chave. Retorna 'nova' | 'dup' (já existia; fonte acrescentada). */
function adicionar(ch, fonte, arquivo) {
  const ex = itens.find((i) => i.chave === ch);
  if (ex) {
    if (!ex.fontes.includes(fonte)) ex.fontes.push(fonte);
    if (arquivo && !ex.arquivo) ex.arquivo = arquivo;
    return 'dup';
  }
  itens.unshift({ chave: ch, fontes: [fonte], consultada: false, arquivo: arquivo || '', ts: Date.now() });
  return 'nova';
}

// ------------------------------------------------------------------ leitura
let zxingPronto = null;
function prepararZxing() {
  if (!zxingPronto) {
    zxingPronto = (async () => {
      if (!window.ZXingWASM) throw new Error('ZXing não carregou');
      await ZXingWASM.prepareZXingModule({
        overrides: { locateFile: (p, prefix) => (p.endsWith('.wasm') ? new URL('vendor/zxing/' + p, location.href).href : prefix + p) },
        fireImmediately: true,
      });
      return true;
    })();
  }
  return zxingPronto;
}

let detectorNativo = null;
async function prepararNativo() {
  try {
    if (!('BarcodeDetector' in window)) return;
    const fmts = await BarcodeDetector.getSupportedFormats();
    const quero = ['code_128', 'qr_code'].filter((f) => fmts.includes(f));
    if (quero.length) detectorNativo = new BarcodeDetector({ formats: quero });
  } catch { detectorNativo = null; }
}

const OPC_ZXING = {
  formats: ['Code128', 'QRCode'], tryHarder: true, tryRotate: true, tryInvert: false,
  tryDownscale: true, maxNumberOfSymbols: 8,
};

/** Lê códigos de um canvas. Retorna Set de chaves válidas. */
async function lerCanvas(cv, rapido = false) {
  const ok = new Set();
  const juntar = (txt) => chavesNoTexto(txt).forEach((c) => chaveValida(c) && ok.add(c));
  if (detectorNativo) {
    try { (await detectorNativo.detect(cv)).forEach((b) => juntar(b.rawValue)); } catch { /* segue p/ ZXing */ }
    if (ok.size) return ok;
  }
  await prepararZxing();
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const res = await ZXingWASM.readBarcodes(img, rapido ? { ...OPC_ZXING, tryHarder: false } : OPC_ZXING);
  res.forEach((r) => juntar(r.text));
  return ok;
}

function desenhar(fonte, w, h, angulo = 0) {
  const cv = document.createElement('canvas');
  const rad = (angulo * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  cv.width = Math.round(w * cos + h * sin);
  cv.height = Math.round(w * sin + h * cos);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(fonte, -w / 2, -h / 2, w, h);
  return cv;
}

const ANGULOS = [0, 8, -8, 15, -15, 22, -22, 30, -30, 38, -38];

async function lerArquivoImagem(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }
  const esc = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * esc), h = Math.round(bmp.height * esc);
  for (const ang of ANGULOS) {
    const achadas = await lerCanvas(desenhar(bmp, w, h, ang));
    if (achadas.size) { bmp.close?.(); return { chaves: achadas, via: 'foto' }; }
  }
  // reserva: OCR do número impresso
  const cvOcr = desenhar(bmp, w, h, 0);
  bmp.close?.();
  const txt = await ocr(cvOcr);
  const achadas = new Set([...chavesNoTexto(txt)].filter(chaveValida));
  return { chaves: achadas, via: 'ocr' };
}

// -------------------------------------------------------------------- OCR
let workerOcr = null;
async function ocr(canvas) {
  mostrarProgresso(true, 'Código de barras ilegível — tentando OCR do número impresso…');
  try {
    if (!workerOcr) {
      if (!window.Tesseract) await carregarScript('vendor/tesseract/tesseract.min.js');
      const base = new URL('vendor/tesseract/', location.href).href;
      workerOcr = await Tesseract.createWorker('eng', 1, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'core/',
        langPath: base + 'lang',
        workerBlobURL: false,
        gzip: true,
      });
      await workerOcr.setParameters({ tessedit_char_whitelist: '0123456789 ', tessedit_pageseg_mode: '6' });
    }
    const { data } = await workerOcr.recognize(canvas);
    return data.text || '';
  } catch (e) {
    console.warn('OCR falhou', e);
    return '';
  }
}
function carregarScript(src) {
  return new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => erro(new Error('falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}

// ------------------------------------------------------------------ XML
function lerXml(texto, nomeArquivo) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  const tag = (n) => [...doc.getElementsByTagNameNS('*', n)].map((e) => e.textContent.trim());
  const idDe = (n) => [...doc.getElementsByTagNameNS('*', n)].map((e) => (e.getAttribute('Id') || '').replace(/\D/g, ''));
  const ehMdfe = doc.getElementsByTagNameNS('*', 'infMDFe').length > 0;
  let novas = 0, dups = 0, invalidas = 0;
  const add = (ch, fonte) => {
    if (!chaveValida(ch)) { invalidas++; return; }
    adicionar(ch, fonte, nomeArquivo) === 'nova' ? novas++ : dups++;
  };
  if (ehMdfe) {
    idDe('infMDFe').forEach((ch) => add(ch, 'xml'));
    [...tag('chNFe'), ...tag('chCTe'), ...tag('chMDFe').filter(Boolean)]
      .filter((ch) => !idDe('infMDFe').includes(ch))
      .forEach((ch) => add(ch, 'mdfe'));
  } else {
    // Set: a mesma chave aparece em infNFe/@Id e em protNFe/chNFe — conta uma vez só
    new Set([...idDe('infNFe'), ...idDe('infCte'), ...tag('chNFe'), ...tag('chCTe')]).forEach((ch) => ch && add(ch, 'xml'));
  }
  return { ehMdfe, novas, dups, invalidas };
}

// ------------------------------------------------------------ câmera ao vivo
let stream = null, laco = null, pausaAte = 0, lendoQuadro = false;

async function abrirCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Este navegador não dá acesso à câmera aqui. Use "Fotos".');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Permissão da câmera negada.' : 'Não foi possível abrir a câmera.');
    return;
  }
  const v = $('video');
  v.srcObject = stream;
  await v.play();
  $('painelCamera').hidden = false;
  $('btnCamera').disabled = true;
  const trilha = stream.getVideoTracks()[0];
  const cap = trilha.getCapabilities ? trilha.getCapabilities() : {};
  $('btnTorch').hidden = !cap.torch;
  prepararZxing();
  laco = setInterval(lerQuadro, 220);
  $('painelCamera').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fecharCamera() {
  clearInterval(laco); laco = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $('painelCamera').hidden = true;
  $('btnCamera').disabled = false;
}

let torchLigada = false;
async function alternarTorch() {
  const t = stream?.getVideoTracks()[0];
  if (!t) return;
  torchLigada = !torchLigada;
  try { await t.applyConstraints({ advanced: [{ torch: torchLigada }] }); } catch { torchLigada = false; }
}

async function lerQuadro() {
  const v = $('video');
  if (lendoQuadro || !v.videoWidth || Date.now() < pausaAte) return;
  lendoQuadro = true;
  try {
    // recorta a faixa central (onde está a mira) — mais rápido e menos ruído
    const cv = $('canvas');
    const sx = 0, sy = Math.round(v.videoHeight * 0.2), sw = v.videoWidth, sh = Math.round(v.videoHeight * 0.6);
    cv.width = sw; cv.height = sh;
    cv.getContext('2d', { willReadFrequently: true }).drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
    const achadas = await lerCanvas(cv, true);
    for (const ch of achadas) {
      const r = adicionar(ch, 'camera');
      const d = decompor(ch);
      flash(`${r === 'dup' ? 'Já na lista: ' : '✓ '}${d.modelo} nº ${d.numero} · ${d.uf}`, r === 'dup');
      sinal(r === 'dup');
      pausaAte = Date.now() + 1500;
    }
    if (achadas.size) { salvar(); render(); }
  } catch (e) { console.warn(e); }
  finally { lendoQuadro = false; }
}

function flash(msg, dup) {
  const f = $('flashLeitura');
  f.textContent = msg;
  f.classList.toggle('dup', !!dup);
  f.classList.add('on');
  clearTimeout(flash.t);
  flash.t = setTimeout(() => f.classList.remove('on'), 1600);
}

let audio;
function sinal(dup) {
  try { navigator.vibrate?.(dup ? [40, 60, 40] : 80); } catch { /* sem vibração */ }
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = dup ? 440 : 1046;
    g.gain.value = 0.08;
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.09);
  } catch { /* sem áudio */ }
}

// --------------------------------------------------------------- fotos/XML
async function processarFotos(files) {
  const lista = [...files];
  if (!lista.length) return;
  let novas = 0, dups = 0;
  const falhas = [];
  mostrarProgresso(true, '', 0);
  for (let i = 0; i < lista.length; i++) {
    const f = lista[i];
    mostrarProgresso(true, `Lendo ${i + 1} de ${lista.length}: ${f.name}`, i / lista.length);
    try {
      const { chaves, via } = await lerArquivoImagem(f);
      if (!chaves.size) falhas.push(f.name);
      chaves.forEach((ch) => (adicionar(ch, via === 'ocr' ? 'ocr' : 'foto', f.name) === 'nova' ? novas++ : dups++));
    } catch (e) {
      console.warn(e);
      falhas.push(f.name);
    }
    salvar(); render();
  }
  mostrarProgresso(false);
  let msg = `${novas} nova(s)`;
  if (dups) msg += `, ${dups} já na lista`;
  if (falhas.length) msg += `. Sem leitura: ${falhas.length} — refaça a foto com o código de barras nítido e enquadrado`;
  toast(msg, 5000);
}

async function processarXmls(files) {
  let n = 0, dups = 0, inval = 0, mdfe = 0, ruins = [];
  for (const f of files) {
    const r = lerXml(await f.text(), f.name);
    if (!r) { ruins.push(f.name); continue; }
    n += r.novas; dups += r.dups; inval += r.invalidas; if (r.ehMdfe) mdfe++;
  }
  salvar(); render();
  let msg = `${n} chave(s) nova(s) importada(s)`;
  if (mdfe) msg += ` de ${mdfe} MDF-e`;
  if (dups) msg += `, ${dups} já na lista`;
  if (inval) msg += `, ${inval} inválida(s) ignorada(s)`;
  if (ruins.length) msg += `. XML ilegível: ${ruins.join(', ')}`;
  toast(msg, 5000);
}

function processarManual(ev) {
  ev.preventDefault();
  const txt = $('txtManual').value.trim();
  const msg = $('msgManual');
  msg.className = 'msg';
  if (!txt) return;
  if (txt.startsWith('<')) {
    const r = lerXml(txt, 'XML colado');
    if (!r) { msg.textContent = 'XML inválido.'; msg.classList.add('err'); return; }
    salvar(); render();
    msg.textContent = `${r.novas} nova(s) do XML${r.ehMdfe ? ' do MDF-e' : ''}${r.dups ? `, ${r.dups} já na lista` : ''}.`;
    msg.classList.add('ok');
    $('txtManual').value = '';
    return;
  }
  let candidatas = [...chavesNoTexto(txt)];
  if (!candidatas.length) candidatas = [txt.replace(/\D/g, '')];
  const erros = [];
  let novas = 0, dups = 0;
  for (const ch of candidatas) {
    const m = motivoInvalida(ch);
    if (m) { erros.push(m); continue; }
    adicionar(ch, 'manual') === 'nova' ? novas++ : dups++;
  }
  salvar(); render();
  if (erros.length) {
    msg.textContent = `Chave inválida: ${erros[0]}.`;
    msg.classList.add('err');
  } else {
    msg.textContent = `${novas} adicionada(s)${dups ? `, ${dups} já na lista` : ''}.`;
    msg.classList.add('ok');
    $('txtManual').value = '';
  }
}

// ------------------------------------------------------------------ UI
function render() {
  const ul = $('lista');
  ul.textContent = '';
  const temMdfe = itens.some((i) => i.fontes.includes('mdfe'));
  const apresentada = (i) => i.fontes.some((f) => ['camera', 'foto', 'ocr', 'manual'].includes(f));

  for (const it of itens) {
    const d = decompor(it.chave);
    const li = document.createElement('li');
    li.className = 'item' + (it.consultada ? ' feita' : '');

    const top = document.createElement('div');
    top.className = 'item-top';
    top.innerHTML = `<span class="tag"></span><span class="num"></span><span class="meta"></span>`;
    top.children[0].textContent = d.modelo;
    top.children[1].textContent = `nº ${d.numero} · série ${d.serie}`;
    top.children[2].textContent = `${d.uf} · ${d.aamm} · ${d.emitente}`;
    if (temMdfe && d.modelo !== 'MDF-e') {
      const c = document.createElement('span');
      const noM = it.fontes.includes('mdfe'), apr = apresentada(it);
      c.className = 'chip ' + (noM && apr ? 'ok' : noM ? 'warn' : 'err');
      c.textContent = noM && apr ? 'confere c/ MDF-e' : noM ? 'no MDF-e, não apresentada' : 'fora do MDF-e';
      top.appendChild(c);
    }

    const btnCh = document.createElement('button');
    btnCh.className = 'chave';
    btnCh.type = 'button';
    btnCh.title = 'Toque para copiar';
    btnCh.textContent = agrupar(it.chave);
    btnCh.addEventListener('click', () => copiar(it.chave, `Chave copiada (${d.modelo} nº ${d.numero})`));

    const bot = document.createElement('div');
    bot.className = 'item-bot';
    const origem = document.createElement('span');
    origem.textContent = it.fontes.map((f) => FONTE[f] || f).join(' + ') + (it.arquivo ? ` · ${it.arquivo}` : '');
    const esp = document.createElement('span'); esp.className = 'esp';
    const lbl = document.createElement('label');
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.checked = it.consultada;
    chk.addEventListener('change', () => { it.consultada = chk.checked; salvar(); render(); });
    lbl.append(chk, 'consultada');
    const rm = document.createElement('button');
    rm.className = 'btn mini perigo'; rm.type = 'button'; rm.textContent = 'Remover';
    rm.addEventListener('click', () => {
      const idx = itens.indexOf(it);
      itens.splice(idx, 1); salvar(); render();
      toast('Removida.', 4000, 'Desfazer', () => { itens.splice(idx, 0, it); salvar(); render(); });
    });
    bot.append(origem, esp, lbl, rm);

    li.append(top, btnCh, bot);
    ul.appendChild(li);
  }

  $('vazio').hidden = itens.length > 0;
  $('rodape').hidden = itens.length === 0;

  // resumo
  const r = $('resumo');
  r.textContent = '';
  if (!itens.length) return;
  const chip = (txt, cls = '') => { const s = document.createElement('span'); s.className = 'chip ' + cls; s.textContent = txt; r.appendChild(s); };
  const porModelo = {};
  itens.forEach((i) => { const m = decompor(i.chave).modelo; porModelo[m] = (porModelo[m] || 0) + 1; });
  chip(`${itens.length} chave(s)`);
  Object.entries(porModelo).forEach(([m, n]) => chip(`${m}: ${n}`));
  const consultadas = itens.filter((i) => i.consultada).length;
  if (consultadas) chip(`${consultadas} consultada(s)`, 'ok');
  if (temMdfe) {
    const docs = itens.filter((i) => decompor(i.chave).modelo !== 'MDF-e');
    const naoApr = docs.filter((i) => i.fontes.includes('mdfe') && !apresentada(i)).length;
    const fora = docs.filter((i) => !i.fontes.includes('mdfe')).length;
    if (naoApr) chip(`${naoApr} do MDF-e não apresentada(s)`, 'warn');
    if (fora) chip(`${fora} fora do MDF-e`, 'err');
    if (!naoApr && !fora) chip('Tudo confere com o MDF-e', 'ok');
  }
}

async function copiar(texto, msg) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* sem cópia */ }
    ta.remove();
  }
  toast(msg);
}

function csv() {
  const cab = ['chave', 'modelo', 'uf', 'emissao', 'emitente', 'serie', 'numero', 'tp_emis', 'origem', 'arquivo', 'consultada'];
  const linhas = itens.map((i) => {
    const d = decompor(i.chave);
    // chave com prefixo ' para o Excel não converter em notação científica
    return [`'${i.chave}`, d.modelo, d.uf, d.aamm, d.emitente, d.serie, d.numero, d.tpEmis,
      i.fontes.map((f) => FONTE[f] || f).join(' + '), i.arquivo, i.consultada ? 'sim' : 'não'];
  });
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return '﻿' + [cab, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n');
}

function baixarCsv() {
  const blob = new Blob([csv()], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `chaves_${d.toISOString().slice(0, 10)}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function compartilhar() {
  const texto = itens.map((i) => i.chave).join('\n');
  try { await navigator.share({ title: 'Chaves de acesso', text: texto }); }
  catch (e) { if (e.name !== 'AbortError') copiar(texto, 'Lista copiada.'); }
}

function limpar() {
  if (!itens.length) return;
  if (!confirm(`Apagar as ${itens.length} chave(s) deste aparelho?`)) return;
  const backup = itens;
  itens = []; salvar(); render();
  toast('Lista apagada.', 5000, 'Desfazer', () => { itens = backup; salvar(); render(); });
}

function toast(msg, ms = 2500, acao, fn) {
  const t = $('toast');
  t.textContent = msg;
  if (acao) {
    const b = document.createElement('button');
    b.textContent = acao;
    b.addEventListener('click', () => { fn(); t.classList.remove('on'); });
    t.appendChild(b);
  }
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), ms);
}

function mostrarProgresso(on, txt = '', frac) {
  $('progresso').hidden = !on;
  if (txt) $('progressoTxt').textContent = txt;
  if (frac !== undefined) $('barraIn').style.width = `${Math.round(frac * 100)}%`;
}

// --------------------------------------------------------------- service worker
function registrarSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nova versão disponível.', 15000, 'Atualizar', () => nw.postMessage('pular-espera'));
        }
      });
    });
  }).catch((e) => console.warn('SW', e));
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recarregou) { recarregou = true; location.reload(); } });
}

function atualizarStatus() {
  const partes = [`v${VERSAO}`, navigator.onLine ? 'online' : 'offline'];
  partes.push(detectorNativo ? 'leitor nativo + ZXing' : 'leitor ZXing');
  $('status').textContent = partes.join(' · ');
}

// ------------------------------------------------------------------ init
async function init() {
  carregar();
  render();
  $('btnCamera').addEventListener('click', abrirCamera);
  $('btnFecharCamera').addEventListener('click', fecharCamera);
  $('btnTorch').addEventListener('click', alternarTorch);
  $('inpFotos').addEventListener('change', (e) => { processarFotos(e.target.files); e.target.value = ''; });
  $('inpXml').addEventListener('change', (e) => { processarXmls([...e.target.files]); e.target.value = ''; });
  $('formManual').addEventListener('submit', processarManual);
  $('txtManual').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) processarManual(e); });
  $('btnCopiarTodas').addEventListener('click', () => copiar(itens.map((i) => i.chave).join('\n'), `${itens.length} chave(s) copiada(s), uma por linha.`));
  $('btnCsv').addEventListener('click', baixarCsv);
  $('btnLimpar').addEventListener('click', limpar);
  if (navigator.share) { $('btnCompartilhar').hidden = false; $('btnCompartilhar').addEventListener('click', compartilhar); }
  document.addEventListener('visibilitychange', () => { if (document.hidden && stream) fecharCamera(); });
  window.addEventListener('online', atualizarStatus);
  window.addEventListener('offline', atualizarStatus);
  await prepararNativo();
  atualizarStatus();
  registrarSW();
  prepararZxing().catch((e) => toast('Falha ao carregar o leitor: ' + e.message, 6000));
}

// exposto para testes automatizados
window.__chaveDFe = { dvMod11, motivoInvalida, chavesNoTexto, decompor, lerXml, lerArquivoImagem, get itens() { return itens; } };

init();
