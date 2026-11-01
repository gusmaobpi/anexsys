# Decisões do André

**Atualizado em:** 01/11/2026
**Substitui:** as regras de negócio da documentação antiga (`docs/arquivo/`) nos pontos em que elas divergem deste documento.
**Valor:** este é o documento **oficial** das regras de negócio. Quando outro documento discordar, vale este.

Fonte: respostas do André ao questionário e às perguntas complementares (rodadas 1 a 3), em 05/10/2026. Onde a resposta é "?" ou ausente vale a opção recomendada, marcada como "assumido, a confirmar". Os itens marcados com **[EM ABERTO]** contradiziam outra resposta ou o plano; os conflitos foram **resolvidos nas seções 10 e 11**.

Os números citados em "resposta N" ou "pergunta N" referem-se ao questionário respondido em 05/10/2026, que não faz parte deste conjunto.

## 1. Decisões gerais

| # | Decisão |
|---|---------|
| 1 | Ambiente de testes: serviço em nuvem simples e barato, montado por nós (A). |
| 2 | Idioma: tudo em português do Brasil (A). |
| 3 | Fonte oficial: conjunto novo e único de documentos em português; antigos para pasta de arquivo somente leitura (A). |
| 4 | Não há dado real a preservar; tudo é teste (A). |
| 5 | Nomes dos níveis: Conta / Empresa / Filial (A). |
| 6 | Uma Conta pode ter várias Empresas e cada Empresa várias Filiais (A). |
| 7 | Cliente é da Conta e pode ser atendido em qualquer Empresa ou Filial dela (A). Entre Contas nunca compartilha. |
| 8 | Permissão vem só de papel + escopo (Empresa/Filial). Comunidades congeladas (A). |
| 13 | Piloto completo (B): só entra em produção com financeiro, portal e concierge prontos. Ele é o homologador de tudo e não tem pressa de ajustes. |
| 14 | Produção em março de 2027; dedicação de 4 a 8 horas por dia, bem intenso. |
| 17 | Usuário novo sem nenhuma Filial até o administrador marcar (A). |
| 18 | Papéis iniciais: recepção, atendente/medidor, produção, qualidade, gerente (A). |
| 19 | Só o André cria Contas por ora (A). |
| 20 | Login por e-mail e senha com recuperação por e-mail (A). |
| 21 | Senhas dos guias são só de teste (A). |
| 24 | Peça = uma peça de roupa, com um ou mais serviços dentro (A). |
| 25 | Tabela de serviços com preço fixo e ajuste manual por quem tem permissão (A). |
| 29 | Medida usada fica travada na aprovação da OS (A). |
| 33 | Cliente vê a última fase pública atingida; fases configuráveis por Conta (A, A). |
| 34 | Modo estação: o funcionário escolhe onde está e cada leitura move a peça (B). **[EM ABERTO]** com o fluxo descrito na pergunta 9, em que cada leitura avança sozinha para o próximo status. |
| 40 | Um número de WhatsApp por Conta (A). |
| 42 | Só envia com consentimento registrado (A). Se o cliente não autorizar compartilhar o endereço, ele marca que não concorda e os dados sensíveis são apagados da OS. |
| 44 | Falha de mensagem: lista de falhas para o atendente (A). |
| 46 | Roupa infantil só com responsável cadastrado; fotos só da peça, nunca da criança. |
| 47 | Ateliê é o controlador e o ANEXSYS o operador (A); guarda de inativos 5 anos (A). Controle de LGPD fica para mais adiante, mas é importante. |
| 48 | Retirada: cliente informa número da OS ou nome e o atendente confere (A). Próxima versão: token enviado por WhatsApp para retirada por terceiros (portador informa número da OS e token). |
| 50 | Saldo em aberto bloqueia a entrega, mas o gerente libera com motivo (B). |
| 51 | Fila de chegada fica para depois (B). |
| 52 | Concierge e reconhecimento facial ficam para versão futura. Ideia: câmera identifica cliente, monta fila por ordem de chegada, abre a porta para cliente conhecido; foto apagada após cadastro ou guardada fora do sistema. |
| 54 | Sistema antigo em paralelo até o André ter confiança (A). |
| 56 | Cobrança do ANEXSYS: quer painel de preços e planos, pagamento mensal por cartão online, pix ou boleto, preço configurável, à vista ou parcelado, contrato de um ano; sem regras rígidas no começo (B). |
| 57 | Segundo tipo de negócio só depois do piloto do ateliê (A). |

## 2. Fluxo de produção descrito pelo André (resposta 9)

1. **Atendimento / OS aberta**: gera a OS; não gera etiqueta nem leitura de QR. A OS é enviada ao cliente por WhatsApp com status **Em aberto (público)**. O cliente recebe um link para acompanhar e para aprovar.
2. **Medição das roupas**: não gera etiqueta, não lê QR, sem WhatsApp. É a etapa que origina a abertura da OS.
3. **Aprovação do cliente**: o status continua Em aberto; a aprovação não é status, é uma **assinatura "concordo com o serviço e preço"**, registrada por escrito.
4. **Sacola física**: a sacola é **só o transporte**. O sistema limita as peças **por versão da OS** (parâmetro da Conta, padrão 5). Cada linha é uma peça. A atendente registra até o limite e aperta **Fechar sacola** (trava; pode **Abrir sacola** se errou). **Salvar** com a sacola fechada imprime a OP. Se ainda houver peças, marca **Abrir nova versão** e **Salvar** abre `AAA000001-1` em outra aba. A última versão pode ter só o que restou (sem mínimo). A sacola vai para a esteira de "a fazer". Quando o técnico lê o QR, o status vai para **Em produção (público)**.
5. Não existe essa etapa (numeração do André).
6. **Acabamento/passadoria**: ao terminar, o técnico lê o QR, leva a sacola para a esteira de finalizadas e o status vai para **Aguardando controle de qualidade (público)**.
7. **Revisão de qualidade**: o revisor tira a sacola da esteira, lê o QR e o status vai para **Controle de qualidade (público)**. Aprova (vai para Pronto para retirada) ou reprova.
8. **Pronto para retirada (público)**: aqui sai a mensagem de WhatsApp. O cliente usa o mesmo link para acompanhar quando quiser, sem o sistema avisar a cada etapa.
9. **Entregue**: lê o QR na retirada, o cliente assina eletronicamente que retirou. Status **Retirado pelo cliente (público)**.

