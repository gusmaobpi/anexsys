"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { describeWorkspaceError } from "@/components/ui/workspace-flash";

async function publicFloor<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/backend-api/public/floor${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message[0] : payload?.message;
    throw new Error(message || "O check-in não abriu.");
  }
  return payload as T;
}

type NameOption = { id: string; displayName: string };
type CardItem = {
  sequence: number;
  product: string;
  service: string;
  detail: string | null;
  brand: string;
  model: string;
  serialNo: string;
  rejectionReason: string | null;
  proofNote: string | null;
};
type Card = {
  serviceOrderId: string;
  orderNo: string;
  openedAt: string;
  promisedDeliveryDate: string;
  items: CardItem[];
};
type SessionState = {
  id: string;
  purpose: "production" | "quality";
  status: string;
  currentOrder: { id: string; orderNo: string; status: string } | null;
};
type QualityPiece = {
  id: string;
  itemType: string;
  description: string;
  complement: string | null;
  brand: string;
  model: string;
  serialNo: string;
  decision: string;
  reason: string | null;
  canDecide: boolean;
};
type FloorPiece = {
  id: string;
  itemNo: number;
  itemType: string;
  description: string;
  complement: string | null;
  finished: boolean;
};
type QualityReview = {
  phase: "needs_review" | "rework_issued" | "ready";
  serviceOrder: { id: string; orderNo: string; status?: string };
  items: QualityPiece[];
};

const QUICK_REJECTION_REASONS = [
  "Medida divergente da fita",
  "Costura / acabamento irregular",
  "Passadoria / marca no tecido",
  "Alinhamento de barra / bainha",
];

function formatDay(value: string) {
  return value.slice(0, 10).split("-").reverse().join("/");
}

