# Glossário

**Atualizado em:** 19/10/2026
**Substitui:** os termos espalhados pela documentação antiga (`docs/arquivo/`).

Este glossário vale para as conversas, os documentos e as telas. A coluna "No código" ajuda quem abrir o programa, que usa nomes em inglês.

## Estrutura da plataforma

| Termo | Significado | No código |
|---|---|---|
| **Conta** | Quem assina o ANEXSYS. É a dona dos dados. Exemplo: "Grupo Ateliê Silva". Os dados de uma Conta **nunca** se misturam com os de outra | `tenant` |
| **Empresa** | O pai: a pessoa jurídica (CNPJ) dentro de uma Conta. Uma Conta pode ter várias Empresas. As Filiais são filhas desta Empresa. Ao cadastrar, nasce a Filial padrão (Matriz) | `company` |
| **Filial** | O filho: a unidade física onde se atende e produz. Cada Empresa pode ter várias Filiais no mesmo nível; a primeira é a Matriz. **Não existe Filial pai** | `branch` |
| **Usuário** | Pessoa que entra no sistema com e-mail e senha | `user` |
| **Papel** | Conjunto de permissões. Papéis iniciais: recepção, atendente/medidor, produção, qualidade e gerente | `role` |
| **Escopo** | A quais Empresas e Filiais um usuário tem acesso. Usuário novo nasce **sem nenhuma Filial** até o administrador marcar | `branch scope` |
| **Comunidade** | Agrupamento de usuários que existe no código. **Congelado**: não concede permissão | `community` |
| **Grupo de trabalho** | Quem trabalha junto: Atendentes, Gerente, Técnico e Qualidade. Cada pessoa fica em um grupo. **Não muda a permissão**; o acesso continua no papel e na filial | `work_group` |
| **Administrador da plataforma** | Quem cria Contas. Por enquanto, só o André | permissão `platform.tenants.create` |

## Atendimento e produção