**Resumo das mensagens:** o cliente recebe WhatsApp em apenas duas etapas: registro da OS e Pronto para retirada. Todo o resto ele acompanha pelo link.

### Observações do André
- a) O único status não público é **Reprovado pela qualidade (interno)**: a qualidade lê o QR e muda para Reprovado; só funcionários sabem; a sacola volta para a esteira para refação.
- b) Na entrega, se a OS não estiver paga, mostrar aviso na tela "Falta pagamento". **Não é status**, é só uma questão financeira.
- c) Deve haver **cadastro de status com parâmetros**, configurável, sem engessar o sistema.
- d) **Reconserto**: cliente volta em até 7 dias úteis reclamando (ficou curto ou largo); analisa-se e registra-se **nova OS sem valor financeiro**, vinculada à OS original (rastreabilidade), e é preciso saber **qual técnico fez a primeira vez** para medir eficiência.

### Regras de operação (perguntas 15, 31, 32, 35)
- Cada funcionário tem o leitor de QR no celular, cadastrado, e muda o status seguindo uma **ordem sem pular nem retroagir** (resposta 32: C, fluxo rígido). A reprovação é o único retorno previsto.
- **Quem faz o quê:** costureiras (técnicas) fazem a produção; atendentes fazem medição, revisão e controle de qualidade. Só o papel responsável pela fase avança (resposta 31: B).
- Reprovado: volta para a mesma técnica, se estiver escalada no dia, ou para outra; ao ler o QR a outra técnica **assume a refação**.
- Quando a peça é produzida em tempo diferente, o André controla por **quantidade de peças da OS** (para dimensionar a grade de costureiros e contratar) e por **grau de dificuldade 1, 2, 3, 4** (para definir tempo médio). O fluxo completo da **grade diária** (ativar o técnico do dia, comparecimento, contas a pagar e Pix) está na **seção 13**.
- **Diaristas/terceiros (35 C)**: hoje se identificam anotando dia e hora na OS e em caderno. Querem log próprio (login) como **diário de bordo**, para saber o que produziram e para um **bônus por produtividade**. O diário de bordo deve mostrar a **descrição do serviço** de cada peça, como alternativa ao papel.

### Controle da unidade (pergunta 10)
- **QR por OS** (resposta B), não por peça. Motivo: a costureira não compartilha o serviço; abre uma sacola e termina ela. Mas o sistema deve registrar a **quantidade de peças da OS** para o controle de produção e o **grau de dificuldade (1 a 4)**.
- Isso **contraria a recomendação do plano**, que propunha QR assinado por peça.

### Etiquetas (perguntas 36, 38, 39)
- **Não haverá etiqueta adesiva.** O QR é impresso **grande na Ordem de Produção**, que fica no bolso da sacola (resposta 39: B, sacola).
- Não precisa de impressora de etiqueta; basta impressão comum.
- Celulares: parte dos funcionários tem, parte usa o da loja; sistema misto (Android e iPhone).
- Wi-Fi bom e estável em todo o ateliê (37: A), então o modo offline não é prioridade.
- Perda ou ilegibilidade: reimpressão pelo gerente (38: B), mas o André repete que não há etiqueta.

## 3. Prazos, garantia e fluxos de entrega

- **Prazo Normal**: entrega no **mesmo dia da semana da semana seguinte** (segunda para segunda, terça para terça, etc., inclusive sábado). Em feriado, antecipa ou adia. O sistema **sugere a data**; o **horário padrão é o da gravação da OS**. O atendente pode **alterar os dois**. Na OS, **Situação** é o status; o quadro **Previsão de entrega** é essa sugestão; **Saída** é a retirada real (quando o cliente assina a OP ou o atendente registra Recebido). **Técnico** e **Controle de qualidade** não são obrigatórios na abertura.
- Feriados fechados, cadastrados por Filial (a). Horário de corte (b): A (sim, depois de certa hora; horário não informado). Tipos de entrega (c): A, diferentes. Prazo padrão (d): 7.
- **Tipos de entrega**: Normal (mesmo dia da semana seguinte); **Expresso** (até 2 horas por peça); **Urgente** (2 a 3 dias depois, foge da regra do mesmo dia da semana).
- **Garantia**: 7 dias para reparos (cliente que não provou na hora da retirada pode voltar para refação, como reconserto, contados em dias úteis no texto das observações e "corridos" na resposta 27b). **Garantia de serviço por peça: 90 dias** (descosturou, barra se desfez), negociável no balcão; conta a partir da conclusão da peça (27 c: C).
- Fotos: opcionais, no máximo 3 por peça, uso pouco frequente (28: B).

## 4. Clientes e atendimento

- Cadastro: nome completo obrigatório, **WhatsApp** obrigatório, endereço pela busca do CEP; CPF/CNPJ não obrigatório.
- Busca de cliente **multicritério** em uma só tela: nome, telefone, CPF ou CNPJ.
- Ficha de medidas: não existe hoje; o André estava criando um modelo em lista (linha: Ombro, medida, unidade).

## 5. WhatsApp, e-mail, pagamento

- **WhatsApp (11)**: respondeu A e B (API oficial da Meta ou intermediário). Precisa de um **cadastro de Empresa com as configurações necessárias**. Hoje usa WhatsApp Business com número Vivo, compartilhado via **WhatsApp Web**, sem pagar por mensagem. **[EM ABERTO]** Respostas 41, 44 e 45 descrevem o uso atual por WhatsApp Web no celular, e a 45 quer responder pelo celular. Isso é diferente de uma API oficial com custo por mensagem. Precisa decidir o caminho.
- Quem paga a mensagem (41): não decidido (C).
- Mensagem: **configurável na plataforma**. Modelo: "Olá, [nome do cliente], aqui é do [nome do estabelecimento], você está recebendo a sua ordem de serviço digital, acompanhe o status de produção, mas fique tranquila que por este canal avisaremos quando estiver pronto, entre agora para aprovar o que ficou combinado."
- Respostas do cliente (45): quer que a conversa fique no celular dele (WhatsApp Web); **não precisa de logs de conversa no sistema**; as aprovações ficam na OS.
- **E-mail (12)**: respondeu B e A; domínio **anexsys.com.br** já registrado.
- **Pagamento (49)**: respondeu **C, integração com maquininha**; hoje usa Cielo, aceita Stone ou Rede (Itaú). **[EM ABERTO]** O plano previa registro manual no piloto. Como o piloto escolhido é completo, a integração pode entrar, mas é trabalho grande e depende de contrato.

## 6. Acompanhamento e indicadores

