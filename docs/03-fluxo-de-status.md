# Fluxo de status da Ordem de Serviço

**Atualizado em:** 01/11/2026
**Substitui:** os ciclos de vida de status da documentação antiga (`docs/arquivo/`). Baseado em `02-decisoes-do-andre.md`.
**Situação:** o fluxo abaixo é o **desenho decidido**. **Ainda não está construído**: hoje o sistema só tem os status Em aberto, Aprovada e Cancelada para a OS. Os pontos que estavam **em aberto** foram resolvidos nas rodadas 2 e 3 de respostas do André.

## 1. O caminho da OS, do balcão à retirada

```
ATENDIMENTO            APROVAÇÃO               SACOLA + OP IMPRESSA       PRODUÇÃO               QUALIDADE             RETIRADA
Cliente chega,    ->   Cliente assina   ->    Peças vão numa sacola  ->  Técnico lê o QR   ->   Revisor lê o QR  ->  Cliente retira e assina
mede, OS é aberta      (link, balcão ou       (limite por versão)        ao pegar e ao          ao pegar; aprova      a Ordem de Produção
e vai por WhatsApp     papel)                 impressa no bolso          terminar               ou reprova            em papel
(Em aberto)                                   (QR grande)
```

## 2. Etapas, em palavras

1. **Atendimento e abertura da OS.** O atendente cadastra o cliente (nome e WhatsApp obrigatórios), as peças e os serviços. A OS nasce com o status **Em aberto** (público). Não há etiqueta nem leitura de QR nesta etapa. O sistema envia a **primeira mensagem de WhatsApp** com o **link público** de acompanhamento e aprovação.
2. **Medição das roupas.** Acontece no atendimento. **Não é status**, não gera QR e não manda WhatsApp.
3. **Aprovação do cliente.** O cliente **assina** "concordo com o serviço e o preço" no **balcão** ou no **papel** (foto da OS assinada). O **Concordo** no link entra depois, no mesmo endereço. **Não é status**: a OS continua **Em aberto**. A medida usada fica travada. A produção **pode começar sem assinatura**, com **liberação e motivo**.
4. **Sacola e esteira.** A sacola é só o transporte físico. Cada **versão da OS** aceita até o limite parametrizado (padrão 5) e cada linha é uma peça. **Fechar sacola** trava a versão. **Salvar** com a sacola fechada imprime a **Ordem de Produção** para o bolso transparente. **Abrir nova versão** + **Salvar** abre a próxima versão ligada em outra aba. A sacola vai para a esteira "a fazer", por ordem de chegada.
5. **Produção.** O técnico pega a sacola em **Operações → Pegar sacola** (fluxo manual permanente) ou **lê o QR** (quando existir). Os dois disparam o mesmo passo. O status passa a **Em produção** (público). Ao terminar, **Terminei** (ou a segunda leitura) leva a sacola à esteira de finalizadas. O status passa a **Aguardando controle de qualidade** (público). Se a peça precisa de prova, **Enviar para prova** (⋮ na esteira ou botão na OS) vai para **Aguardando prova** na **mesma OS e na mesma OP**.
6. **Prova / pré-preparação.** Status **público**. É uma **nova medição** depois do corte e da modelagem. A sacola espera o cliente; **não** entra na esteira de Pegar sacola. **Prova feita** pede **Anotações de prova** (opcional, por peça) e volta **sempre** para **Em produção**, na mesma OP. Se houver texto, a OP é reimpressa com o marcador **Prova**. A qualidade só entra quando a técnica clica **Terminei**. WhatsApp 3 ainda não.
7. **Controle de qualidade.** O revisor abre a OS na tela **Controle de qualidade** (ou lê o QR, quando existir) e avalia **peça a peça**. A lista mostra só **Aguardando controle de qualidade**. Se **todas** forem aprovadas, a OS vai para **Pronto para retirada**. Se uma ou várias forem reprovadas, a **OS original permanece em Controle de qualidade** e nasce uma **nova versão da OP só com as peças reprovadas**, para voltar à esteira de produção. A esteira de produção fica em **Pegar sacola** (Aberta → Terminei), não na OS.
8. **Pronto para retirada.** Status **público**. Sai a **segunda mensagem de WhatsApp**.
9. **Retirada.** A atendente **inicia a retirada** na OS (janela de 10 min). No **mesmo link**, o cliente pode apertar **Recebi**. Sem celular, assina a OP e a atendente anexa a foto (**Entregue assinado**). Sem clique, a atendente dá baixa no **Entregue**. Status **Retirado pelo cliente**. WhatsApp oficial e a página pública do link entram depois.

