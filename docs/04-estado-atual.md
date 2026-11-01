# Estado atual do ANEXSYS

**Atualizado em:** 01/11/2026
**Substitui:** `PROJECT_IMPLEMENTATION_STATUS`, `CURRENT_APPLICATION_STATUS`, `CURRENT_REPOSITORY_STATUS`, `REPOSITORY_CODE_AUDIT_V1` e os relatórios de sprint (todos em `docs/arquivo/`), que se contradizem.

**Como ler:** cada item diz se algo foi **demonstrado numa tela**, **testado com banco de dados** e **aceito pelo André**.

**Aceite em 09/10/2026:** o envio pelo **WhatsApp Web** (mensagem certa, como no sistema atual) e o **link copiado na OS** estão validados. O microformulário do cliente existe, **ainda não abre no celular** (localhost); os botões (**Concordo**, etc.) entram depois, no mesmo endereço. O cálculo de prazo **Normal / Expresso / Urgente** está validado; os números ainda são fixos no código até o **painel de parâmetros**. **Aprovação na entrada da OS** (balcão e papel, sem mudar o status) entra agora para validar.

## 1. O que existe

| Área | Servidor | Tela | Testes | Observação |
|---|---|---|---|---|
| Login e acesso (Conta, Empresa, Filial, usuários, papéis, permissões) | Existe | Existe: login, escolha de Conta e Filial, **Contas / Empresas / Filiais**, horário da Filial, comunidades congeladas | Unitários passam; integração **43/43** (39 do Ciclo 0 + 4 do espelho no Ciclo 1) | Só o André cria Contas. Usuário novo sem Filial. Isolamento no banco (D2). **Dashboard** é chip fixo na barra superior, não aba |
| Clientes e medidas | Existe | Existe | Unitários e integração passam | WhatsApp obrigatório; endereço (incluindo CEP) obrigatório no cadastro; sem consentimento ainda |
| Ordem de Serviço (lista, formulário, vários itens, detalhe) | Existe | Existe | Unitários e integração passam | Formulário compacto: **Cliente** primeiro; bloco da OS em caixas (identificação, previsão, responsáveis). Sem Empresa/Filial na ficha. **Status**, Entrada, Saída e **Aprovação** (data e hora) na mesma linha. Bloco **Pagamento** com condição, já pago, em aberto, histórico, formas de balcão e aviso **Falta pagamento**. Marca obrigatória; modelo e série opcionais. Valor/desconto no formato de dinheiro. **Preço** no cadastro do par produto + serviço; a lista de Preços recarrega ao voltar do cadastro. Na OS o serviço só lista o que está vinculado ao produto e sugere o preço (alterável). O campo livre da linha é **Detalhamento do ajuste**; o mouse em cima abre o texto. O tempo previsto da combinação **não** entra no Normal / Expresso / Urgente. **Salvar** aberto = rascunho; fechado = imprime OP. **Abrir nova versão** só na grade. **Recalcular prazo** na previsão. **Aprovação** no rodapé e no **⋮**: **Concordou** (balcão), **Assinado no papel** (foto) e **Liberar produção** com motivo. **Anexo** fora do **⋮**, depois do menu na grade (consulta, não ação operacional): cinza sem foto, em destaque com foto. Clica e as duas categorias abrem na própria lista, sem abrir a ficha da OS. A OS continua **Em aberto**. A medida usada fica travada. **Concordo** no celular entra depois no mesmo link |
| Pegar sacola (esteira manual) | Existe (`POST /service-orders/:id/floor-advance`) | Existe: **Operações → Pegar sacola** | Unitários passam | Lista só **Aberta** (Pegar sacola) e **Em produção** (Terminei). Uma sacola por vez. QR futuro dispara o mesmo passo |
| Motor de data de entrega | Existe (domingo fechado por padrão) | Existe: tipo Normal/Expresso/Urgente e **Recalcular prazo** | Unitários passam | **Validado pelo André (09/10):** Normal = +7 dias (mesma weekday); Urgente = 3 dias úteis; Expresso = 2 h por peça. Atendente pode ajustar. **Painel de parâmetros** (mudar esses prazos) entra depois |
| Ordem de Produção, QR por ordem, diário | Existe | Impressão A5 a partir da OS | Unitários passam | Papel A5: placa no cabeçalho e no QR; Pago ou Pagar na retirada no cabeçalho; tabela S / Produto / Serviço / Detalhamento do ajuste (fonte 15 px, 3 linhas); bloco Retirada (Nome, Data, Assinatura); marca/modelo/série pequenos; previsão enorme na prateleira. Reprovação sai como **Refazer**; anotação de prova sai como **Prova**, sem sobrescrever o Detalhamento do ajuste. Sem preço e sem quantidade. Tela de OP ainda não existe |
| Qualidade, retrabalho, garantia | Existe | Tela **Controle de qualidade**; na OS: **Retirada**, **Refação no balcão**, **Cliente voltou**, **Enviar para prova** e **Prova feita** | Unitários passam | Qualidade: lista só **Aguardando controle de qualidade**. Botão **Revisar**. Reimpressão da OP no **⋮**. Revisão peça a peça; OS permanece em qualidade se houver reprovação; OP de refação só com as peças reprovadas. **Prova** usa a mesma OS e a mesma OP; **Prova feita** abre **Anotações de prova**. **Retirada** abre janela de 10 min (gancho do **Recebi**), aceita foto + **Entregue assinado**, ou **Entregue** do atendente. **Refação no balcão** (Pronto para retirada) abre `AAA000001-C` na mesma família; a mãe fica parcial e sem Pagar. **Cliente voltou** depois do Retirado abre `-R` / `-G` (cobrada ainda é placa nova). WhatsApp oficial ainda não |
| Financeiro | Existe | **Pagar** na OS e na lista | Unitários passam | Balcão sem gateway: forma, valor, histórico e aviso **Falta pagamento**. Na grade, **Pagar** abre na frente (como o Anexo) e some quando a OS está quitada ou quando a mãe tem filha de processo aberta; filtro Em aberto / Pago. O pagamento soma o **grupo**. Não cobra na Cielo e não abre Pix. Entrega só bloqueia se a Conta marcar **Bloquear entrega por inadimplência**. Parcelas e gerente liberar entram depois |
| Fiscal | Só esqueleto | **Não existe** | Idem | Nenhum adaptador real |
| Retirada por terceiros e custódia | Existe | **Não existe** | Idem | Aviso "enviado" é só um registro, não envio |
| Concierge e portal do cliente | Existe | Página pública `/os/{token}` | Unitários passam | **Validado em parte (09/10):** o link é copiado na OS. Microformulário (status, peças, **Recebi**) ainda não abre no celular (localhost). **Concordo** e novos botões no mesmo endereço, depois |
| **WhatsApp** | Envio via **WhatsApp Web** (`wa.me`) | Menu **Por WhatsApp** na OS | Unitários passam | **Validado pelo André (09/10):** conecta no WhatsApp Web e manda a mensagem certa, como no sistema atual. API oficial da Meta fica para depois |
| Migração/importação de dados | **Não existe** | **Não existe** | n/a | |
| LGPD (aviso, canal do titular, prazo do link) | Existe | Existe: **Privacidade**, **Pedidos do titular**, **Tratamento de dados**, **Incidentes**, **Treinamento** | Unitário do prazo do link | O aviso e o termo do celular saem da tela. O link expira depois da retirada + garantia + margem. A guarda de inativos fica registrada e **não apaga** cadastro sozinha. Importação já está em Integrações. Backup e advogado continuam fora |
| Cobrança do ANEXSYS | **Não existe** | **Não existe** | n/a | |