| Termo | Significado | No código |
|---|---|---|
| **Cliente** | Pessoa atendida. Pertence à **Conta** e pode ser atendida em qualquer Empresa ou Filial dela | `customer` |
| **Ordem de Serviço (OS)** | Documento comercial: quem é o cliente, quais peças e serviços, preço, prazo. É a "verdade" do dinheiro. Número tipo placa (`AAA000001`); versões de sacola `-1`, `-2`; processos `-C`, `-R`, `-G` | `service order` |
| **Peça** | Uma peça de roupa (ou outro artigo) trazida pelo cliente. Cada linha é uma peça. **Marca é obrigatória**; modelo e série são opcionais. Cada **versão da OS** aceita até o limite parametrizado da Conta (padrão **5**). Sem mínimo: a última versão pode ter só o que restou | `service order item` |
| **Produto** | Tipo da peça no cadastro (Calça, Saia, Vestido de festa, Vestido, Terno, Paletó, Camisa, Jaqueta). A atendente escolhe na linha da OS e pode cadastrar outro | `garment product` |
| **Serviço** | O que se faz numa peça (bainha, barra, ajuste). Sem preço próprio. Só aparece na OS se estiver vinculado ao produto escolhido | `atelier service` / `service order item` |
| **Preço (Produto × Serviço)** | Combinação única de produto e serviço com **preço sugerido** e **tempo previsto**. A OS sugere o preço; o atendente pode alterar. O tempo é para o PCP depois e **não** entra no Normal / Expresso / Urgente | `garment_product_services` |
| **Detalhar o serviço** | Texto livre na linha da peça: o que a atendente combinou com o cliente. É o **maior campo da OP** (fonte 15 px, 3 linhas, ~102 caracteres). Na ficha nasce com uma linha e cresce com o texto até esse limite. No código o campo continua `complement`. Na tela, o mouse em cima abre o texto completo | `service_order_items.complement` |
| **Ordem de Produção** | Papel **A5** da sacola: número da placa no cabeçalho e em cima do QR; **Pago / Saldo em aberto** (ou **Reconserto / Em garantia / Refação no balcão** no retorno) no cabeçalho; grade em linhas (**S**, Produto, Serviço, Detalhar o serviço); bloco **Retirada** (Nome, Data, Assinatura); marca/modelo/série pequenos; previsão enorme na face da prateleira. **Nunca mostra preço nem quantidade**. A bandeja A5 é da impressora; o layout já nasce A5. Reprovação na qualidade gera **outra versão da mesma OP**, só com as peças reprovadas | `production order` / `production_order_versions` |
| **Sacola** | Embalagem **física** só para transportar as peças. O sistema não controla a sacola: controla o **limite de peças por versão da OS**. A OP impressa vai no bolso transparente | `bag` (apenas apoio físico) |
| **Fechar sacola** | Ação na OS: grava a versão e **trava** as peças. **Não** imprime e **não** abre a próxima versão. O botão vira **Abrir sacola** | `POST /service-orders/:id/close-bag` |
| **Abrir sacola** | Destrava a versão fechada para corrigir erro ou incluir peça que o cliente pediu de volta | `POST /service-orders/:id/open-bag` |
| **Abrir nova versão** | Só aparece na grade de itens, com a sacola fechada. Marca a intenção; o rodapé avisa o número. A próxima versão nasce ao **Salvar**, em **outra aba**, já editável | `POST /service-orders/:id/next-version` |
| **Versão da OS** | Continuação ligada da mesma OS quando o cliente trouxe mais peças do que o limite **na mesma visita**. A primeira é `AAA000001`; as seguintes são `AAA000001-1`, `AAA000001-2`. **Não** é reconserto, garantia nem refação no balcão | `service_orders.group_id` / `version_suffix` |
| **Letra de processo** | Sufixo depois da placa para caminhos diferentes da sacola: **C** refação no balcão, **R** reconserto, **G** garantia. Nunca um **G na frente** da placa (`GAA000001` já é uma placa válida) | `version_suffix` `C`/`R`/`G` |
| **Retirada** | No balcão: a atendente **inicia a retirada** (janela de 10 min para o **Recebi** no link). Cliente tecnológico confirma no link. Cliente sem celular assina a OP na caneta; a atendente anexa a foto e **Entregue assinado**. Se ninguém clicou, a atendente pode **Entregue** (baixa dela). API do WhatsApp entra depois | `POST /service-orders/:id/pickup/start` / `complete` |
| **Recebi** | Botão do cliente no **mesmo link** da OS (`/os/{token}`). Só funciona com a janela aberta no balcão. Grava data, hora, número e o texto aceito. WhatsApp oficial ainda não envia o link | `GET/POST /public/service-orders/:token` |
| **Link público** | Página sem login no celular: microformulário com primeiro nome, OS, status, o que ficou combinado e botões (**Recebi** hoje; **Concordo** depois). A atendente copia o endereço na OS | `service_orders.public_token` |
| **Cliente voltou** | O cliente reclama **depois da retirada**. A atendente escolhe as peças. Reconserto e garantia ficam na **mesma família** (`AAA000001-R` / `-G`). Fora do prazo (cobrada) ainda abre **placa nova** | `POST /service-orders/:id/client-return` |
| **Refação no balcão** | O cliente prova **antes de levar** (Pronto para retirada) e recusa peça. Mesma família, letra **C**. A mãe não vira Retirado; fica parcial. Sem Pagar na mãe enquanto a filha existe; pagar a filha quita o grupo | `POST /service-orders/:id/counter-rework` |
| **OS filha / retorno** | Processo ligado à original. Reconserto/garantia/balcão usam letra na mesma placa. Cobrada (fora do prazo) usa placa nova. Copia as peças escolhidas e o técnico original. Dentro do prazo sai sem valor | `origin_service_order_id` / `return_kind` |
| **Controle de qualidade** | Tela em que o revisor abre a OS original e aprova ou reprova **peça a peça**, sem valores. O botão da lista é **Revisar**. 100% aprovado avança a OS para Pronto para retirada | `quality-reviews` |
| **Prova / pré-preparação** | Nova medição depois do corte e da modelagem. A técnica envia a OS **em produção** para **Aguardando prova**. **Mesma OS e mesma versão da OP** — não nasce placa nova, nem `-1`, nem OP de refação. **Prova feita** volta sempre para **Em produção**. A qualidade só entra no **Terminei**. WhatsApp 3 ainda não | `awaiting_proof` / `POST /service-orders/:id/send-to-proof` |
| **Anotações de prova** | Histórico da nova medição, peça a peça, na mesma OS. Texto opcional (102 caracteres). Não mistura com Observação nem com Detalhar o serviço. Se houver texto, a mesma OP é reimpressa com o marcador **Prova** (não é **Refazer**) | `service_order_proof_notes` / `POST /service-orders/:id/complete-proof` |
| **Refação** | Peças reprovadas voltam à esteira numa **nova versão da OP**. A OS original **permanece em Controle de qualidade**. Não confundir com versão da OS (sacola) nem com prova | `production_order_versions` + `rework_cases` |
| **Esteira** | Lugar físico onde ficam as sacolas: "a fazer" (por ordem de chegada) e "finalizadas" | não existe no sistema |
| **Pegar sacola** | Função de **Operações**: a técnica pega a sacola da esteira e avança o status (Em produção, Terminei, refação). Fluxo **manual permanente** para quem não usa QR. A leitura do QR, quando existir, dispara o mesmo passo | `POST /service-orders/:id/floor-advance` / `/pick-bag` |
| **QR code** | Código impresso na Ordem de Produção. **Um por OS** (não por peça). O funcionário lê com o celular para mudar o status | `qr code` |
| **Grau de dificuldade** | Nota de 1 a 4 definida **por serviço** (valor padrão no catálogo). A OS mostra a **maior**, e o atendente pode ajustar. Usada para estimar tempo médio e dimensionar a equipe | ainda não existe |
| **Prestador de serviço** | Pessoa que trabalha para o ateliê (costureiro, gerente, atendente, diarista, terceiro). Cadastro com **cargo**, **média de performance**, **valor contratado do dia** e dados de **Pix**. Ver `docs/02-decisoes-do-andre.md` seção 13 | ainda não existe |
| **Cargo** | Função do prestador no ateliê (costureiro, gerente, atendente…). Distinto do **papel**, que é o conjunto de permissões | ainda não existe |
| **Técnico / técnica** | Prestador convocado para produzir (costureira, diarista, terceiro). Tem **login próprio** | `operational resource` / `user` |
| **Grade diária** | Tela em que o gerente escolhe o dia, vê a demanda futura, marca quem vai trabalhar e confere se a equipe atende o prazo. Quem comparece gera **contas a pagar** e recebe **Pix** no fim do dia | ainda não existe |
| **Comparecimento** | Confirmação de que o técnico marcado na grade veio trabalhar naquele dia | ainda não existe |
| **Contas a pagar do técnico** | Título no valor contratado do dia, para quem compareceu. Pago via **Pix ao técnico** (não é o QR Pix da OS do cliente) | ainda não existe |
| **Pix automático (saída)** | Conexão do sistema com o banco (ou intermediário) para **enviar** Pix: pagar o técnico e reembolsar o cliente. Não é o QR Pix da OS | ainda não existe |
| **Reembolso ao cliente** | Devolução de valor ao cliente, acionada na OS. Só sai com **aprovação do administrador**, via Pix. Distinto do **estorno de cartão** na maquininha | ainda não existe |
| **Revisor** | Quem faz o controle de qualidade (hoje papel de atendente) | `user` |
| **Diário de bordo** | Registro do que cada técnico produziu: OS, descrição do serviço, hora de início e fim, quantidade de peças e dificuldade. Substitui o caderno | ainda não existe |

