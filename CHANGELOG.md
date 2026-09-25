# Histórico de versões

## 1.3.0
- **DAMDFE** e **DACTE** pseudonimizados em PDF (botões por documento na aba Anonimizar): percurso, veículos, condutores, vale-pedágio/CIOT, contratantes, documentos vinculados e seguro (MDF-e); participantes, tomador, carga, componentes do frete, ICMS e documentos originários (CT-e).
- Anonimizador: nomes de componentes do frete do CT-e ("FRETE PESO", "PEDÁGIO") deixam de ser tratados como nomes de pessoas; CNPJ/CPF em qualquer variação de campo (CNPJForn, CNPJPg…); número da compra do vale-pedágio e número do lacre passam a ser marcadores.
- Texto livre: nomes próprios após expressões de contexto ("falar com", "motorista", "a/c", "Sr./Sra.", "responsável"…) viram marcador; siglas (CPF, RG, CNH…) encerram o nome.
- Consistência: a 1ª passada registra só campos estruturados e o marcador da entidade ([PESSOA_…]/[EMPRESA_…]) prevalece sobre o genérico ([NOME_…]).

## 1.2.0
- Botão **DANFE** na aba Anonimizar: gera, no aparelho, um PDF no leiaute do DANFE a partir do XML já pseudonimizado (NF-e e NFC-e), com várias folhas quando necessário, sem código de barras/QR Code e com marca d'água "SEM VALOR FISCAL".

## 1.1.0
- App renomeado para **DF-e Offline**.
- Nova aba **Anonimizar XML**: pseudonimização local de NF-e, NFC-e, MDF-e e CT-e com marcadores consistentes em todo o lote, verificação automática de vazamentos, prévia dos textos livres, tabela de-para local e restauração da resposta da IA.

## 1.0.1
- Corrigida a contagem de chaves ao importar XML de NF-e (a mesma chave era contada duas vezes).

## 1.0.0
- Leitura da chave de acesso por câmera, foto (código de barras, QR Code e OCR) ou digitação, com validação do dígito verificador.
- Importação de XML e conferência das notas com o MDF-e.
- Lista com cópia, marcação de consultadas e exportação em CSV; funcionamento offline.
