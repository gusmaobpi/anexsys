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

function formatDay(value: string) {
  return value.slice(0, 10).split("-").reverse().join("/");
}

export function FloorPhone() {
  const params = useParams<{ code: string }>();
  const code = String(params.code ?? "");
  const [names, setNames] = useState<NameOption[]>([]);
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
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    void publicFloor<{ purpose: "production" | "quality"; names: NameOption[] }>("/checkin", { code })
      .then((response) => {
        setPurpose(response.purpose);
        setNames(response.names);
      })
      .catch((reason) => setError(describeWorkspaceError(reason, "O check-in não abriu.")));
  }, [code]);

  const readCode = useCallback(async (codeValue: string) => {
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
  }, [code, session]);

  useEffect(() => {
    if (!scanning) return undefined;
    let stopped = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;
    void navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } }).then(async (next) => {
      stream = next;
      if (!video || stopped) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = next;
      await video.play();
      const detector = "BarcodeDetector" in window
        ? new (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({ formats: ["qr_code"] })
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
    }).catch(() => setError("A câmera não abriu. Digite o código da OP."));
    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [readCode, scanning]);

  async function chooseName(technicianId: string) {
    setBusy(true);
    setError(null);
    try {
      setSession(await publicFloor<SessionState>("/sessions", { code, technicianId }));
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
      }>(
        `/sessions/${session.id}/advance`,
        { code, serviceOrderId },
      );
      setReview(null);
      setSession((current) => current
        ? { ...current, currentOrder: response.openCamera ? null : { id: response.order.id, orderNo: response.order.orderNo, status: response.order.status } }
        : current);
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

  async function decide(itemId: string, decision: "approved" | "rejected") {
    if (!review || !session) return;
    const reason = decision === "rejected" ? window.prompt("Motivo da reprovação") ?? "" : undefined;
    if (decision === "rejected" && !reason?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await publicFloor<{ review: QualityReview }>(`/sessions/${session.id}/items/${itemId}`, {
        code,
        serviceOrderId: review.serviceOrder.id,
        decision,
        reason,
      });
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
      setReview(await publicFloor<QualityReview>(`/sessions/${session.id}/start-return`, {
        code,
        serviceOrderId: review.serviceOrder.id,
      }));
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

  return (
    <section className="floor-phone__panel">
      <p className="eyebrow">ANEXSYS</p>
      <h1>{purpose === "quality" ? "Check-in da qualidade" : purpose === "production" ? "Check-in da produção" : "Check-in"}</h1>
      {error ? <p className="error-text">{error}</p> : null}
      {!purpose && !error ? <p>Abrindo o check-in…</p> : null}
      {!session && purpose ? (
        <div className="button-row">
          {names.map((person) => (
            <button className="button" disabled={busy} key={person.id} onClick={() => void chooseName(person.id)} type="button">
              {person.displayName}
            </button>
          ))}
          {names.length === 0 ? (
            <p>{purpose === "quality" ? "Ninguém da qualidade cadastrado." : "Ninguém confirmado na escala de hoje."}</p>
          ) : null}
        </div>
      ) : null}
      {session && !card && !review && !scanning ? (
        <div className="button-row">
          {holding ? (
            <>
              <p>Você está com a OS {holding.orderNo}. Termine item a item.</p>
              {(pieces ?? []).map((item) => (
                <div key={item.id}>
                  <p><strong>{item.itemNo}. {item.itemType}</strong> · {item.description}</p>
                  {item.finished ? <p>Terminado</p> : (
                    <button className="button" disabled={busy} onClick={() => void finishPiece(item.id, holding.id)} type="button">Terminei</button>
                  )}
                </div>
              ))}
            </>
          ) : session.status === "active" ? (
            <button className="button" onClick={() => setScanning(true)} type="button">Ler ordem de produção</button>
          ) : null}
          {session.status === "active" ? (
            <button className="button-secondary" onClick={() => void closeSession()} type="button">Encerrar sessão</button>
          ) : null}
        </div>
      ) : null}
      {scanning ? (
        <div>
          <video className="floor-phone__video" muted playsInline ref={videoRef} />
          <div className="button-row">
            <input className="input" onChange={(event) => setManualCode(event.target.value)} placeholder="Código da OP" value={manualCode} />
            <button className="button" disabled={!manualCode.trim()} onClick={() => void readCode(manualCode.trim())} type="button">Abrir</button>
            <button className="button-secondary" onClick={() => setScanning(false)} type="button">Fechar câmera</button>
          </div>
        </div>
      ) : null}
      {card && !review ? (
        <article>
          <h2>OS {card.orderNo}</h2>
          <p>Entrada {formatDay(card.openedAt)} · Previsão {formatDay(card.promisedDeliveryDate)}</p>
          {card.items.map((item) => (
            <p key={item.sequence}>
              <strong>{item.sequence}. {item.product}</strong> · {item.service}
              <br />{item.detail}
              <br />{[item.brand, item.model, item.serialNo].filter(Boolean).join(" · ")}
              {item.rejectionReason ? <><br />Refazer: {item.rejectionReason}</> : null}
              {item.proofNote ? <><br />Prova: {item.proofNote}</> : null}
            </p>
          ))}
          {pieces?.map((item) => (
            <div key={item.id}>
              <p><strong>{item.itemNo}. {item.itemType}</strong> · {item.description}</p>
              {item.finished ? <p>Terminado</p> : (
                <button className="button" disabled={busy} onClick={() => void finishPiece(item.id, card.serviceOrderId)} type="button">Terminei</button>
              )}
            </div>
          ))}
          {actionLabel ? (
            <button className="button" disabled={busy} onClick={() => void advance(card.serviceOrderId)} type="button">{actionLabel}</button>
          ) : null}
        </article>
      ) : null}
      {review ? (
        <article>
          <h2>OS {review.serviceOrder.orderNo}</h2>
          {review.phase === "rework_issued" && review.serviceOrder.status === "awaiting_quality" && session?.status === "active" ? (
            <button className="button" disabled={busy} onClick={() => void startReturn()} type="button">Revisar retorno</button>
          ) : null}
          {review.phase === "rework_issued" && review.serviceOrder.status !== "awaiting_quality" ? (
            <p>A sacola voltou para Pegar sacola. A revisão do retorno abre depois do Terminei.</p>
          ) : null}
          {review.items.map((item, index) => (
            <div key={item.id}>
              <p><strong>{index + 1}. {item.itemType}</strong> · {item.description}<br />{item.complement}</p>
              {item.canDecide ? (
                <div className="button-row">
                  <button className="button" disabled={busy} onClick={() => void decide(item.id, "approved")} type="button">Aprovar</button>
                  <button className="button-secondary" disabled={busy} onClick={() => void decide(item.id, "rejected")} type="button">Reprovar</button>
                </div>
              ) : <p>{item.decision === "approved" ? "Aprovado" : item.decision === "rejected" ? "Reprovado" : item.decision}</p>}
            </div>
          ))}
        </article>
      ) : null}
      {session?.status === "closed" ? <p>Sessão encerrada.</p> : null}
    </section>
  );
}
