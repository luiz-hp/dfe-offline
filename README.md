# DF-e Offline (PWA)

Duas ferramentas num só app, sem enviar nada a servidor: **(1)** lê a chave de acesso (44 dígitos) de DANFE, DAMDFE, DACTE e DANFE-NFC-e pela **câmera** ou por **fotos da galeria**, valida o **dígito verificador** e monta uma lista para consulta (ex.: e-Sefa › Consulta DF-e › Consulta por Chave); **(2)** pseudonimiza XMLs de NF-e, MDF-e e CT-e para análise em IA e restaura a resposta.

**Privacidade:** todo o processamento acontece no aparelho. Não há servidor, analytics nem chamadas a domínios externos. A política de segurança (CSP) do `index.html` bloqueia qualquer conexão fora do próprio site.

## Funções

| Função | Detalhe |
|---|---|
| Câmera ao vivo | Lê o código de barras CODE-128 e o QR Code, com bipe e vibração a cada leitura. Tem lanterna quando o aparelho suporta |
| Fotos | Várias de uma vez. Corrige a inclinação (até cerca de 38°) e faz OCR do número impresso quando o código de barras está ilegível |
| Digitar ou colar | Aceita a chave com ou sem espaços, várias chaves de uma vez ou o XML colado. Explica o motivo quando a chave é inválida |
| XML | Importa NF-e, CT-e ou MDF-e. No MDF-e, extrai as chaves das NF-e e CT-e vinculadas |
| Conferência com o MDF-e | Marca cada nota como "confere", "no MDF-e, não apresentada" ou "fora do MDF-e" |
| Lista | Toque na chave para copiar. Marque "consultada", exporte em CSV (abre no Excel) ou copie todas |
| Offline | Funciona sem internet depois do primeiro acesso. O OCR (~15 MB) é baixado só no primeiro uso |
| **Anonimizar XML** (aba) | Pseudonimiza XMLs de NF-e, NFC-e, MDF-e e CT-e para análise em IA: CNPJ, CPF, nomes, IE, placa, RNTRC, RENAVAM, chave, protocolo, apólice e similares viram marcadores consistentes em todo o lote. Endereço, telefone e e-mail são suprimidos. Assinatura digital, QR Code e responsável técnico são removidos. Textos livres são limpos. Uma verificação final procura vazamentos antes de copiar |
| **DANFE, DAMDFE e DACTE pseudonimizados** | Para NF-e/NFC-e, MDF-e e CT-e, gera um PDF no leiaute do documento auxiliar correspondente a partir do XML já anonimizado: só marcadores e dados fiscais, sem código de barras nem QR Code, com faixa e marca d'água "SEM VALOR FISCAL" |
| Restaurar | Troca os marcadores da resposta da IA pelos dados reais, usando a tabela de-para guardada só no aparelho |

## Publicar no GitHub Pages (gratuito)

1. Crie um repositório no GitHub (ex.: `dfe-offline`) e envie **todo o conteúdo desta pasta** para a raiz.
2. Vá em **Settings › Pages › Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, pasta `/ (root)`.
3. Em cerca de 1 minuto, o endereço fica disponível: `https://luiz-hp.github.io/dfe-offline/`.
4. Compartilhe esse link com os colegas.

A câmera só funciona em **HTTPS**, e o GitHub Pages já usa HTTPS. Para testar no computador, rode `python -m http.server 8000` nesta pasta e abra `http://localhost:8000`.

## Instalar no aparelho

| Aparelho | Como instalar |
|---|---|
| Android (Chrome) | Abra o link e toque em **Instalar app** (ou ⋮ › *Adicionar à tela inicial*) |
| iPhone (Safari) | Abra o link, toque em **Compartilhar** › *Adicionar à Tela de Início* |
| PC (Chrome/Edge) | Clique no ícone de instalar na barra de endereço |

## Publicar uma nova versão

1. Altere o código.
2. Aumente a versão em **`sw.js`** (`const VERSAO = 'chave-dfe-v1.1.1'`; o prefixo `chave-dfe-` é interno e não deve mudar) e em **`app.js`** (`const VERSAO`).
3. Envie ao GitHub. Os aparelhos mostram o aviso "Nova versão disponível › Atualizar".

Se você não mudar a versão no `sw.js`, os aparelhos continuam usando a versão antiga guardada em cache.

## Estrutura

```
index.html            interface
app.css               estilos (claro/escuro automático)
app.js                lógica: leitura, validação, lista, CSV, MDF-e
sw.js                 service worker (offline)
manifest.webmanifest  instalação como app
icons/                ícones
vendor/zxing/         leitor de códigos (zxing-wasm, MIT)
vendor/tesseract/     OCR (tesseract.js, Apache-2.0; dados eng, MIT)
vendor/jspdf/         geração do DANFE em PDF (jsPDF e jspdf-autotable, MIT)
anon.js               anonimizador de XML
danfe.js              DANFE, DAMDFE e DACTE pseudonimizados
```

## Limitações conhecidas

- O OCR é só uma reserva e pode falhar em fotos ruins. A validação do DV impede que uma chave errada entre na lista, mas não resolve uma foto ilegível.
- A lista fica salva **no navegador do aparelho**. Use "Limpar" ao final da ação fiscal. Se limpar os dados do navegador, a lista se perde.
- A lanterna depende do navegador. Quando não há suporte (comum no iPhone), o botão não aparece.

Ferramenta auxiliar, não oficial. Confira sempre a chave na consulta oficial.