## 3. Catálogo inicial de status

| # | Status | Visibilidade | Quem lê o QR | Vai para | Observações |
|---|---|---|---|---|---|
| 1 | Em aberto | Público | Ninguém (nasce na criação) | Em produção | WhatsApp 1. A aprovação do cliente não muda o status |
| 2 | Em produção | Público | Técnico, ao pegar a sacola | Aguardando controle de qualidade **ou** Aguardando prova | **Terminei** vai para qualidade. **Enviar para prova** usa a mesma OP |
| 3 | Aguardando prova | Público | Ninguém nesta fase | Em produção (**Prova feita**) | Nova medição. Mesma OS, mesma OP. Anotações de prova opcionais. Qualidade só no Terminei. WhatsApp 3 ainda não |
| 4 | Aguardando controle de qualidade | Público | Técnico, ao terminar | Controle de qualidade | |
| 5 | Controle de qualidade | Público | Revisor | Pronto para retirada quando **100% das peças** estão aprovadas | Reprovação **não** muda o status da OS |
| 6 | Pronto para retirada | Público | Ninguém | Retirado pelo cliente | WhatsApp 2 |
| 7 | Retirado pelo cliente | Público | Atendente, na retirada | Fim (ou **Cliente voltou**, que abre OS filha) | Janela + **Recebi** (link), papel com foto, ou **Entregue** do atendente |
| — | Refação | **Interno (OP)** | Técnica que fará a refação | Volta para a qualidade na **mesma OS** | Não é status da OS. É uma **versão da OP** só com as peças reprovadas. O cliente continua vendo Controle de qualidade |

## 4. Regras do catálogo de status

1. **Configurável.** Cada status tem parâmetros: nome interno; nome para o cliente; público ou interno; ordem; papel que pode atribuí-lo; se exige leitura de QR; se grava técnico e hora; se dispara mensagem de WhatsApp; tempo esperado e limite de alerta; se é inicial; se é final. O sistema não deve ser engessado.
2. **Sequência rígida.** Cada status só vai para o **próximo**. **Não pula, não volta.** Duas exceções, sem misturar: a **reprovação** permanece em Controle de qualidade e gera **nova versão da OP**; a **prova** usa a **mesma OP** e **Prova feita** devolve à esteira para terminar depois da nova medição. A qualidade só entra no **Terminei**.
3. **Quem avança.** Só o papel responsável pelo status. Quem produz (técnicas) avança os status de produção. Quem revisa (atendentes) avança o controle de qualidade.
4. **Leitura do QR: avanço automático.** O funcionário lê o QR no celular, com login próprio, e o sistema leva a OS ao **próximo status permitido ao papel de quem leu**. Se o papel não puder, o sistema **recusa e explica**. **Decidido em 05/10/2026** (substitui o "modo estação").
5. **Uma sacola por vez.** A técnica **só abre outra sacola** (lê o QR de outra OS) **depois de terminar a anterior**. O limite é configurável por papel (hoje 1).
6. **Cliente.** Vê **a última fase pública atingida**, com as datas, no link público. Em "Reprovado pela qualidade" continua vendo "Controle de qualidade".
7. **Refação.** Só as peças reprovadas voltam para a esteira, numa **nova versão da OP** (versão 2, 3…). A OS original **continua em Controle de qualidade**. Quando a sacola retorna, o revisor puxa a **mesma OS**; a tela mostra a versão da refação para aprovar ou reprovar de novo. 100% aprovado avança a OS; nova reprovação gera a próxima OP.
8. **Aviso de pagamento.** Se há saldo em aberto, a OS e a retirada mostram **"Falta pagamento"**. **Não é status.** A entrega só bloqueia se a Conta estiver com **Bloquear entrega por inadimplência**. Liberação do gerente com motivo entra depois.
9. **Mensagens.** O combinado antigo era WhatsApp só em **Em aberto** e **Pronto para retirada**. O **link público** (`/os/{token}`) abre o formulário no celular: status, o combinado, **Concordo** e **Recebi** quando o balcão libera. O aviso e o termo saem da tela **Privacidade**. Depois da retirada, o link vale a garantia de execução mais a margem configurada; no dia seguinte ele avisa que expirou. O envio oficial do WhatsApp entra depois; a atendente copia o link na OS. Só envia com **consentimento registrado**.

## 5. Reconserto e garantia