export function FloorPhone() {
  const params = useParams<{ code: string }>();
  const code = String(params.code ?? "");
  const [names, setNames] = useState<NameOption[]>([]);
  const [selectedNameLabel, setSelectedNameLabel] = useState<string>("");
  const [purpose, setPurpose] = useState<"production" | "quality" | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [actionLabel, setActionLabel] = useState<string | null>(null);
  const [review, setReview] = useState<QualityReview | null>(null);
  const [pieces, setPieces] = useState<FloorPiece[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectingPieceId, setRejectingPieceId] = useState<string | null>(null);
  const [rejectReasonDraft, setRejectReasonDraft] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    void publicFloor<{ purpose: "production" | "quality"; names: NameOption[] }>("/checkin", { code })
      .then((response) => {
        setPurpose(response.purpose);
        setNames(response.names);
      })
      .catch((reason) => setError(describeWorkspaceError(reason, "O check-in não abriu.")));
  }, [code]);

  const readCode = useCallback(
    async (codeValue: string) => {
      if (!session) return;
      setBusy(true);
      setError(null);
      setScanning(false);
      try {
        const response = await publicFloor<{
          purpose: "production" | "quality";
          serviceOrderId: string;
          card: Card;
          actionLabel: string | null;
          review: QualityReview | null;
          floorItems: FloorPiece[] | null;
        }>(`/sessions/${session.id}/read`, { code, codeValue });
        setCard(response.card);
        setActionLabel(response.actionLabel);
        setPieces(response.floorItems ?? null);
        if (response.purpose === "quality") {
          setReview(response.review);
        }
      } catch (reason) {
        setError(describeWorkspaceError(reason, "Esta OP não abriu."));
      } finally {
        setBusy(false);
      }
    },
    [code, session],
  );

  useEffect(() => {
    if (!scanning) return undefined;
    let stopped = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;
    void navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then(async (next) => {
        stream = next;
        if (!video || stopped) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = next;
        await video.play();
        const detector =
          "BarcodeDetector" in window
            ? new (
                window as unknown as {
                  BarcodeDetector: new (options: { formats: string[] }) => {
                    detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
                  };
                }
              ).BarcodeDetector({ formats: ["qr_code"] })
            : null;
        const tick = async () => {
          if (stopped || !detector || !video) return;
          const found = await detector.detect(video).catch(() => []);
          if (found[0]?.rawValue) {
            stopped = true;
            void readCode(found[0].rawValue);
            return;
          }
          requestAnimationFrame(() => void tick());
        };
        void tick();
      })
      .catch(() => setError("A câmera não abriu. Digite o código da OP."));
    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [readCode, scanning]);

  async function chooseName(person: NameOption) {
    setBusy(true);
    setError(null);
    setSelectedNameLabel(person.displayName);
    try {
      setSession(await publicFloor<SessionState>("/sessions", { code, technicianId: person.id }));
    } catch (reason) {
      setError(describeWorkspaceError(reason, "O nome não entrou na sessão."));
    } finally {
      setBusy(false);
    }
  }

  async function advance(serviceOrderId: string) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const response = await publicFloor<{
        openCamera: boolean;
        order: { id: string; orderNo: string; status: string };
        floorItems: FloorPiece[] | null;
      }>(`/sessions/${session.id}/advance`, { code, serviceOrderId });
      setReview(null);
      setSession((current) =>
        current
          ? {
              ...current,
              currentOrder: response.openCamera
                ? null
                : { id: response.order.id, orderNo: response.order.orderNo, status: response.order.status },
            }
          : current,
      );
      if (response.floorItems) {
        setPieces(response.floorItems);
        setActionLabel(null);
        return;
      }
      setCard(null);
      setPieces(null);
      if (response.openCamera) setScanning(true);
    } catch (reason) {
      setError(describeWorkspaceError(reason, "O passo não foi gravado."));
    } finally {
      setBusy(false);
    }
  }

  async function finishPiece(itemId: string, serviceOrderId: string) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const result = await publicFloor<{ items: FloorPiece[]; released: boolean; openCamera: boolean }>(
        `/sessions/${session.id}/production-items/${itemId}`,
        { code, serviceOrderId },
      );
      if (result.released) {
        setCard(null);
        setPieces(null);
        setReview(null);
        setSession((current) => (current ? { ...current, currentOrder: null } : current));
        if (result.openCamera) setScanning(true);
        return;
      }
      setPieces(result.items);
    } catch (reason) {
      setError(describeWorkspaceError(reason, "O item não foi terminado."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!session?.currentOrder || card || review || scanning || pieces) return;
    const serviceOrderId = session.currentOrder.id;
    void publicFloor<{ items: FloorPiece[] }>(`/sessions/${session.id}/production`, { code, serviceOrderId })
      .then((response) => setPieces(response.items))
      .catch((reason) => setError(describeWorkspaceError(reason, "Os itens da OP não abriram.")));
  }, [card, code, pieces, review, scanning, session]);

  async function submitDecision(itemId: string, decision: "approved" | "rejected", explicitReason?: string) {
    if (!review || !session) return;
    const reason = decision === "rejected" ? (explicitReason ?? rejectReasonDraft).trim() : undefined;
    if (decision === "rejected" && !reason) {
      setError("Escolha ou descreva o motivo da reprovação da peça.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await publicFloor<{ review: QualityReview }>(`/sessions/${session.id}/items/${itemId}`, {
        code,
        serviceOrderId: review.serviceOrder.id,
        decision,
        reason,
      });
      setRejectingPieceId(null);
      setRejectReasonDraft("");
      setReview(result.review);
      if ((result.review.phase === "ready" || result.review.phase === "rework_issued") && session?.status === "active") {
        setCard(null);
        setReview(null);
        setScanning(true);
      }
    } catch (reasonValue) {
      setError(describeWorkspaceError(reasonValue, "A revisão não foi gravada."));
    } finally {
      setBusy(false);
    }
  }

  async function startReturn() {
    if (!review || session?.status !== "active") return;
    setBusy(true);
    setError(null);
    try {
      setReview(
        await publicFloor<QualityReview>(`/sessions/${session.id}/start-return`, {
          code,
          serviceOrderId: review.serviceOrder.id,
        }),
      );
    } catch (reason) {
      setError(describeWorkspaceError(reason, "O retorno da refação não abriu."));
    } finally {
      setBusy(false);
    }
  }

  async function closeSession() {
    if (!session) return;
    await publicFloor(`/sessions/${session.id}/close`, { code });
    setSession({ ...session, status: "closed" });
    setScanning(false);
  }

  const holding = session?.currentOrder;
  const totalPiecesCount = pieces?.length ?? 0;
  const finishedPiecesCount = pieces?.filter((p) => p.finished).length ?? 0;

  return (
    <div className="screen-shell public-os-shell">
      <section className="auth-card public-os floor-phone__panel" style={{ maxWidth: 460 }}>
        <div className="auth-card__header" style={{ background: "#f8fafc" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span className="eyebrow">ANEXSYS · QR CODE OFICINA</span>
            {selectedNameLabel ? (
              <span className="status-chip status-chip--active">{selectedNameLabel}</span>
            ) : null}
          </div>
          <h1 className="title" style={{ fontSize: 22, marginTop: 8 }}>
            {purpose === "quality"
              ? "Inspeção de Qualidade"
              : purpose === "production"
                ? "Esteira de Produção"
                : "Check-in Operacional"}
          </h1>
        </div>

        <div className="auth-card__body" style={{ display: "grid", gap: 14 }}>
          {error ? <p className="workspace-flash workspace-flash--error" style={{ margin: 0 }}>{error}</p> : null}
          {!purpose && !error ? <p className="subtitle">Abrindo o check-in…</p> : null}

          {/* SELEÇÃO DE COLABORADOR NO CHECK-IN */}
          {!session && purpose ? (
            <div style={{ display: "grid", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                Toque no seu nome para iniciar seu turno:
              </span>
              <div style={{ display: "grid", gap: 8 }}>
                {names.map((person) => (
                  <button
                    className="button"
                    disabled={busy}
                    key={person.id}
                    onClick={() => void chooseName(person)}
                    style={{ width: "100%", justifyContent: "space-between", minHeight: 48 }}
                    type="button"
                  >
                    <span>{person.displayName}</span>
                    <span>Entrar →</span>
                  </button>
                ))}
              </div>
              {names.length === 0 ? (
                <p className="empty-state">
                  {purpose === "quality" ? "Ninguém da qualidade cadastrado." : "Ninguém confirmado na escala de hoje."}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* SESSÃO ATIVA COM SACOLA EM MÃOS OU PRONTA P/ BIPAR */}
          {session && !card && !review && !scanning ? (
            <div style={{ display: "grid", gap: 12 }}>
              {holding ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      border: "1.5px solid var(--primary)",
                      background: "var(--primary-soft)",
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <strong style={{ fontSize: 16, color: "var(--text-primary)" }}>
                        Sacola OS {holding.orderNo}
                      </strong>
                      {totalPiecesCount > 0 ? (
                        <span className="status-chip status-chip--active">
                          {`${finishedPiecesCount}/${totalPiecesCount} peças`}
                        </span>
                      ) : null}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Conclua peça a peça abaixo para liberar a sacola para o Controle de Qualidade.
                    </span>
                    {totalPiecesCount > 0 ? (
                      <div style={{ height: 8, borderRadius: 999, background: "#dbeafe", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${(finishedPiecesCount / totalPiecesCount) * 100}%`,
                            height: "100%",
                            background: finishedPiecesCount === totalPiecesCount ? "#16a34a" : "var(--primary)",
                          }}
                        />
                      </div>
                    ) : null}
                  </div>

                  {(pieces ?? []).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        border: item.finished ? "1.5px solid var(--success-border)" : "1px solid var(--border)",
                        background: item.finished ? "var(--success-bg)" : "#ffffff",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ display: "grid", gap: 2 }}>
                          <strong style={{ color: "var(--text-primary)", fontSize: 14 }}>
                            {item.itemNo}. {item.itemType}
                          </strong>
                          <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>{item.description}</span>
                          {item.complement ? (
                            <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{item.complement}</span>
                          ) : null}
                        </div>
                        <span className={`status-chip status-chip--${item.finished ? "active" : "inactive"}`}>
                          {item.finished ? "✓ Terminado" : "Em costura"}
                        </span>
                      </div>
                      {!item.finished ? (
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => void finishPiece(item.id, holding.id)}
                          style={{ width: "100%", minHeight: 46 }}
                          type="button"
                        >
                          ✓ Terminei
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : session.status === "active" ? (
                <button
                  className="button"
                  onClick={() => setScanning(true)}
                  style={{ width: "100%", minHeight: 50 }}
                  type="button"
                >
                  📷 Ler ordem de produção
                </button>
              ) : null}

              {session.status === "active" ? (
                <button
                  className="button-secondary"
                  onClick={() => void closeSession()}
                  style={{ width: "100%" }}
                  type="button"
                >
                  Encerrar sessão
                </button>
              ) : null}
            </div>
          ) : null}

          {/* LEITOR DE CÂMERA / CÓDIGO MANUAL DA OP */}
          {scanning ? (
            <div style={{ display: "grid", gap: 12 }}>
              <video
                className="floor-phone__video"
                muted
                playsInline
                ref={videoRef}
                style={{ borderRadius: 14, overflow: "hidden" }}
              />
              <div className="field">
                <span>Ou digite o código da OP</span>
                <input
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="Código da OP"
                  value={manualCode}
                />
              </div>
              <div className="button-row" style={{ marginTop: 0 }}>
                <button
                  className="button"
                  disabled={!manualCode.trim()}
                  onClick={() => void readCode(manualCode.trim())}
                  type="button"
                >
                  Abrir
                </button>
                <button className="button-secondary" onClick={() => setScanning(false)} type="button">
                  Fechar câmera
                </button>
              </div>
            </div>
          ) : null}

          {/* CARTÃO DA OS LIDA NA PRODUÇÃO */}
          {card && !review ? (
            <article style={{ display: "grid", gap: 12 }}>
              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: "1.5px solid var(--primary)",
                  background: "var(--primary-soft)",
                  display: "grid",
                  gap: 4,
                }}
              >
                <h2 style={{ fontSize: 18, color: "var(--text-primary)" }}>OS {card.orderNo}</h2>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                  Entrada {formatDay(card.openedAt)} · Previsão {formatDay(card.promisedDeliveryDate)}
                </p>
              </div>

              {card.items.map((item) => (
                <div
                  key={item.sequence}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: item.rejectionReason ? "1.5px solid var(--danger)" : "1px solid var(--border)",
                    background: item.rejectionReason ? "var(--danger-bg)" : "#ffffff",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>
                    {item.sequence}. {item.product} · {item.service}
                  </strong>
                  {item.detail ? <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{item.detail}</span> : null}
                  {[item.brand, item.model, item.serialNo].filter(Boolean).length > 0 ? (
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      {[item.brand, item.model, item.serialNo].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                  {item.rejectionReason ? (
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "#ffffff",
                        border: "1px solid var(--danger-border)",
                        color: "var(--danger)",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      🔴 Refazer: {item.rejectionReason}
                    </div>
                  ) : null}
                  {item.proofNote ? (
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "var(--warning-bg)",
                        border: "1px solid var(--warning-border)",
                        color: "var(--warning)",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      ⚠ Prova: {item.proofNote}
                    </div>
                  ) : null}
                </div>
              ))}

              {pieces?.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: item.finished ? "1.5px solid var(--success-border)" : "1px solid var(--border)",
                    background: item.finished ? "var(--success-bg)" : "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>
                      {item.itemNo}. {item.itemType}
                    </strong>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.description}</div>
                  </div>
                  {item.finished ? (
                    <span className="status-chip status-chip--active">✓ Terminado</span>
                  ) : (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void finishPiece(item.id, card.serviceOrderId)}
                      type="button"
                    >
                      ✓ Terminei
                    </button>
                  )}
                </div>
              ))}

              {actionLabel ? (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void advance(card.serviceOrderId)}
                  style={{ width: "100%", minHeight: 48 }}
                  type="button"
                >
                  {actionLabel}
                </button>
              ) : null}
            </article>
          ) : null}

          {/* CARTÃO DE INSPEÇÃO DE QUALIDADE PEÇA A PEÇA (SEM WINDOW.PROMPT) */}
          {review ? (
            <article style={{ display: "grid", gap: 12 }}>
              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: "1.5px solid var(--primary)",
                  background: "var(--primary-soft)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h2 style={{ fontSize: 18, color: "var(--text-primary)", margin: 0 }}>
                  OS {review.serviceOrder.orderNo}
                </h2>
                <span className="status-chip status-chip--active">Qualidade</span>
              </div>

              {review.phase === "rework_issued" &&
              review.serviceOrder.status === "awaiting_quality" &&
              session?.status === "active" ? (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void startReturn()}
                  style={{ width: "100%" }}
                  type="button"
                >
                  Revisar retorno
                </button>
              ) : null}

              {review.phase === "rework_issued" && review.serviceOrder.status !== "awaiting_quality" ? (
                <p className="os-rule-banner">
                  A sacola voltou para Pegar sacola. A revisão do retorno abre depois do Terminei.
                </p>
              ) : null}

              {review.items.map((item, index) => {
                const isRejecting = rejectingPieceId === item.id;
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      border:
                        item.decision === "approved"
                          ? "1.5px solid var(--success-border)"
                          : item.decision === "rejected"
                            ? "1.5px solid var(--danger-border)"
                            : "1px solid var(--border)",
                      background:
                        item.decision === "approved"
                          ? "var(--success-bg)"
                          : item.decision === "rejected"
                            ? "var(--danger-bg)"
                            : "#ffffff",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>
                          {index + 1}. {item.itemType} · {item.description}
                        </strong>
                        {item.complement ? (
                          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{item.complement}</span>
                        ) : null}
                      </div>
                      {!item.canDecide ? (
                        <span
                          className={`status-chip status-chip--${
                            item.decision === "approved"
                              ? "active"
                              : item.decision === "rejected"
                                ? "blocked"
                                : "inactive"
                          }`}
                        >
                          {item.decision === "approved"
                            ? "✓ Aprovado"
                            : item.decision === "rejected"
                              ? "✕ Reprovado"
                              : item.decision}
                        </span>
                      ) : null}
                    </div>

                    {item.reason ? (
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)" }}>
                        Motivo: {item.reason}
                      </div>
                    ) : null}

                    {item.canDecide ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <button
                            className="button qc-approve"
                            disabled={busy}
                            onClick={() => void submitDecision(item.id, "approved")}
                            type="button"
                          >
                            ✓ Aprovar
                          </button>
                          <button
                            className="button-secondary qc-reject"
                            disabled={busy}
                            onClick={() => {
                              setRejectingPieceId((curr) => (curr === item.id ? null : item.id));
                              setRejectReasonDraft("");
                            }}
                            type="button"
                          >
                            ✕ Reprovar
                          </button>
                        </div>

                        {isRejecting ? (
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 12,
                              border: "1.5px solid var(--danger)",
                              background: "#ffffff",
                              display: "grid",
                              gap: 8,
                            }}
                          >
                            <strong style={{ fontSize: 12, color: "var(--text-primary)" }}>
                              Escolha o motivo rápido ou descreva o ajuste:
                            </strong>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {QUICK_REJECTION_REASONS.map((preset) => (
                                <button
                                  key={preset}
                                  className="button-secondary"
                                  onClick={() => setRejectReasonDraft(preset)}
                                  style={{ minHeight: 30, padding: "0 10px", fontSize: 11 }}
                                  type="button"
                                >
                                  {preset}
                                </button>
                              ))}
                            </div>
                            <textarea
                              onChange={(e) => setRejectReasonDraft(e.target.value)}
                              placeholder="Detalhe o que precisa ser refeito..."
                              rows={2}
                              style={{
                                width: "100%",
                                padding: 10,
                                borderRadius: 10,
                                border: "1px solid var(--border)",
                              }}
                              value={rejectReasonDraft}
                            />
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                              <button
                                className="button-secondary"
                                onClick={() => setRejectingPieceId(null)}
                                type="button"
                              >
                                Cancelar
                              </button>
                              <button
                                className="button"
                                disabled={busy || !rejectReasonDraft.trim()}
                                onClick={() => void submitDecision(item.id, "rejected", rejectReasonDraft)}
                                type="button"
                              >
                                Confirmar Reprovação
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </article>
          ) : null}

          {session?.status === "closed" ? (
            <p className="os-rule-banner" style={{ textAlign: "center" }}>
              Sessão encerrada.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