- **Dashboard de produtividade** na tela do sistema (por técnico e por quantidade de peças da OS) e **alertas de atraso** antes que a entrega atrase, com parâmetros configuráveis.
- Validação: quer receber pelo próprio sistema o painel e os alertas, não só link e roteiro.
- **Lugar na tela (06/10/2026):** chips na **barra superior** (sempre visíveis, em qualquer aba). Ver seção 13.

## 7. Dados do sistema atual (55)
- Importação (C): o sistema atual gera tudo em Excel; ele pensa em importar histórico completo, **depois da validação**.

## 8. Prints (Parte 3)
- Ficha de medidas: não existe; há um modelo em lista em construção no sistema.
- Mensagem de WhatsApp: não tem agora.
- Retirada: ele assina a OS na caneta; sem exemplo.
- Demais prints ainda não enviados.

## 9. Conflitos que foram levantados (histórico)

> **Atualização de 05/10/2026 (tarde):** os oito conflitos abaixo foram **resolvidos na seção 10**. Esta seção fica como histórico.

1. **QR por OS versus plano por peça**: o plano propunha QR assinado por peça; o André escolheu QR por OS (Ordem de Produção na sacola), mantendo a quantidade de peças e o grau de dificuldade como dado.
2. **Modo estação (34 B) versus fluxo de status automático**: no fluxo descrito, cada leitura avança o status sozinha conforme o papel; no modo estação o funcionário escolhe a fase.
3. **WhatsApp**: API oficial/BSP (pergunta 11) versus WhatsApp Web no celular, sem custo e sem logs (41, 44, 45).
4. **Piloto completo e maquininha** versus plano de piloto fino com pagamento manual.
5. **Garantia**: 7 dias (reconserto) versus 90 dias (serviço), dias úteis versus corridos.
6. **Status públicos**: o André quer vários status públicos, mas só duas mensagens ativas; o link de acompanhamento mostra o resto.
7. **Reprovação**: único retorno de fase permitido; precisa ficar explícito, pois a resposta 32 é "fluxo rígido".
8. **Sobre a sequência de status**: o André numerou as etapas pulando a 5 e juntando acabamento e passadoria com a produção.

## 10. Respostas complementares (05/10/2026, tarde)

Fonte: respostas do André às 15 perguntas complementares. Itens marcados **[ASSUMIDO]** são deduções que o André ainda não confirmou. Itens **[AVALIAR]** são pontos em que o André pediu uma avaliação (ver o parecer sobre token, LGPD e entrega em domicílio).

### 10.1 Como cada conflito da seção 9 foi resolvido

| # | Conflito | Resolução |
|---|---|---|
| 1 | QR por OS ou por peça | **QR por OS**, na Ordem de Produção impressa (já decidido). Quantidade de peças e dificuldade ficam como dados da OS |
| 2 | Modo estação ou avanço automático | **Avanço automático pelo papel de quem lê.** O objetivo é garantir o fluxo completo sem pular etapas. A técnica **só abre outra sacola depois de terminar a anterior** |
| 3 | API oficial ou WhatsApp Web | **API oficial contratada direto.** O André reconhece que confundiu o uso atual (WhatsApp Web) com o que o sistema precisa |
| 4 | Piloto completo e maquininha | **(Substituído na seção 11: integração online.)** Cielo por conciliação (importar as vendas no fechamento do dia e baixar as OS em lote), **não** integração em tempo real. Isso reduz o risco do prazo |
| 5 | Garantia: 7 ou 90 dias; úteis ou corridos | **Dois prazos diferentes**, ambos contados **da retirada pelo cliente** (ver 10.2). Substitui a resposta anterior que contava a garantia da conclusão da peça |
| 6 | Status públicos e só duas mensagens | Mantido: o link público mostra o resto |
| 7 | Reprovação como único retorno | Mantido, com um status interno próprio **"Em refação"** |
| 8 | Sequência de status | **Lista confirmada**, com a inclusão de "Em refação" |

### 10.2 Novas decisões

> **Atualização (rodada 3, seção 11):** os itens de **maquininha e pagamento** (conciliação e Pix), **retirada** (token) e **aprovação pendente** abaixo foram **substituídos** pela seção 11. O restante continua valendo.

**WhatsApp**
- **API oficial contratada direto.**
- **Número:** começa com o **número atual da Vivo**, usando o recurso de uso simultâneo, **se a Meta permitir**. Depois, **compra outro número**. O sistema precisa ter **um lugar para reconfigurar o número**.
- **Custo das mensagens:** o **ateliê absorve**. Ao comercializar, entra no **preço do plano**.

**Ambiente**
- O André **cria a conta na nuvem** e dá acesso a quem for operar. O domínio **anexsys.com.br** está no nome dele, e ele libera o acesso. **Não informou** valor máximo mensal nem onde o domínio está registrado.

**Estrutura do ateliê**
- **1 CNPJ e nenhuma Filial.** O sistema exige ao menos uma: será criada a **Filial padrão**.
- **Horário de funcionamento:** segunda a sexta, 9h30 às 18h; sábado, 9h30 às 14h; domingo fechado.
- **Hora de corte: não informada.**
- **[ASSUMIDO]** Fuso horário de Brasília. **[ASSUMIDO]** "Dia útil" no ateliê significa **dia em que a Filial funciona** (segunda a sábado, exceto feriados fechados).

**Status e produção**
- **Lista de status confirmada**, com o status **interno** **"Em refação"**: quando a técnica lê o QR de uma OS reprovada, o status vira **Em refação**; ao terminar e ler de novo, vai para **Aguardando controle de qualidade**.
- **Regra de uma sacola por vez:** a técnica só abre outra sacola (lê o QR de outra OS) depois de terminar a anterior.