Há **dois prazos diferentes**, ambos contados **da retirada pelo cliente** (decidido em 05/10/2026), pelos parâmetros da Conta:

- Prazo de **ajuste** (reconserto; padrão 7 dias).
- Prazo de **execução** (garantia de defeito; o André quer 90; o cadastro da Conta é que vale).

Isto **não** é a versão `-1` da sacola e **não** é a refação da qualidade.

**Retirada:** Pronto para retirada → janela de 10 min → **Recebi** no link, **Entregue assinado** com foto, ou **Entregue** do atendente. Grava o método.

**Refação no balcão:** o cliente prova e recusa peça **antes de levar**. Mesma família, letra **C**. A mãe fica parcial (não Retirado). Pagar só na filha; as duas saem Pago juntas.

**Cliente voltou:** depois do Retirado. Reconserto `-R` e garantia `-G` na mesma família. Cobrada (fora do prazo) ainda abre placa nova.

- Dentro do ajuste: sem valor; OP com **Reconserto**.
- Depois do ajuste e dentro da execução: sem valor; OP com **Em garantia**.
- Fora dos dois: **cobrada** (Pago / Pagar na retirada). Liberação do gerente com motivo **ainda não**.

## 6. Prazo de entrega

- **Horário de funcionamento (Filial padrão):** segunda a sexta, 9h30 às 18h; sábado, 9h30 às 14h; domingo fechado. **Dia útil** = dia em que a Filial funciona (segunda a sábado, exceto feriados fechados).
- **Normal:** mesmo dia da semana da semana seguinte (segunda para segunda; vale sábado). **Feriado:** o sistema **sugere o próximo dia útil** e o **atendente decide** caso a caso.
- **Expresso:** até 2 horas por peça, contadas **só no horário de funcionamento**. O que não couber **passa para a abertura do dia seguinte**.
- **Urgente:** o atendente escolhe **2 ou 3 dias úteis**, com **sugestão de 3**.
- **Sobretaxa:** **percentual configurável por tipo** de entrega.
- O sistema **sugere** a data e o atendente **pode alterar**. Feriados são cadastrados por Filial.
- **Hora de corte:** o **próprio fechamento** (18h de segunda a sexta; 14h no sábado). Uma OS aberta depois do fechamento conta como aberta no próximo dia útil.
- **Todos esses valores são parâmetros** editáveis numa tela de parâmetros.

## 7. O que a produção mede

- Cada **versão da OS** guarda as peças até o limite parametrizado (padrão 5), uma peça por linha. Mais peças: fecha a sacola, marca **Abrir nova versão** e **Salvar**. Se errou, **Abrir sacola**. O **grau de dificuldade de 1 a 4** é definido **por serviço** (valor padrão no catálogo). **A OS mostra a maior** dificuldade entre os serviços, e o **atendente pode ajustar**.
- **Tempos médios por grau:** grau 1 = 30 minutos, grau 2 = 60, grau 3 = 90, grau 4 = 180. **Os graus são configuráveis** (aumentar ou diminuir graus, mudar tempos) na tela de parâmetros.
- Isso permite estimar o **tempo médio**, dimensionar a **grade de técnicos** e calcular o **bônus por produtividade**.
- O **diário de bordo** mostra a **descrição do serviço** de cada peça, no lugar do caderno.

## 8. Aprovação e retirada

- **Aprovação do cliente** ("concordo com o serviço e o preço"): nesta fase, **balcão** (**Concordou**) e **papel** (foto da OS + **Assinado no papel**). O **Concordo** no celular entra depois no mesmo link. **Não é status.** A produção **pode começar sem assinatura**, com **Liberar produção** e **motivo**.
- **Aprovação pendente:** o sistema **avisa todos os dias**, **até o cliente assinar**, o **atendente e o gerente**, e mantém uma **lista sempre visível** na tela. Não é por prazo.
- **Retirada (decidido em 09/10/2026):** digital no **mesmo link** (**Recebi** só com janela aberta no balcão), papel com foto, e **Entregue** do atendente se o cliente não clicou. API do WhatsApp depois.
- **Entrega em domicílio:** depois do piloto; por ora só um marcador e o endereço opcional.

## 9. Tela de parâmetros

**Para todas as regras deve existir uma tela de parâmetros**, administrável pelo André: graus de dificuldade e tempos, logística de produção, prazos, cortes, sobretaxas, status, alertas, garantia e reconserto, pagamento, mensagens e link público. Cada alteração registra **quem mudou, quando e os valores anterior e novo**.
