# Leitor de Chave DF-e (PWA)

Lê a chave de acesso (44 dígitos) de DANFE, DAMDFE, DACTE e DANFE-NFC-e pela **câmera** ou por **fotos da galeria**, valida o **dígito verificador** e monta uma lista para consulta (ex.: e-Sefa › Consulta DF-e › Consulta por Chave).

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

## Publicar no GitHub Pages (gratuito)

1. Crie um repositório no GitHub (ex.: `chave-dfe`) e envie **todo o conteúdo desta pasta** para a raiz.
2. Vá em **Settings › Pages › Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, pasta `/ (root)`.
3. Em cerca de 1 minuto, o endereço fica disponível: `https://SEU-USUARIO.github.io/chave-dfe/`.
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
2. Aumente a versão em **`sw.js`** (`const VERSAO = 'chave-dfe-v1.0.1'`) e em **`app.js`** (`const VERSAO`).
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
```

## Limitações conhecidas

- O OCR é só uma reserva e pode falhar em fotos ruins. A validação do DV impede que uma chave errada entre na lista, mas não resolve uma foto ilegível.
- A lista fica salva **no navegador do aparelho**. Use "Limpar" ao final da ação fiscal. Se limpar os dados do navegador, a lista se perde.
- A lanterna depende do navegador. Quando não há suporte (comum no iPhone), o botão não aparece.

Ferramenta auxiliar, não oficial. Confira sempre a chave na consulta oficial.
