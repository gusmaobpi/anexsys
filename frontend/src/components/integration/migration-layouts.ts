export type MigrationColumn = {
  header: string;
  required: "Sim" | "Não";
  example: string;
  hint: string;
};

export type MigrationLayout = {
  href: string;
  kind?: string;
  menuLabel: string;
  hint: string;
  title: string;
  fileName: string;
  summary: string;
  columns: MigrationColumn[];
  exampleRows: string[][];
};

const ORDER_NOTE =
  "Preencha nesta ordem: partes do corpo, unidades de medida, produtos, serviços, preços, valor por minuto, usuários e acessos, clientes, medidas e, por último, as ordens de serviço. O código no sistema antigo liga o cliente às medidas e às ordens.";

const UPSERT_NOTE =
  "Se o cadastro não existe, a linha cria. Se já existe e não está em uma ordem de serviço, a linha atualiza. Se já está em uma ordem de serviço, a linha não altera e avisa.";

function col(header: string, required: "Sim" | "Não", example: string, hint: string): MigrationColumn {
  return { header, required, example, hint };
}

function rowsFromColumns(columns: MigrationColumn[], extra: string[][] = []): string[][] {
  return [columns.map((column) => column.example), ...extra];
}

const customerColumns: MigrationColumn[] = [
  col("Código no sistema antigo", "Sim", "CLI-1001", "Chave deste cliente. Repita o mesmo código nas medidas e nas ordens."),
  col("Tipo de cliente", "Sim", "Pessoa", "Pessoa ou Empresa."),
  col("Status", "Sim", "Ativo", "Ativo, Inativo ou Bloqueado."),
  col("Nome completo / razão social", "Sim", "Maria Silva", "Nome que aparece na ordem de serviço."),
  col("Nome fantasia", "Não", "", "Opcional. Para empresa, o nome fantasia."),
  col("Celular / WhatsApp", "Sim", "11999998888", "DDD e número, só dígitos."),
  col("CPF ou CNPJ", "Não", "12345678901", "Só dígitos. CPF da pessoa ou CNPJ da empresa."),
  col("Autoriza aviso por WhatsApp", "Sim", "Sim", "Sim ou Não."),
  col("E-mail", "Não", "maria@email.com", "Opcional."),
  col("Data de nascimento", "Não", "1980-05-12", "AAAA-MM-DD. Vazio se não houver."),
  col("CEP", "Sim", "01310100", "8 dígitos, só números."),
  col("Rua", "Sim", "Rua Augusta", "Logradouro."),
  col("Número", "Sim", "100", "Número do endereço. Use S/N se não houver."),
  col("Complemento", "Não", "Apto 12", "Opcional."),
  col("Bairro", "Sim", "Consolação", ""),
  col("Cidade", "Sim", "São Paulo", ""),
  col("Estado", "Sim", "SP", "Duas letras."),
  col("País", "Sim", "Brasil", ""),
  col("Observações", "Não", "", "Opcional."),
];

const bodyPartColumns: MigrationColumn[] = [
  col("Nome", "Sim", "Cintura", "Nome da parte do corpo, como na ficha de medidas. Um nome por linha."),
];

const unitColumns: MigrationColumn[] = [
  col("Código", "Sim", "CM", "Sigla usada na medida. CM é o padrão."),
  col("Nome", "Sim", "Centímetro", "Nome exibido da unidade."),
];

const productColumns: MigrationColumn[] = [
  col("Nome", "Sim", "Calça", "Nome do produto. O preço e a ordem de serviço usam este nome, idêntico."),
  col("Ordem", "Não", "1", "Número para ordenar a lista. Vazio entra como 0."),
];

const serviceColumns: MigrationColumn[] = [
  col("Nome", "Sim", "Bainha", "Nome do serviço. O preço e a ordem de serviço usam este nome, idêntico."),
  col("Ordem", "Não", "1", "Número para ordenar a lista. Vazio entra como 0."),
  col("Grau de dificuldade", "Não", "2", "1, 2, 3 ou 4. Vazio deixa o serviço sem grau."),
];