## Status e fluxo

| Termo | Significado |
|---|---|
| **Status** | A situação da OS no fluxo. Cada status tem nome interno, nome para o cliente e é **público** ou **interno** |
| **Status público** | O cliente enxerga. Ex.: "Em produção", "Aguardando prova" |
| **Aguardando prova** | Status público da pré-preparação. A peça espera o cliente para uma nova medição. **Mesma OS e mesma OP**. **Prova feita** volta para produção; a qualidade só entra no **Terminei** |
| **Status interno** | Só funcionários enxergam. O único previsto é "Reprovado pela qualidade" |
| **Catálogo de status** | Cadastro **configurável** de status, com parâmetros, para o sistema não ficar engessado |
| **Parâmetros de um status** | Nome interno e público; público ou interno; ordem; papel que pode atribuí-lo; exige leitura de QR; grava técnico e hora; dispara WhatsApp; tempo esperado e limite de alerta; é inicial; é final |
| **Sequência rígida** | Cada status só vai para o próximo. Não pula e não volta. A **reprovação** é a única exceção |
| **Reprovação** | O revisor reprova a OS no controle de qualidade. Status interno **Reprovado pela qualidade**. A sacola volta à esteira e a técnica que lê o QR **assume a refação** |
| **Em refação** | Status interno da OS reprovada, enquanto a técnica a refaz. Ao terminar, vai para Aguardando controle de qualidade |
| **Uma sacola por vez** | A técnica só abre outra sacola depois de terminar a anterior |
| **Avanço automático** | Ao ler o QR, a OS vai para o próximo status permitido ao papel de quem leu |
| **Refação** | Refazer o trabalho de uma OS reprovada, antes de entregar ao cliente |
| **Aviso "Falta pagamento"** | Alerta na tela da OS e da retirada quando há saldo em aberto. **Não é status** |