## 2. Números verificados em 05/10/2026 (noite, fechamento dos Ciclos 0 e 1)

- **20 módulos** no servidor e **18 migrações** de banco.
- **Testes unitários:** **110 passam, 0 falham.**
- **Testes de integração com PostgreSQL:** **43 passam, 0 falham** (39 do Ciclo 0 + 4 do teste do espelho / multiempresa).
- **Compilação do servidor:** `tsc` + `tsc-alias` (o `nest build` quebra neste Node; o atalho `npm run build` usa o caminho que funciona).
- **Verificação de qualidade do frontend (lint):** **2 erros que já existiam** antes deste ciclo, em `customer-workspace.tsx` e `service-orders-workspace.tsx` (aviso de boa prática de programação; não impedem o uso).

## 3. Testes de integração com banco de dados

Estes testes sobem o servidor com um banco PostgreSQL real.

- **Resultado:** **43 dos 43 casos passam** (39 do Ciclo 0 + 4 do Ciclo 1: horário da Filial, teste do espelho, comunidades congeladas / usuário sem Filial, horário editável e relatório de isolamento).
- **O que estava quebrado no Ciclo 0:** o cadastro de cliente passou a exigir endereço completo (incluindo CEP) e o preparo dos testes antigos não enviava esses campos. A suíte da Sprint 2 também recusava duas medidas na mesma unidade (CM) por um erro de conferência de IDs repetidos — a regra ("unidade tem que existir na Conta") foi mantida; a conferência agora trata IDs repetidos. A suíte da Sprint 10 usava data de retirada de setembro, fora da janela de 7 dias da garantia em outubro; o teste passou a usar a data de hoje, **sem** alargar os 7 dias. A suíte de identidade escolhia a Conta errada porque o login, sem preferência, ordena pelo nome: o nome de exibição da segunda Conta foi ajustado no teste para "Unidade Filial", para a "Matriz" continuar sendo a primeira.
- **Como rodar:** PostgreSQL no ar (`DB_PASSWORD=postgres` por padrão nos testes) e `npm run test:integration`. O `README.md` descreve o ambiente local. **A conta na nuvem continua com o André.**

## 4. Falhas de segurança conhecidas

| Falha | Situação |
|---|---|
| Criação pública de Conta (`POST /tenants`) | **Corrigida neste ciclo**: exige a permissão `platform.tenants.create` |
| Senhas, e-mails e segredos de exemplo nos guias e scripts | **Corrigido neste ciclo**: scripts exigem variáveis de ambiente; guias antigos foram higienizados |
| Sem limite de tentativas de login | **Corrigido neste ciclo**, em memória (vale por instância do servidor) |
| Sessão guardada em `localStorage` do navegador | Aberta. Será trocada por cookie seguro |
| Sem recuperação de senha; convite devolve o token em vez de enviar por e-mail | Aberta. Depende do provedor de e-mail |
| Isolamento entre Contas só por filtro no código | **Reforçado no Ciclo 1**: porteiro no banco (RLS) + relatório de isolamento |
| QR com código previsível em parte e guardado em texto claro | Aberta. Será assinado (Ciclo 3) |
| Registro "enviado" sem envio | Aberta. Será resolvido com o WhatsApp real (Ciclo 5) |

## 5. O que muda neste ciclo (Ciclos 0 e 1)

O Ciclo 0 fechou documentação única, segurança rápida, testes de integração e o README de como rodar na máquina. **O Ciclo 1** acrescenta Conta / Empresa / Filial padrão, horário e corte configuráveis, isolamento no banco e permissão só de papel + escopo. **Continua com o André:** conta na nuvem (até R$ 150/mês), DNS de `atelierizagusmao.com.br`, Meta e Cielo. Ver `05-plano-de-continuidade.md` para os próximos ciclos.