const priceColumns: MigrationColumn[] = [
  col("Produto", "Sim", "Calça", "Nome do produto. Se não existir, a linha cadastra."),
  col("Ordem do produto", "Não", "1", "Vazio não altera o produto que já existe."),
  col("Serviço", "Sim", "Bainha", "Nome do serviço. Se não existir, a linha cadastra."),
  col("Ordem do serviço", "Não", "1", "Vazio não altera o serviço que já existe."),
  col("Grau de dificuldade", "Não", "2", "1, 2, 3 ou 4. Vazio não altera o serviço que já existe."),
  col("Preço sugerido", "Sim", "80,00", "Valor com vírgula. Se o par já existe e não está em uma ordem, atualiza."),
  col("Tempo previsto (minutos)", "Sim", "30", "Número inteiro, no mínimo 1."),
];

const minuteRateColumns: MigrationColumn[] = [
  col("Empresa", "Sim", "Ateliê", "Nome da empresa já cadastrada no ANEXSYS."),
  col("Valor por minuto", "Sim", "1,50", "Reais por minuto, com vírgula."),
];

const userColumns: MigrationColumn[] = [
  col("Nome exibido", "Sim", "Ana Atendente", "Nome que aparece na ordem e na produção."),
  col("E-mail", "Sim", "ana@atelier.local", "Login. A ordem de serviço aponta o atendente por este e-mail."),
  col("Senha inicial", "Sim", "Troque-esta-senha", "Mínimo de 8 caracteres. Troque depois do primeiro acesso. Não envie este arquivo."),
  col("Papel", "Sim", "Atendente", "Recepção, Atendente, Produção, Qualidade ou Gerente."),
  col("Filial", "Sim", "Matriz", "Nome da filial já cadastrada. Use Matriz se não tiver renomeado."),
  col("Todas as filiais", "Sim", "Não", "Sim ou Não. Sim só para quem administra mais de uma filial."),
];

const measurementColumns: MigrationColumn[] = [
  col("Código do cliente no sistema antigo", "Sim", "CLI-1001", "O mesmo código da planilha de clientes."),
  col("Data da medição", "Sim", "2026-10-01", "AAAA-MM-DD."),
  col("Parte do corpo", "Sim", "Cintura", "Nome idêntico ao cadastro de partes do corpo."),
  col("Valor", "Sim", "86", "Número. Use vírgula se houver decimal."),
  col("Unidade", "Não", "CM", "Código da unidade. Vazio usa CM."),
  col("Observações", "Não", "", "Opcional, desta medida."),
];

function embeddedCustomerColumns(statusHeader: "Status" | "Status do cliente"): MigrationColumn[] {
  return customerColumns
    .filter((column) => column.header !== "Código no sistema antigo")
    .map((column) => {
      if (column.header === "Status") {
        return col(statusHeader, column.required, column.example, "Ativo, Inativo ou Bloqueado.");
      }
      if (column.header === "Observações") {
        return col("Observações do cliente", column.required, column.example, "Opcional.");
      }
      return column;
    });
}

const measurementImportColumns: MigrationColumn[] = [
  ...measurementColumns,
  col("Nome da unidade", "Não", "Centímetro", "Vazio não altera a unidade que já existe. Na criação, o nome acompanha o código."),
  ...embeddedCustomerColumns("Status"),
];