## Cliente, prazo e garantia

| Termo | Significado |
|---|---|
| **Link público** | Endereço seguro que o cliente recebe por WhatsApp. Sem login. Microformulário no celular: status, o combinado e botões (hoje **Recebi**; depois **Concordo**) |
| **Aprovação do cliente** | Assinatura de "concordo com o serviço e o preço" no **balcão**, no **papel** (foto da OS assinada) ou, depois, no **link**. **Não é status**. A medida usada fica travada |
| **Assinatura eletrônica** | Registro de aceite com data, hora, texto aceito e aparelho. É **evidência de aceite**, não substitui um certificado digital |
| **Retirada** | O cliente retira a peça. A atendente inicia a janela no balcão. No celular, o cliente aperta **Recebi** no link; sem celular, assina a OP e a foto vai para a OS. Sem clique, a atendente dá baixa no **Entregue** |
| **Tipo de entrega** | **Normal**: mesmo dia da semana da semana seguinte. **Expresso**: até 2 horas por peça, só no horário de funcionamento. **Urgente**: 2 ou 3 dias úteis (sugestão 3). Cada tipo tem **sobretaxa percentual** configurável. O sistema **sugere** a data e o atendente **pode alterar** |
| **Reconserto** | O cliente volta em até **7 dias corridos** da retirada reclamando de ajuste (curto ou largo). **Cliente voltou** cria `AAA000001-R` sem valor, mesma família, com o técnico da primeira vez. A OP leva o termo **Reconserto**. Depois do prazo a OS é cobrada (o gerente pode liberar sem valor, com motivo — ainda não) |
| **Garantia de serviço** | Depois do reconserto e até o prazo de execução da Conta (André quer **90 dias**; o cadastro da Conta é que vale), para defeito de execução. Mesma família, letra **G** (`AAA000001-G`), termo **Em garantia** na OP. **Não** é `G` na frente da placa. **Não** confundir com **Refação** (qualidade, mesma OS, versão da OP) nem com **prova** (mesma OS, mesma OP) |
| **Retirado** | Status público depois de **Entregar**. A data de retirada abre a janela de reconserto e garantia | `picked_up` |
| **Grupo de OS** | Versões e processos ligados da mesma OS (`AAA000001`, `AAA000001-1`, `AAA000001-C`): um só cliente, mesmo cabeçalho reaproveitado, cada uma com sua grade, sua sacola física e sua Ordem de Produção. Um só pagamento do grupo |
| **Limite de peças por versão** | Parâmetro da Conta (padrão 5). A atendente registra até esse limite, fecha a sacola e continua na próxima versão. Não é divisão automática no meio da digitação |
| **Sugestão de cadastro** | Nos campos de busca e nos que vêm de tabela, o sistema sugere o que já está cadastrado. Se não houver sugestão, **Cadastrar** aparece na caixinha de “Nenhum registro encontrado” |
| **Tela de parâmetros** | Tela onde o administrador altera as regras do sistema (graus e tempos, prazos, cortes, sobretaxas, status etc.), com histórico de quem mudou e quando |
| **Forma de pagamento** | No pagamento da OS, **Cartão** ou **Interno**. Cartão envia a cobrança à maquininha e pede **Crédito**, **Débito** ou **Pix**; essa escolha vai no pedido da Cielo para a maquininha abrir já nela. Interno é a baixa manual e pede **Dinheiro**, **Crédito**, **Débito** ou **PIX**, mais o motivo. O sistema grava quem baixou, quando, por quê e qual dessas formas foi usada. A baixa reduz o saldo e muda a condição de pagamento (parcial ou pago). O status operacional da OS não muda. O envio só habilita depois da subopção e, no interno, do motivo. O cartão continua exigindo terminal ativo | `payment_records.payment_method` |
| **Condição de pagamento** | Na OS e na OP: **Pago** quando o saldo em aberto é zero; saldo em aberto é o valor exigível ainda não recebido. Valor suspenso não entra nesse saldo. Em OS de retorno, a OP mostra **Reconserto**, **Em garantia** ou **Refação no balcão** no lugar dessa condição |
| **Pagamento integrado** | A partir da OS, o sistema aciona a maquininha com o valor da OS e acompanha o resultado pelo tempo máximo da Conta (padrão 3 minutos). Confirmado, a OS quita. Recusado ou cancelado, a OS não quita. Funciona de nuvem a nuvem, pela internet |
| **Tempo de espera da maquininha** | Quanto tempo o sistema consulta a maquininha depois de enviar a cobrança. Padrão 3 minutos, da Conta, entre 1 e 30. Quem grava pagamentos altera em Configurações → Pagamentos. O histórico guarda quem, quando, o valor anterior e o novo. A consulta continua a cada 5 segundos | `tenants.machine_wait_minutes` |
| **Estorno de cartão** | Devolução de um pagamento recebido ou liquidado. Só o papel Gerente, com a permissão de estorno e um motivo. O saldo da OS volta a ficar em aberto. No sandbox o valor não volta na maquininha; isso fica para a produção. Não é o reembolso via Pix |
| **Aprovação pendente** | OS cujo cliente ainda não assinou. Lista sempre visível e aviso diário ao atendente e ao gerente |
| **Filial padrão** | Primeira Filial filha, criada automaticamente quando a Empresa não tem nenhuma. Nome de tela: Matriz. Pode ser renomeada |
| **Entrega em domicílio** | Funcionalidade nova, **fora do piloto**, com preço por distância ou geolocalização |
| **Feriado** | Dia fechado, cadastrado por Filial. A regra de adiar ou antecipar a data está em aberto |