**Versões da OS e Fechar sacola**
- A sacola **não é um objeto do sistema**. É o saco físico que leva as peças e a OP no bolso transparente.
- Cada versão da OS aceita até o **limite parametrizado da Conta** (padrão **5**). **Cada linha é uma peça** (quantidade sempre 1, não editável). Exemplo: 13 peças viram `AAA000001` (5) → Fechar → Abrir nova versão → Salvar (imprime OP e abre `-1`) → de novo até `AAA000001-2` (3) → Fechar → Salvar (só imprime).
- **Número da OS:** três letras e seis dígitos, como placa (`AAA000001` … `AAA999999`, depois `AAB000001`). Não reinicia no dia. A versão da sacola acrescenta `-1`, `-2`. Processos usam letra: **C** balcão, **R** reconserto, **G** garantia.
- **Salvar** com a sacola aberta grava só o rascunho: não trava e não gera OP.
- **Fechar sacola** grava e **trava** a versão. O botão vira **Abrir sacola**. **Não** imprime e **não** cria outra OS.
- **Abrir sacola** destrava para corrigir ou incluir peça.
- **Abrir nova versão** só aparece na **grade de itens**, depois de fechar. É a marca. Não há o mesmo botão no rodapé. Quando está marcado, o rodapé avisa que **Salvar** gera a próxima versão (já com o número, ex. `AAA000001-1`) em **outra aba**.
- **Salvar** com a sacola fechada imprime a Ordem de Produção (popup de impressão). Se **Abrir nova versão** estiver marcado na grade, também abre a próxima versão ligada.
- **Valor** e **desconto** da peça são digitados no formato de dinheiro (centavos, `15.000,00`).
- Sem mínimo de peças na última versão.
- **[ASSUMIDO]** As versões ligadas formam um **grupo**: o cliente recebe **um só link**, **um só aviso** de OS aberta, e o pagamento pode ser único. Cada versão tem sua sacola física, sua Ordem de Produção e seu QR.

**Dificuldade**
- **Por serviço**, com **valor padrão no catálogo**. A **OS mostra a maior** dificuldade entre seus serviços. O **atendente pode ajustar**.
- **Tempos médios por grau: não informados.**

**Prazos**
- **Feriado:** o **sistema sugere o próximo dia útil** e o **atendente decide** caso a caso.
- **Expresso:** conta **só no horário de funcionamento**; o que não couber **passa para a abertura do dia seguinte**.
- **Urgente:** o atendente escolhe **2 ou 3 dias úteis**, com **sugestão de 3**.
- **Sobretaxa:** **percentual configurável por tipo** de entrega.

**Garantia e reconserto**
- **Dois prazos diferentes:** **7 dias** para reclamar de **ajuste** (curto, largo) e **90 dias** de **garantia de defeito de execução** (descosturou, barra se desfez).
- Os **7 dias são corridos.**
- **Os dois prazos contam da retirada pelo cliente.**
- **Depois do prazo, a OS nova é cobrada.** O **gerente pode liberar sem valor, com motivo.**
- Dentro do prazo, a nova OS é **sem valor, vinculada à original**, com o **técnico que fez a primeira vez** **[ASSUMIDO]** (vale para os dois tipos).

**Maquininha e pagamento**
- **Cielo por conciliação.** Hoje o atendente dá baixa nas OS uma a uma. Ele quer, **no fechamento do dia, importar as vendas e baixar todas as OS de uma vez**, e **acompanhar se algum atendente deixou de cobrar**.
- **QR Pix na tela** para o cliente escanear: desejável, **opcional**.
- **Cartão online com cadastro de cartão pelo cliente:** o André **não vê como boa saída**. Fica fora.
- **Modelo da maquininha:** "segue o modelo". **Não informado.**

**Aprovação do cliente**
- Pode ser **pelo link**, **na tela do balcão** ou **no papel**: o atendente imprime a OS, o cliente assina, o atendente **anexa a foto** e clica **"assinado no papel"**.
- A **produção pode começar sem assinatura**, com **liberação e motivo**.
- Se o cliente **não aprovar**, **nada acontece automaticamente**, mas **o atendente precisa ser avisado** (alerta). **Prazo em dias: não informado.**

**Retirada** **[AVALIAR]**
- **Preferência do André: token.** O cliente (ou outra pessoa que retire) recebe um **token ou link**, toca ou digita, e isso **confirma o recebimento**, autenticando data e hora.
- **Segunda opção:** o cliente **assina a Ordem de Produção em papel**, o atendente **guarda a foto na OS** e clica **"entregue assinado"**.
- O André pediu que se **avalie** se há problema de regra ou compliance. A avaliação está em `docs/06-parecer-token-lgpd-entrega.md`.
- **Decisão final aguardando** a resposta às perguntas complementares (segunda rodada).

**Dados no link público e LGPD** **[AVALIAR]**
- O André **repensou** a regra de "dados sensíveis apagados": a **OS que vai ao cliente (link)** só terá **nome, número da OS, data de entrada, previsão de entrega, status, serviços combinados e situação do pagamento** (a conciliação atualiza o valor recebido). Isso **substitui** a regra anterior de apagar o endereço quando o cliente não concorda em compartilhá-lo.
- **Entrega em domicílio** é uma **funcionalidade nova, fora do escopo atual**, com **preço por geolocalização**. A **Ordem de Produção** teria o **endereço de entrega**.
- O André perguntou se, assim, a LGPD fica "livre". A avaliação (com ressalvas) está em `docs/06-parecer-token-lgpd-entrega.md`. **Resposta curta: não fica livre.**

**Piloto**
- **Nenhum concierge nem fila de chegada.**
- **Portal = o link público** de acompanhamento e aprovação.

### 10.3 O que estava em aberto (resolvido na seção 11)

Hora de corte; valor máximo mensal da nuvem e onde o domínio está registrado; modelo da maquininha e forma de ligar a venda à OS; prazo do alerta de aprovação pendente; decisão final sobre token versus assinatura; regras da entrega em domicílio (se entra e quando); tempos médios por dificuldade. Todos estão nas perguntas complementares da segunda rodada (fora do repositório), resolvidas na seção 11.

## 11. Respostas da rodada 3 (05/10/2026, noite)

Fonte: respostas do André às perguntas complementares da segunda rodada. Esta seção **resolve** os pontos da 10.3 e **substitui** o que a seção 10 dizia sobre maquininha, retirada e aprovação pendente.

### 11.1 Mudança radical: pagamento integrado online (a conciliação e o Pix saíram)