const OS_STATUSES: Array<{ slug: string; label: string; note: string }> = [
  { slug: "aberta", label: "Aberta", note: "Ordens em aberto no balcão, ainda sem produção." },
  { slug: "aprovada", label: "Aprovada", note: "Ordens que o sistema antigo marca como aprovadas e que ainda não entraram em produção." },
  { slug: "em-producao", label: "Em produção", note: "A sacola já foi pega por uma técnica." },
  { slug: "aguardando-prova", label: "Aguardando prova", note: "A peça saiu para o cliente provar e ainda volta." },
  { slug: "aguardando-qualidade", label: "Aguardando controle de qualidade", note: "A produção terminou e a sacola está na esteira da qualidade." },
  { slug: "qualidade", label: "Controle de qualidade", note: "O revisor já pegou a sacola." },
  { slug: "em-refacao", label: "Em refação", note: "A qualidade reprovou e a peça voltou para refação." },
  { slug: "pronta", label: "Pronto para retirada", note: "A peça está pronta e o cliente ainda não retirou." },
  { slug: "retirada", label: "Retirado", note: "O cliente já retirou. Preencha a data da retirada." },
  { slug: "cancelada", label: "Cancelada", note: "Ordens canceladas que precisam continuar no histórico." },
];

function serviceOrderColumns(statusLabel: string): MigrationColumn[] {
  const pickedUp = statusLabel === "Retirado";
  const approval = statusLabel === "Aberta" || statusLabel === "Cancelada" ? "Pendente" : "Concordou no balcão";
  return [
    col("Número no sistema antigo", "Sim", "4521", "Número da ordem no sistema antigo. Repita o mesmo número em cada peça."),
    col("Código do cliente no sistema antigo", "Sim", "CLI-1001", "O mesmo código da planilha de clientes. Se não existir, a linha cadastra o cliente."),
    ...embeddedCustomerColumns("Status do cliente"),
    col("Filial", "Sim", "Matriz", "Nome da filial já cadastrada."),
    col("E-mail do atendente", "Sim", "ana@atelier.local", "E-mail do atendente. Se não existir, a linha cadastra o usuário."),
    col("Nome exibido", "Não", "Ana Atendente", "Obrigatório se o e-mail do atendente ainda não existe."),
    col("Senha inicial", "Não", "", "Obrigatória só na criação do atendente. Mínimo de 8 caracteres. Se o e-mail já existe, a senha não muda."),
    col("Papel", "Não", "Atendente", "Obrigatório só na criação. Recepção, Atendente, Produção, Qualidade ou Gerente."),
    col("Todas as filiais", "Não", "Não", "Obrigatório só na criação. Sim ou Não."),
    col("Data de entrada", "Sim", "2026-10-01", "AAAA-MM-DD."),
    col("Tipo de entrega", "Sim", "Normal", "Normal, Expresso ou Urgente."),
    col("Data prevista", "Sim", "2026-10-08", "AAAA-MM-DD."),
    col("Hora prevista", "Não", "18:00", "HH:MM. Vazio deixa sem hora."),
    col("Grau de dificuldade", "Não", "2", "1, 2, 3 ou 4. Vazio usa o maior grau dos serviços da ordem."),
    col("Aprovação", "Sim", approval, "Pendente, Concordou no balcão, Assinado no papel ou Produção liberada."),
    col("Situação do pagamento", "Sim", pickedUp ? "Pago" : "Saldo em aberto", "Pago ou Saldo em aberto."),
    col("Valor recebido", "Não", pickedUp ? "160,00" : "0,00", "Soma já recebida desta ordem, com vírgula."),
    col("Forma de pagamento", "Não", pickedUp ? "Dinheiro" : "", "Dinheiro, Cartão, Pix, Transferência ou Outro. Vazio se nada foi recebido."),
    col("Modalidade do cartão", "Não", "", "Só quando a forma é Cartão: Crédito, Débito, Pix ou Voucher."),
    col("Data da retirada", pickedUp ? "Sim" : "Não", pickedUp ? "2026-10-20" : "", "AAAA-MM-DD. Obrigatória no status Retirado."),
    col("Observação comercial", "Não", "", "Uso interno."),
    col("Observação para o cliente", "Não", "", "Texto que o cliente pode ver."),
    col("Status", "Sim", statusLabel, "Já vem preenchido. Mantenha este status em todas as linhas deste arquivo."),
    col("Peça", "Sim", "1", "Número da peça na ordem, de 1 a 5."),
    col("Produto", "Sim", "Calça", "Nome do produto. Se não existir, a linha cadastra."),
    col("Ordem do produto", "Não", "1", "Vazio não altera o produto que já existe."),
    col("Serviço", "Sim", "Bainha", "Nome do serviço. Se não existir, a linha cadastra."),
    col("Ordem do serviço", "Não", "1", "Vazio não altera o serviço que já existe."),
    col("Grau do serviço", "Não", "2", "1, 2, 3 ou 4. Vazio não altera o serviço que já existe."),
    col("Preço sugerido", "Não", "80,00", "Preenche o preço do catálogo. Informe também o tempo previsto."),
    col("Tempo previsto (minutos)", "Não", "30", "Obrigatório quando o preço sugerido estiver preenchido."),
    col("Detalhamento do ajuste", "Sim", "Encurtar 2 cm", "Texto da peça, o que foi combinado."),
    col("Marca", "Sim", "Sem marca", "Obrigatória. Use Sem marca quando o sistema antigo não tiver."),
    col("Modelo", "Não", "", "Opcional."),
    col("Série", "Não", "", "Opcional."),
    col("Quantidade", "Sim", "1", "Número maior que zero."),
    col("Valor unitário", "Sim", "80,00", "Preço da peça, com vírgula. Pode ser diferente do preço sugerido."),
    col("Desconto", "Não", "0,00", "Desconto da peça, com vírgula."),
  ];
}