## Mensagens, privacidade e segurança

| Termo | Significado |
|---|---|
| **Mensagem de WhatsApp** | O cliente recebe **somente duas**: "OS aberta" e "Pronto para retirada". O resto ele acompanha pelo link público |
| **Modelo de mensagem** | Texto da mensagem, configurável, com variáveis (nome do cliente, nome do estabelecimento, link). O WhatsApp exige aprovação prévia |
| **API oficial do WhatsApp** | Forma autorizada de um sistema enviar mensagens sozinho. Exige cadastro da empresa, número vinculado e modelos aprovados. Paga por mensagem |
| **WhatsApp Web** | WhatsApp do celular aberto no computador. Feito para pessoas, não para sistemas |
| **Fila de mensagens** | As mensagens esperam numa fila e um "carteiro" as envia, com nova tentativa se falhar. Falhas vão para uma **lista de falhas** |
| **Consentimento** | Autorização do cliente, registrada com data e responsável. Sem ele, não se envia mensagem |
| **Controlador / operador (LGPD)** | O **ateliê** é o controlador dos dados dos clientes. O **ANEXSYS** é o operador |
| **Dado mínimo no link** | O microformulário mostra primeiro nome, número da OS, datas, status público, serviços, valores e pagamento. A via impressa fica num botão à parte. Endereço só existe quando há entrega em domicílio |
| **Isolamento por Conta** | Garantia de que uma Conta nunca vê dados de outra. Será reforçado no próprio banco de dados |
| **Responsável (menor de idade)** | Roupa infantil só com responsável cadastrado. Fotos só da peça, nunca da criança |

## Projeto

| Termo | Significado |
|---|---|
| **Ciclo** | Etapa curta de trabalho que termina em algo que o André consegue ver e testar |
| **Ambiente de testes (homologação)** | Endereço na nuvem onde o André valida cada ciclo, com dados de demonstração |
| **Piloto completo** | Entrada em produção só com financeiro (pagamento integrado na maquininha) e portal (o link público) prontos, prevista para março de 2027, **sem concierge nem fila de chegada**, com o sistema antigo em paralelo até o André ter confiança |
| **Homologar** | Testar e aprovar. O André é o homologador de tudo |
| **MVP** | Primeira versão utilizável. Aqui, equivale ao piloto completo |

## Formulários

Padrão dos cadastros. **Gravar** grava, atualiza a grade e fecha a aba do registro. A tela fica na aba que já estava ao lado. **Gravar e Continuar** faz a mesma gravação, fecha essa aba e abre um cadastro em branco pelo mesmo caminho do botão de adicionar. Se a validação falhar, a ficha permanece aberta. **Cancelar** sai sem gravar.

Na Ordem de Serviço o par vale só na gravação final da sacola fechada, e essa gravação imprime a OP. Com a sacola aberta, **Salvar** e **Salvar alterações** continuam gravando rascunho, sem imprimir a OP.

Ficam de fora deste par: **Vincular** em acesso, **Salvar horário** da filial, **Salvar e selecionar** ao escolher um cliente de dentro de outro formulário, **Cancelar** da qualidade e Comunidade.

| Termo | Significado |
|---|---|
| **Gravar** | Grava e fecha a aba deste registro. Na OS, é a gravação final da sacola fechada: imprime a OP, grava a OS e atualiza a grade |
| **Gravar e Continuar** | A mesma gravação. Em seguida fecha a aba e abre um cadastro em branco, pelo mesmo caminho do botão de adicionar |