- **A conciliação saiu.** O André pediu para **esquecer a conciliação** (importar vendas no fechamento do dia e baixar as OS em lote) e o **relatório "quem deixou de cobrar" por conciliação**.
- **O QR Pix na tela saiu.**
- **O que ele quer:** **integração online.** A partir da OS, o sistema **aciona a maquininha já com o valor da OS**, para **não digitar valor errado nem cobrar errado**, e **recebe o resultado online**. É o **maior trunfo da operação**: "mesmo que demore mais", e **é a razão de estar fazendo um sistema próprio**.
- **Conexão:** **prefere Bluetooth** (**aceita cabo USB**). **Resposta técnica (ver `docs/07-parecer-integracao-maquininha.md`):** integrações de **sistema web com vários atendentes** funcionam **de nuvem a nuvem**, pela internet, **sem Bluetooth nem cabo no computador**; Bluetooth e USB só existem com **programa instalado em cada computador** (TEF, PlugPag), o que **não serve** a um sistema web. A preferência foi traduzida em **"sem cabo, sem digitar valor"**.
- **Maquininha atual:** **Cielo LIO.** **Aceita trocar de maquininha ou de operadora** se outra integrar melhor com o sistema.
- **Pedido do André:** que se diga o que ele precisa fazer para **contatar a Cielo ou outra operadora, se credenciar e obter autorização** para integrar. **Respondido** em `docs/07-parecer-integracao-maquininha.md`, com passo a passo e e-mails prontos.
- **Cartão online com cadastro de cartão pelo cliente:** **não vê como boa saída.** Fica fora.
- **Plano de contingência (proposto):** **baixa manual** como plano B, e **ponto de decisão em dezembro de 2026** se a operadora não liberar a produção.

### 11.2 Retirada

- **Dois caminhos, mais um escape.** Digital: o cliente aperta **Recebi** no **mesmo link** da OS, só depois que a atendente **inicia a retirada** (janela de 10 min). Papel: foto da OP assinada + **Entregue assinado**. Se o cliente não clicou, a atendente pode **Entregue** (baixa do atendente, não é assinatura do cliente).
- A API oficial do WhatsApp entra depois. **Homologado em 09/10:** o envio hoje é pelo **WhatsApp Web** (mensagem certa). O link público existe; o microformulário ainda não abre no celular e os botões novos (Concordo, etc.) ficam para a próxima fase desse formulário.

### 11.3 Entrega em domicílio

- **Depois do piloto**, só o **marcador** e o **endereço opcional**. O André **ainda não trabalha com entrega**.

### 11.4 Aprovação pendente

- **Avisar todos os dias** até o cliente assinar, **para o atendente e para o gerente**, com **lista sempre visível na tela** para monitoramento. **Não é por prazo.**

### 11.5 Ambiente, domínio, prazo e estrutura

- **Nuvem:** **até R$ 150 por mês.**
- **Domínio:** **ATELIERIZAGUSMAO.COM.BR** (Registro.br), **usado só para homologação e uso próprio**. **Para comercializar, usará outro.** O **anexsys.com.br fica para depois.** Quem tem a senha do painel: **o André.** Ele **autorizou seguir assim sem perguntar de novo.**
- **Hora de corte:** **o próprio fechamento** (18h de segunda a sexta; 14h no sábado).

### 11.6 Suposições confirmadas

Todas as cinco foram **confirmadas**:

1. **Sábado é dia útil.**
2. **OS dividida forma um grupo** (um link, um aviso de OS aberta e um pagamento).
3. **Reconserto e garantia são a mesma coisa** (nova OS sem valor, vinculada, com o técnico original), **com prazos de 7 dias corridos e 90 dias**, ambos da retirada.
4. **Fuso de Brasília e moeda em reais.**
5. **O link mostra só o primeiro nome** do cliente.

### 11.7 Tempos médios por dificuldade

- **Grau 1 = 30 minutos, grau 2 = 60, grau 3 = 90, grau 4 = 180.**

### 11.7b Prazos de entrega (homologado em 09/10/2026)

- O cálculo **Normal / Expresso / Urgente** na OS está **validado**.
- Os prazos ainda são **fixos no código** (Normal = +7 dias, Urgente = 3 dias úteis, Expresso = 2 horas por peça). O **painel de parâmetros** para o André definir esses valores entra depois.

### 11.7c Aprovação na entrada da OS (a validar)

- A aprovação é **concordo com o serviço e o valor**. **Não é status**: a OS continua **Em aberto**.
- Nesta fase: **balcão** (**Concordou**) e **papel** (foto da OS assinada + **Assinado no papel**). O **Concordo** no celular entra depois, no mesmo link.
- Cada registro guarda quem, quando, o texto aceito, valor e serviços na hora, e a foto (no papel). A **medida usada fica travada**.
- A produção **pode começar sem assinatura**, com **Liberar produção** e **motivo**. Depois ainda dá para assinar no balcão ou no papel.
- Lista visível e aviso diário de aprovação pendente entram depois.

### 11.8 Princípio transversal: tela de parâmetros

- **Para todas as regras deve existir uma tela de parâmetros**, **administrável pelo André**: graus e tempos (inclusive **aumentar ou diminuir graus**), **parâmetros de logística de produção**, prazos, cortes, sobretaxas, status e demais regras.
- **Regra de pronto (proposta):** **nenhum ciclo fecha com uma regra nova sem a sua tela de parâmetros.**

### 11.9 O que ainda precisa de resposta (não trava os ciclos 0 e 1)

- Ponto de decisão e contingência da maquininha (data limite; baixa manual ou troca de operadora).
- Quantos atendentes cobram e quantas maquininhas há ou haverá.
- Quem escolhe a forma de pagamento (sistema ou cliente na maquininha).
- Limite de custo da maquininha e da integração; se aceita comprar uma Point Smart 2 como plano B de teste.

Estão nas perguntas complementares da terceira rodada (fora do repositório).

### 11.10 O que o André precisa verificar com a operadora (da pesquisa)

Modelo exato da LIO e compatibilidade com a integração remota; se o pedido aparece sozinho na maquininha; se o resultado volta por aviso automático ou só por consulta; custos (aluguel, taxas, integração); prazo do token de produção; modelo de parceria para vender o ANEXSYS a outros ateliês. Lista completa em `docs/07-parecer-integracao-maquininha.md`, seção 9.

## 12. Navegação e cadastros (06/10/2026)

Validado no ambiente local. Vale para **todos** os cadastros de uma vez: mesma lista (Adicionar, Mais ações, busca, colunas, lupa de filtro, zebrinha, paginação), Novo/Alterar em aba interna, menu lateral com submenu, e **formulário com fundo ciano**. O formulário da **OS** (cabeçalho e peças) e os textos da tela de Acesso ficam em **português**. Não homologar tela por tela. Clientes, Empresas, Filiais, Contas, OS, **Partes do corpo**, **Unidades de medida**, **Produtos**, **Serviços**, **Usuários**, **Papéis**, **Permissões** e **Comunidades** já usam esse padrão. Empresas, Partes do corpo, Unidades e **Usuários** têm **Alterar / Excluir / Inativar** como Clientes. **Papéis** têm Alterar e Inativar (papel de sistema não inativa). **Permissões** só Alterar — não há exclusão nem status. **Comunidades** estão congeladas: a grade segue o padrão, sem escrever. **Filiais** e **Contas** têm Alterar e Inativar na grade (a API ainda não exclui). Usuário não exclui a si mesmo nem o último usuário da Conta. Parte do corpo ou unidade com medida de cliente não pode ser inativada nem excluída. A unidade padrão da Conta (CM) também não. Combo Empresa esconde as inativas; a lista continua mostrando. A última Empresa ativa da Conta não pode ser inativada nem excluída. Só inativa a Conta do contexto ativo.