function secondPieceRow(columns: MigrationColumn[]): string[] {
  return columns.map((column) => {
    if (column.header === "Peça") return "2";
    if (column.header === "Produto") return "Saia";
    if (column.header === "Serviço") return "Barra";
    if (column.header === "Detalhamento do ajuste") return "Abrir 1 cm";
    if (column.header === "Valor unitário") return "80,00";
    return column.example;
  });
}

function catalogLayout(
  href: string,
  menuLabel: string,
  title: string,
  fileName: string,
  summary: string,
  columns: MigrationColumn[],
  kind: string,
): MigrationLayout {
  return {
    href,
    kind,
    menuLabel,
    hint: "Layout Excel",
    title,
    fileName,
    summary,
    columns,
    exampleRows: rowsFromColumns(columns),
  };
}

const catalogLayouts: MigrationLayout[] = [
  catalogLayout(
    "/integration/body-parts",
    "Cadastro de partes do corpo",
    "Cadastro de partes do corpo",
    "anexsys-partes-do-corpo.xlsx",
    `Partes usadas na ficha de medidas. Uma linha por parte. ${ORDER_NOTE}`,
    bodyPartColumns,
    "body-parts",
  ),
  catalogLayout(
    "/integration/units",
    "Cadastro de unidades de medida",
    "Cadastro de unidades de medida",
    "anexsys-unidades-de-medida.xlsx",
    `Unidades da ficha de medidas. CM já é o padrão; inclua só se o sistema antigo usar outra. ${ORDER_NOTE}`,
    unitColumns,
    "units",
  ),
  catalogLayout(
    "/integration/products",
    "Cadastro de produtos",
    "Cadastro de produtos",
    "anexsys-produtos.xlsx",
    `Peças do catálogo, como calça, saia e vestido. Uma linha por produto. ${ORDER_NOTE}`,
    productColumns,
    "products",
  ),
  catalogLayout(
    "/integration/services",
    "Cadastro de serviços",
    "Cadastro de serviços",
    "anexsys-servicos.xlsx",
    `Serviços do catálogo, como bainha e barra. Uma linha por serviço. ${ORDER_NOTE}`,
    serviceColumns,
    "services",
  ),
  catalogLayout(
    "/integration/prices",
    "Cadastro de preços",
    "Cadastro de preços",
    "anexsys-precos.xlsx",
    `Preço e tempo de cada par produto + serviço. As colunas de produto e de serviço cadastram o que ainda não existe. ${UPSERT_NOTE}`,
    priceColumns,
    "prices",
  ),
  catalogLayout(
    "/integration/minute-rates",
    "Cadastro de valor por minuto",
    "Cadastro de valor por minuto",
    "anexsys-valor-por-minuto.xlsx",
    `Valor em reais de um minuto de trabalho, por empresa. Uma linha por empresa. ${ORDER_NOTE}`,
    minuteRateColumns,
    "minute-rates",
  ),
  catalogLayout(
    "/integration/users",
    "Cadastro de usuários e acessos",
    "Cadastro de usuários e acessos",
    "anexsys-usuarios-e-acessos.xlsx",
    `Quem entra no sistema e com qual papel. Uma linha por pessoa. A ordem aponta o atendente pelo e-mail. ${ORDER_NOTE}`,
    userColumns,
    "users",
  ),
  catalogLayout(
    "/integration/customers",
    "Cadastro de clientes",
    "Cadastro de clientes",
    "anexsys-clientes.xlsx",
    `Clientes do sistema antigo. Uma linha por cliente. O código antigo é a chave das medidas e das ordens. ${ORDER_NOTE}`,
    customerColumns,
    "customers",
  ),
  catalogLayout(
    "/integration/measurements",
    "Cadastro de medidas",
    "Cadastro de medidas",
    "anexsys-medidas.xlsx",
    `Ficha de medidas. Uma linha por parte do corpo. As colunas do cliente, da parte e da unidade cadastram o que ainda não existe. ${UPSERT_NOTE}`,
    measurementImportColumns,
    "measurements",
  ),
];

const serviceOrderLayouts: MigrationLayout[] = OS_STATUSES.map((status) => {
  const columns = serviceOrderColumns(status.label);
  return {
    href: `/integration/service-orders/${status.slug}`,
    menuLabel: `OS ${status.label}`,
    hint: "Uma linha por peça",
    title: `Ordens de serviço · ${status.label}`,
    fileName: `anexsys-os-${status.slug}.xlsx`,
    summary: `${status.note} Uma linha por peça. A mesma ordem repete o número antigo em cada peça, até 5. A coluna Status permanece ${status.label}. ${ORDER_NOTE}`,
    columns,
    exampleRows: [columns.map((column) => column.example), secondPieceRow(columns)],
  };
});

export const INTEGRATION_LAYOUTS: MigrationLayout[] = [...catalogLayouts, ...serviceOrderLayouts];

const serviceOrderImportLayout: MigrationLayout = {
  href: "/integration/service-orders",
  kind: "service-orders",
  menuLabel: "Ordens de serviço",
  hint: "Layout completo",
  title: "Ordens de serviço",
  fileName: "anexsys-ordens-de-servico.xlsx",
  summary: `Uma linha por peça. A coluna Status define a situação da ordem. Cliente, atendente, produto, serviço e preço vão na mesma planilha. ${UPSERT_NOTE}`,
  columns: serviceOrderColumns("Aberta"),
  exampleRows: [serviceOrderColumns("Aberta").map((column) => column.example), secondPieceRow(serviceOrderColumns("Aberta"))],
};

export const IMPORT_RECORD_OPTIONS: Array<{ kind: string; layout: MigrationLayout }> = [
  ...catalogLayouts.map((layout) => ({ kind: layout.kind ?? "", layout })),
  { kind: "service-orders", layout: serviceOrderImportLayout },
];

export const INTEGRATION_ORDER_HREF = "/integration";

export function findIntegrationLayout(pathname: string): MigrationLayout | null {
  const base = pathname.split("?")[0] || "/";
  return INTEGRATION_LAYOUTS.find((layout) => layout.href === base) ?? null;
}