**Homologação local (06/10/2026):** Atelier A, Atelier B e Atelier C estão cadastradas **na mesma Conta**, cada uma com **CNPJ diferente**. A faixa **verde** de confirmação permanece como está. Hierarquia: **Conta** (quem assina) → **Empresa** (pai, CNPJ) → **Filiais** (filhos). **Não existe Filial pai:** as unidades de uma Empresa ficam no mesmo nível. Ao cadastrar a Empresa, o sistema cria a primeira Filial filha, a **Matriz**. Você não cadastra a Matriz como se fosse outra Empresa; outras Filiais nascem em Administração → Filiais, sempre debaixo da Empresa. O código MATRIZ é único **por Empresa**. Se o banco antigo ainda travar o código na Conta inteira, a Matriz da segunda Empresa nasce com um código reserva. Duas **Contas** Ateliê A/B (isolamento do Ciclo 1) ficam para a tela de Contas, já com o mesmo padrão de lista. Mensagem de erro na tela aparece **em vermelho**, inclusive quando o texto for técnico. Confirmação fica **verde**.

### Abas internas

- O **menu** abre ou volta para a aba daquela tela. Dashboard não empilha.
- **Cadastrar novo** e **Alterar** abrem **outra aba interna**. A lista **permanece aberta**.
- Assim o atendente não perde um cadastro de cliente se precisar abrir uma OS no meio do atendimento.
- Não se usa “nova aba do navegador” nem “nova janela”.
- **Combos** Conta / Empresa / Filial só mudam o contexto. Ficam fixos no alto da barra esquerda.
- O **menu lateral** usa fundo **ciano-turquesa** e letras **pretas**.
- As faixas de título das telas (**hero**) também usam ciano e letras pretas.
- Quando um cadastro tem **mais de uma aba** (lista + Novo ou Alterar), o **menu lateral** mostra um submenu com essas abas. O clique no item do menu volta para a grade; o clique no submenu ativa a aba correspondente. O **X** do submenu fecha aquela aba (o mesmo que o X do topo). No celular não há submenu.
- As abas do topo **nascem à esquerda**, empurrando as já abertas para a direita, para a última tela aberta ficar visível. Reabrir pelo menu traz essa aba de volta à esquerda. Trocar de aba pelo clique nela não reordena.
- **Dashboard** é chip fixo na **barra superior**, ao lado do nome da sessão (no vão até o Sair). Não é aba. Clicar nele volta para casa **sem fechar** as abas de trabalho. O que entrar depois nesse vão (alertas, técnicos do dia, produtividade) também será chip, não aba. A faixa de abas fica **só para telas abertas**; some quando não houver nenhuma.
- O menu **encolhe e expande** como pasta: a seta abre/fecha o ramo; o nome do item continua abrindo a tela. Assim os submenus futuros cabem na barra.
- Se houver **subaba aberta**, aquele ramo **permanece aberto**. Só some quando o usuário fecha a aba (X).
- Cada função do menu tem uma **borda discreta** para separar visualmente um item do outro.

### Tela principal de cada cadastro

De cima para baixo:

1. **Cabeçalho da grade:** **Adicionar** à esquerda; **Mais ações** (exportar Excel, exportar e-mails e excluir) só vale com linhas **marcadas**; à direita busca por nome, ícone para **escolher colunas** e botão para **abrir o filtro**.
2. **Filtro:** o botão é uma **lupa com +** para abrir e vira **lupa com −** para fechar. O painel é uma caixa **ciano-turquesa**, à parte do fundo, com **Buscar** e **Limpar**.
3. **Grade** com caixa de seleção, colunas configuráveis, **Alterar / Excluir / Inativar**, zebrinha **ciano-turquesa claro / branco**, e **paginação** com números de página, anterior e próxima.

### Campos que vêm de tabela

Em **busca, cadastro e movimentação** (OS incluída): o campo sugere registros já cadastrados enquanto se digita.

- Se a lista sugerir, a atendente escolhe o item.
- Se **não sugerir**, a caixinha de “Nenhum registro encontrado” traz o botão **Cadastrar**. O atalho abre o cadastro (aba interna, com o texto já preenchido).
- Vale para **todo campo que vem de outra tabela** (cliente na OS, filial, parte do corpo, unidade, etc.).

### Excluir e inativar

- **Inativar:** o registro deixa de ser usado no dia a dia, mas o histórico permanece.
- **Excluir:** só se **não houver movimento** (OS, medidas, financeiro). Com movimento, a tela avisa e não apaga; use Inativar quando a regra permitir.

## 13. Escopo futuro registrado (06/10/2026)

Confirmado pelo André. **Não construir agora.** Fica no escopo para não esquecer.

### Barra superior operacional

O topo (hoje nome da sessão, chip **Dashboard** e Sair) vira acompanhamento para **atendente e gerente**, visível em qualquer aba. O Dashboard já ocupa esse vão; o restante abaixo **não construir agora**:

- **Técnicos do dia** — quem está em operação (alimentado pela grade diária, abaixo).
- **Concierge** — chegada dos clientes (versão futura; o piloto atual não tem fila).
- **Alerta operacional** — fica vermelho se houver OS parada, produção atrasada ou prazo perto sem finalizar.
- **Produtividade** — recorte do dia por técnico/costureira.

São **chips compactos**; o clique abre o detalhe. A regra do que é atraso mora na **tela de parâmetros**. Sem botão de mentira até existir dado real de produção.

### Estilização para comercializar

A paleta atual (ciano-turquesa e letras pretas) vale para o homologador. **Quando o ANEXSYS for vendido a outros ateliês**, precisa existir um **lugar de estilização** (identidade visual da Conta: cores, logo, faixa, menu, grade). O padrão de hoje é o tema inicial, não o único.

### Grade diária de técnicos

No questionário já existia o **dimensionamento** da equipe (quantidade de peças + grau de dificuldade), o **diário de bordo**, o login das diaristas e o dashboard de produtividade. **Não estava** o dia a dia de convocar, confirmar presença e pagar.

Fluxo registrado em 06/10/2026:

1. **Cadastro de prestador de serviço** — pessoa que trabalha para o ateliê. No cadastro: **cargo** (costureiro, gerente, atendente e assim por diante), **média de performance**, **valor contratado do dia** e dados para **Pix**. “Técnico” é o prestador convocado para produzir. O **papel** (permissão) continua sendo outro cadastro: recepção, atendente/medidor, produção, qualidade, gerente.
2. **Grade diária** — escolhe o **dia** a analisar. O sistema mostra a **demanda futura** (OS, peças, dificuldade, prazo). O André **marca os técnicos** que vai convocar (eles aparecem de forma variável, conforme planejamento e demanda). Com os marcados, vê se **atende a demanda** ou se precisa chamar mais. Objetivo: contratar só as pessoas necessárias, otimizar o resultado e **garantir o prazo do cliente**.
3. **Comparecimento** — no dia, confirma quem veio trabalhar.
4. **Contas a pagar** — quem compareceu gera um título no **valor contratado**. Pagamento **no fim do dia via Pix**. Este Pix é **ao técnico**, não o QR Pix da OS do cliente (esse saiu na seção 11). O envio automático pela conexão bancária está no item seguinte.

Alimenta o chip **Técnicos do dia** da barra superior. Completa o “dimensionamento de grade” previsto no Ciclo 8. **Não construir agora.**

### Pix automático de saída e reembolso ao cliente

**É possível.** O sistema se conecta ao banco (ou a um intermediário Pix) para **enviar** Pix. Isso **não** volta o QR Pix na tela da OS: o cliente continua pagando na **maquininha**.

Dois usos da mesma conexão:

1. **Pagar o técnico** no fim do dia (grade diária, acima) — o título aprovado dispara o Pix no valor contratado.
2. **Reembolso ao cliente** — o sistema abre a ação na OS (motivo e valor). O dinheiro **só sai** depois da **aprovação do administrador**. Aí o Pix vai para a chave do cliente.

O **estorno de cartão** na maquininha Cielo continua sendo outro caminho (já previsto no Ciclo 7: gerente + motivo). Reembolso via Pix é para quando o dinheiro precisa **sair da conta** para o cliente.

A conexão bancária depende de contrato com o banco ou intermediário; detalha-se na hora de construir. **Não construir agora.**

## 14. Linha da OS, catálogos e Pagar (07/10/2026)

Confirmado no formulário da OS, inspirado nos prints e sem perder o plano:

- Na mesma linha: **Produto** e **Serviço**. O serviço da linha **só lista o que já tem preço** para aquele produto. O preço vem da tabela **Preços** (par produto + serviço) e o atendente pode alterar. O tempo previsto da combinação é cadastro para o PCP; **não** mexe em Normal / Expresso / Urgente. Depois o **Detalhamento do ajuste** (o combinado com o cliente; no código `complement`), **marca** (obrigatória; o ateliê pode cadastrar **Não Informado**), **modelo** e **série** (opcionais na maioria das peças). Obrigatoriedade de modelo/série por estabelecimento fica para a tela de parâmetros. Na tela, o mouse em cima do detalhamento abre o texto completo.
- Até o **limite parametrizado** de peças **por versão** (padrão 5). Cada linha é uma peça. A sacola é só transporte. **Fechar sacola** trava. **Salvar** com a sacola fechada imprime a OP. **Abrir nova versão** + **Salvar** abre a próxima versão ligada (`AAA000001-1`) em outra aba.
- **Observação** sai para o cliente e já vem com a regra de garantia (90 dias / reconserto 7 dias úteis). **Observação interna** não imprime.
- A **OS impressa sai com valores**. A **Ordem de Produção não mostra valores** — o técnico não vê o que foi cobrado.
- A grade e o formulário da OS têm o menu **⋮** para **reimprimir** (Ordem de serviço / Ordem de produção) e **reenviar** (WhatsApp ou e-mail). Não entram etiqueta adesiva, NFS-e, SMS, link de cobrança nem os demais itens do sistema antigo que ainda não existem de verdade.
- Não entrou endereço de entrega nem frete.
- **Pagar** fica no bloco **Pagamento** da OS (e no rodapé). O botão **registra** o valor já recebido no balcão. Formas: **Dinheiro**, **Cartão na maquininha**, **Pix**, **Transferência** e **Outro**. Não processa cartão daqui e não abre QR Pix. À vista/parcelado, plano de contas, gerar parcelas e Cielo **não** entram nesta fase.
- **Condição** na OS e na OP: **Pago** só com a OS quitada; parcial ou em aberto = **Pagar na retirada**.
- **Falta pagamento** é aviso na OS e na retirada, **não é status**. A entrega só bloqueia se a Conta estiver com **Bloquear entrega por inadimplência**. Liberação do gerente com motivo entra depois.
- O formulário da OS começa pelo **Cliente**. Empresa e Filial não repetem o menu lateral. **Status** (não Situação), Entrada e Saída ficam numa linha; previsão e responsáveis em caixas no mesmo bloco. Prioridade fica na previsão.

## 15. Como o André valida no VS Code (07/10/2026)

O André homologa no PC, no VS Code. **`git pull` sozinho não basta.** Depois de cada entrega, o aviso precisa listar o que fazer no VS Code:

1. Terminal: `git pull`.
2. Terminal do servidor: `Ctrl+C` e `npm run start:dev` de novo. É isso que atualiza o banco (colunas novas, produto, serviço, horário de saída, versões da OS e limite de peças).
3. Se a tela mudou: no terminal da tela, `Ctrl+C` e `npm run frontend:dev` de novo.
4. Só então atualizar o navegador em `http://127.0.0.1:3001`.

## 16. Ordem de Produção impressa A5 (07/10/2026)

- A bandeja **A5 é da impressora**. O papel já nasce no tamanho A5 (`@page A5`) para caber no bolso da sacola.
- Duas faces na mesma folha: **cabeçalho** (balcão/técnico) e **prateleira** (câmera da esteira).
- **Entrada** pequena no topo. **Previsão sai do cabeçalho** e vira o bloco enorme embaixo: **dia grande, mês pequeno e numérico** (`18` `/10`).
- Número da OS (placa) **no cabeçalho e em cima do QR**.
- Grade em **linhas de tabela** (**S** = sequência 1–5, depois Produto \| Serviço \| Detalhamento do ajuste). O técnico lê peça a peça. **Detalhamento do ajuste** é o maior campo, fonte **15 px** (~11 pt) — o maior que cabe em 3 linhas no A5 com 5 peças e a prateleira. A coluna S (~7%) deixa ~34 caracteres por linha (**102** no total). Na refação, o **motivo da reprovação** sai nessa coluna, marcado **Refazer**. Na prova, a anotação sai marcada **Prova**, sem apagar o Detalhamento do ajuste. **Sem quantidade e sem preço**.
- Marca, modelo e série saem **pequenos**, sem destaque, só o que foi preenchido.
- **Pagar na retirada** ou **Pago** fica no **cabeçalho**. No espaço que era da condição entra o bloco **Retirada** (Nome, Data, Assinatura) para o cliente — ou quem buscar — assinar no bolso da sacola.

## 17. Controle de qualidade peça a peça (07/10/2026)

- Tela **Controle de qualidade**: grade no molde da OS, **sem valores**, com **S** (sequência), Produto, Serviço, Detalhamento do ajuste, marca/modelo/série.
- O botão da grade é **Revisar**, não Alterar. A reimpressão da OP fica no **⋮** de cada linha, no mesmo padrão da grade da OS, para o caso da impressão falhar.
- A lista do **Controle de qualidade** mostra só as OP com status **Aguardando controle de qualidade**. **Pegar sacola** mostra só **Aberta** (botão Pegar sacola) e, depois de pegar, **Em produção** (botão Terminei). A lista da OS continua com todos os status.
- Os passos de chão **não são provisórios**. Ficam na função **Operações → Pegar sacola**: só as OS **Abertas** (Pegar sacola), que passam a **Em produção** (Terminei). Uma sacola por vez. Quem não usa QR no contrato continua por esta tela. O QR, quando existir, dispara o **mesmo passo**.
- **Abrir revisão** fica no **Controle de qualidade**, não na esteira.
- Dois botões por peça: **Aprovado** e **Reprovado** (motivo em texto livre).
- Se **todas** as peças da OS estão aprovadas, o status vai para **Pronto para retirada**.
- Se uma ou várias são reprovadas, a **OS original permanece em Controle de qualidade**. O sistema imprime uma **nova versão da OP só com as peças reprovadas**, com o **motivo da reprovação** em cada linha para o técnico refazer o ponto exato.
- Quando a sacola volta, o revisor puxa a **mesma OS**. A tela mostra a versão da refação. Aprova ou reprova de novo. Nova reprovação gera a versão 3, e assim por diante.
- Isto **não** é a versão da OS (`AAA000001-1`, que é sacola). É versão da **OP** de refação.
- Leitura de QR no celular e catálogo completo de status (Em produção, Aguardando qualidade) continuam no Ciclo 4.

## 18. Três voltas que não se misturam (08/10/2026)

Confirmado com o André. São caminhos distintos:

1. **Refação (qualidade).** Mesma OS, nova **versão da OP** só com as peças reprovadas. O cliente continua vendo Controle de qualidade. Já existe.
2. **Prova / pré-preparação.** Mesma OS e versão da OP, status **Aguardando prova**. A técnica em produção usa **Enviar para prova**. **Prova feita** abre **Anotações de prova** (texto opcional por peça) e volta sempre para produção. Se anotou, a mesma OP é reimpressa com o marcador **Prova**. A qualidade só entra no **Terminei**. WhatsApp 3 fica em aberto.
3. **Cliente voltou (reconserto / garantia).** Depois da **retirada**. Reconserto `AAA000001-R` e garantia `AAA000001-G` na **mesma família**. Cobrada (fora do prazo) ainda abre placa nova. `-1` continua sendo só peças a mais na mesma visita.

Prazos contados da retirada, pelos parâmetros da Conta (`warranty_adjustment_period_days` e `warranty_execution_period_days`). Dentro do ajuste → **Reconserto** sem valor. Depois do ajuste e dentro da execução → **Em garantia** sem valor. Fora dos dois → **cobrada**. Liberação do gerente com motivo fica para depois.

**Retirada (09/10/2026):** botão **Retirada** na OS. Inicia a janela do **Recebi**, aceita foto + **Entregue assinado**, ou **Entregue** pelo atendente. **Cliente voltou** continua depois do status Retirado.

## 19. Número da sacola e letra do processo (09/10/2026)

O André viu o conflito: versão `-G` e garantia com **G na frente** da placa. `GAA000001` já é uma placa válida. Decisão:

1. **Versão de sacola** (mais peças na mesma visita): número. `AAA000001`, `AAA000001-1`, `AAA000001-2`.
2. **Processo diferenciado**: uma letra depois da placa. **C** refação / reprovado no balcão. **R** reconserto (Cliente voltou no prazo de ajuste). **G** garantia (Cliente voltou no prazo de execução). Sem prefixo `G`.
3. **Refação no balcão** (Pronto para retirada, cliente prova e recusa): mesma família, letra **C**, motivo do cliente. Não é Cliente voltou e não é prova.
4. Se o cliente leva parte das peças: a **mãe fica parcial** (não Retirado) enquanto a filha de processo estiver aberta. **Pagar some na mãe**. Pagar a filha quita o **grupo** (as duas linhas saem Pago).
5. Devolução/reembolso de peça já paga e abandonada fica para depois.

## 20. Privacidade operacional (01/11/2026)

Implementado como continuação do Ciclo 10, depois do formulário do celular:

- O aviso de privacidade, o termo de aceite, o texto do operador e o plano de incidente são editáveis em **Privacidade**. O formulário do celular usa o texto gravado.
- O link público continua aberto até a retirada. Depois, vale a garantia de execução da Conta mais a margem (padrão 30 dias). No dia seguinte, o celular avisa que o link expirou.
- **Pedidos do titular** registra acesso, correção, anonimização, exclusão ou portabilidade, com prazo de resposta (padrão 15 dias) e a resposta dada. No acesso, dá para montar um resumo do cadastro e das OS.
- **Tratamento de dados** lista o que a Conta trata, para quê e onde.
- **Incidentes** guarda o que aconteceu e se foi contido ou comunicado.
- A guarda de inativos (padrão 5 anos) e do endereço de entrega (padrão 30 dias) fica registrada. O sistema **não apaga** cadastro automaticamente.
- Os textos continuam provisórios até a revisão do advogado. WhatsApp oficial, backup testado e a autorização escrita de virada continuam fora.
