import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import type { RosterPlayer } from "../../services/playersService";
import { Button } from "../ui/Button";
import { useTheme } from "../../hooks/useTheme";
import { TrucoPlayerCard } from "./TrucoPlayerCard";
import { playerCardIdentity } from "./playerCardIdentity";
import { clamp, detectDeckMode, rubberBand, springStep, type DeckMode } from "./deckMotion";
import { startTableLight, type TableLight } from "./tableLight";
import "./PlayerCardDeck.css";

interface PlayerCardDeckProps {
  /** Jogadores reais da edição (lista pública /players/roster). */
  players: RosterPlayer[];
  /** Carta que abre no centro — ex.: quem acabou de voltar da tela de senha. */
  initialPlayerId?: string | null;
  /** Escolha confirmada em "Entrar como …": quem chama abre a autenticação. */
  onConfirm: (player: RosterPlayer) => void;
}

/** Ângulo entre cartas vizinhas no arco e o raio relativo à largura da carta. */
const STEP_DEG = 24;
const RADIUS_FACTOR = 2.35;
/** Pixels de arrasto por carta, relativos à largura da carta (bate com a distância visual). */
const DRAG_FACTOR = 0.95;

interface MotionState {
  position: number;
  velocity: number;
  target: number;
  sway: number;
  swayVelocity: number;
  tiltX: number;
  tiltY: number;
  tiltTargetX: number;
  tiltTargetY: number;
  dragging: boolean;
  last: number;
  frame: number;
  cardWidth: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: number;
  moved: boolean;
  samples: Array<{ x: number; t: number }>;
}

/**
 * Palco de entrada: as cartas dos jogadores penduradas num trilho em arco 3D.
 * Arrastar, deslizar, roda do mouse, setas e teclado navegam; a carta do centro
 * fica em destaque. Escolher uma carta só identifica quem vai entrar — a senha
 * continua obrigatória na etapa seguinte.
 *
 * A animação roda fora do React: um laço de requestAnimationFrame escreve só
 * transform/opacity nos elementos visíveis e para sozinho quando tudo assenta.
 */
export function PlayerCardDeck({ players, initialPlayerId, onConfirm }: PlayerCardDeckProps) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<DeckMode>(() => detectDeckMode());
  const identities = useMemo(() => players.map(playerCardIdentity), [players]);
  const startIndex = useMemo(() => {
    const index = players.findIndex((player) => player.id === initialPlayerId);
    return index >= 0 ? index : Math.floor((players.length - 1) / 2);
  }, [players, initialPlayerId]);

  const [active, setActive] = useState(startIndex);
  const [phase, setPhase] = useState<"browse" | "focus">("browse");

  const sceneRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lightRef = useRef<TableLight | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  /** Navegação pelo teclado em curso: o foco acompanha a carta ativa mesmo se a anterior sumir. */
  const keyboardNavRef = useRef(false);
  const wheelRef = useRef({ accumulated: 0, timer: 0 });
  const activeRef = useRef(startIndex);
  const modeRef = useRef(mode);
  const phaseRef = useRef(phase);
  const countRef = useRef(players.length);
  modeRef.current = mode;
  phaseRef.current = phase;
  countRef.current = players.length;

  const motion = useRef<MotionState>({
    position: startIndex,
    velocity: 0,
    target: startIndex,
    sway: 0,
    swayVelocity: 0,
    tiltX: 0,
    tiltY: 0,
    tiltTargetX: 0,
    tiltTargetY: 0,
    dragging: false,
    last: 0,
    frame: 0,
    cardWidth: 220,
  });

  /** Posiciona cada carta visível no arco (ou na fila plana, com movimento reduzido). */
  const layout = useCallback(() => {
    const m = motion.current;
    const currentMode = modeRef.current;
    const width = m.cardWidth;
    const visible = currentMode === "full" ? 4 : 2;
    const radius = width * RADIUS_FACTOR;
    const centered = Math.round(m.position);

    for (let index = 0; index < countRef.current; index += 1) {
      const slot = slotRefs.current[index];
      const card = cardRefs.current[index];
      if (!slot || !card) continue;
      const offset = index - m.position;
      const distance = Math.abs(offset);
      if (distance > visible + 0.6) {
        if (slot.style.visibility !== "hidden") slot.style.visibility = "hidden";
        continue;
      }
      slot.style.visibility = "visible";

      if (currentMode === "reduced") {
        slot.style.transform = `translate3d(${(offset * width * 1.08).toFixed(1)}px, 0, 0) scale(${(1 - Math.min(distance, 1) * 0.12).toFixed(3)})`;
        card.style.transform = "";
      } else {
        const angle = offset * STEP_DEG;
        const radians = (angle * Math.PI) / 180;
        slot.style.transform = `translate3d(${(Math.sin(radians) * radius).toFixed(1)}px, 0, ${((Math.cos(radians) - 1) * radius).toFixed(1)}px) rotateY(${angle.toFixed(2)}deg)`;
        // Cada carta balança um pouco diferente, como peças penduradas de verdade.
        const sway = m.sway * (1 + (((index * 37) % 7) - 3) * 0.07);
        const tilt = index === centered ? ` rotateX(${m.tiltX.toFixed(2)}deg) rotateY(${m.tiltY.toFixed(2)}deg)` : "";
        card.style.transform = `rotateZ(${sway.toFixed(2)}deg)${tilt}`;
      }

      slot.style.zIndex = String(100 - Math.round(distance * 10));
      slot.style.opacity = clamp(visible + 0.6 - distance, 0, 1).toFixed(3);
      slot.style.setProperty("--shade", Math.min(distance * 0.24, 0.72).toFixed(3));
      slot.style.setProperty("--glare", clamp(0.5 - offset * 0.32 + m.tiltY * 0.025, -0.4, 1.4).toFixed(3));
    }
  }, []);

  const syncActive = useCallback(() => {
    const index = clamp(Math.round(motion.current.position), 0, countRef.current - 1);
    if (index !== activeRef.current) {
      activeRef.current = index;
      setActive(index);
    }
  }, []);

  const tick = useCallback((now: number) => {
    const m = motion.current;
    // Tempo real, em subpassos: com 120 ou 15 quadros por segundo o movimento dura o mesmo.
    const elapsed = m.last ? Math.min((now - m.last) / 1000, 0.25) : 1 / 60;
    m.last = now;
    const substeps = Math.max(1, Math.ceil(elapsed / (1 / 120)));
    const dt = elapsed / substeps;

    for (let index = 0; index < substeps; index += 1) {
      if (!m.dragging) {
        const step = springStep(m.position, m.velocity, m.target, dt, 120, 22);
        m.position = step.position;
        m.velocity = step.velocity;
      }
      // Balanço sub-amortecido: a carta passa do ponto e volta, como peça pendurada.
      const swayStep = springStep(m.sway, m.swayVelocity, clamp(-m.velocity * 5, -12, 12), dt, 90, 9);
      m.sway = swayStep.position;
      m.swayVelocity = swayStep.velocity;
    }
    const follow = 1 - Math.pow(1 - 0.18, elapsed * 60);
    m.tiltX += (m.tiltTargetX - m.tiltX) * follow;
    m.tiltY += (m.tiltTargetY - m.tiltY) * follow;

    layout();
    syncActive();

    const settled =
      !m.dragging &&
      Math.abs(m.target - m.position) < 0.0005 &&
      Math.abs(m.velocity) < 0.002 &&
      Math.abs(m.sway) < 0.02 &&
      Math.abs(m.swayVelocity) < 0.05 &&
      Math.abs(m.tiltTargetX - m.tiltX) < 0.01 &&
      Math.abs(m.tiltTargetY - m.tiltY) < 0.01;
    if (settled) {
      m.position = m.target;
      m.velocity = 0;
      m.sway = 0;
      m.swayVelocity = 0;
      layout();
      m.frame = 0;
      m.last = 0;
      return;
    }
    m.frame = requestAnimationFrame(tick);
  }, [layout, syncActive]);

  const kick = useCallback(() => {
    const m = motion.current;
    if (m.frame) return;
    m.last = 0;
    m.frame = requestAnimationFrame(tick);
  }, [tick]);

  const goTo = useCallback((index: number) => {
    const m = motion.current;
    m.target = clamp(Math.round(index), 0, countRef.current - 1);
    if (modeRef.current === "reduced") {
      m.position = m.target;
      m.velocity = 0;
      layout();
      syncActive();
      return;
    }
    kick();
  }, [kick, layout, syncActive]);

  const step = useCallback((delta: number) => goTo(motion.current.target + delta), [goTo]);

  // Mede a carta, aplica o arco e faz a entrada: as cartas deslizam até o lugar.
  useLayoutEffect(() => {
    const m = motion.current;
    const measure = () => {
      const width = slotRefs.current[0]?.offsetWidth ?? 0;
      if (width > 0) m.cardWidth = width;
      const chord = modeRef.current === "reduced"
        ? width * 1.08
        : 2 * width * RADIUS_FACTOR * Math.sin(((STEP_DEG / 2) * Math.PI) / 180);
      ringRef.current?.style.setProperty("--chord", `${chord.toFixed(1)}px`);
      layout();
    };
    measure();
    if (modeRef.current !== "reduced" && phaseRef.current === "browse") {
      m.position = m.target + 2.4;
      layout();
      kick();
    }
    const observer = new ResizeObserver(measure);
    if (sceneRef.current) observer.observe(sceneRef.current);
    return () => observer.disconnect();
  }, [mode, layout, kick]);

  // Segue a preferência de movimento do sistema se ela mudar com a tela aberta.
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return;
    }
    const update = () => setMode(detectDeckMode());
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Luz WebGL só na versão completa e no tema escuro; entra depois da primeira pintura.
  useEffect(() => {
    if (mode !== "full" || theme !== "dark" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const timer = window.setTimeout(() => {
      lightRef.current = startTableLight(canvas);
      lightRef.current?.setIntensity(phaseRef.current === "focus" ? 1.5 : 1);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      lightRef.current?.stop();
      lightRef.current = null;
    };
  }, [mode, theme]);

  useEffect(() => {
    const m = motion.current;
    const wheel = wheelRef.current;
    return () => {
      cancelAnimationFrame(m.frame);
      m.frame = 0;
      window.clearTimeout(wheel.timer);
    };
  }, []);

  // Quem navega pelo teclado acompanha a carta ativa com o foco. Num salto longo (Home/End)
  // a carta que tinha o foco fica oculta e o navegador solta o foco no <body>; por isso a
  // intenção fica registrada em keyboardNavRef, e não só no elemento focado no momento.
  useEffect(() => {
    if (phase !== "browse") return;
    const focused = document.activeElement;
    const focusOnCard = focused instanceof HTMLElement && focused.classList.contains("deck-card-button");
    if ((keyboardNavRef.current || focusOnCard) && focused !== buttonRefs.current[active]) {
      buttonRefs.current[active]?.focus({ preventScroll: true });
    }
  }, [active, phase]);

  // Carta escolhida: vem para a frente girando; as outras descem para a mesa.
  useEffect(() => {
    if (phase !== "focus") return;
    const m = motion.current;
    const chosen = activeRef.current;
    slotRefs.current.forEach((slot, index) => {
      const card = cardRefs.current[index];
      if (!slot) return;
      if (card) card.style.transform = "";
      if (index === chosen) {
        slot.style.transform = modeRef.current === "reduced"
          ? "translate3d(0, 0, 0) scale(1.06)"
          : `translate3d(0, -3%, ${(m.cardWidth * 0.55).toFixed(1)}px) rotateY(0deg)`;
        slot.style.opacity = "1";
        slot.style.setProperty("--shade", "0");
        slot.style.setProperty("--glare", "0.5");
      } else if (slot.style.visibility !== "hidden") {
        slot.style.transform += " translateY(26%)";
        slot.style.opacity = "0";
      }
    });
    lightRef.current?.setIntensity(1.5);
    const timer = window.setTimeout(() => confirmRef.current?.focus({ preventScroll: true }), modeRef.current === "reduced" ? 0 : 650);
    return () => window.clearTimeout(timer);
  }, [phase]);

  function choose(index: number) {
    const m = motion.current;
    cancelAnimationFrame(m.frame);
    m.frame = 0;
    m.position = m.target = index;
    m.velocity = m.sway = m.swayVelocity = 0;
    m.tiltX = m.tiltY = m.tiltTargetX = m.tiltTargetY = 0;
    layout();
    syncActive();
    setPhase("focus");
  }

  function backToBrowse() {
    setPhase("browse");
    lightRef.current?.setIntensity(1);
    // Devolve as cartas ao arco no próximo quadro, já sem a transição da escolha.
    requestAnimationFrame(() => {
      layout();
      buttonRefs.current[activeRef.current]?.focus({ preventScroll: true });
    });
  }

  function handleCardClick(index: number) {
    if (suppressClickRef.current || phaseRef.current !== "browse") return;
    if (index !== activeRef.current) {
      goTo(index);
      return;
    }
    choose(index);
  }

  // ---------- Arrastar / deslizar ----------
  const handlePointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const m = motion.current;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      // Gesto mais vertical que horizontal é rolagem da página, não do baralho.
      if (Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null;
        return;
      }
      drag.moved = true;
      m.dragging = true;
    }
    const perCard = m.cardWidth * (modeRef.current === "reduced" ? 1.08 : DRAG_FACTOR);
    m.position = rubberBand(drag.startPosition - dx / perCard, countRef.current - 1);
    drag.samples.push({ x: event.clientX, t: event.timeStamp });
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].t > 100) drag.samples.shift();
    const first = drag.samples[0];
    const elapsed = (event.timeStamp - first.t) / 1000;
    m.velocity = elapsed > 0 ? -((event.clientX - first.x) / perCard) / elapsed : 0;
    if (modeRef.current === "reduced") {
      layout();
      syncActive();
    } else {
      kick();
    }
  }, [kick, layout, syncActive]);

  const handlePointerUp = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (drag && event.pointerId !== drag.pointerId) return;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerUp);
    dragRef.current = null;
    if (!drag?.moved) return;
    // O clique que encerra um arrasto não escolhe carta.
    suppressClickRef.current = true;
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    const m = motion.current;
    m.dragging = false;
    // Inércia: o gesto rápido projeta algumas cartas adiante antes da mola assentar.
    const projected = m.position + clamp(m.velocity, -14, 14) * 0.22;
    goTo(projected);
    if (modeRef.current === "reduced") m.velocity = 0;
  }, [goTo, handlePointerMove]);

  useEffect(() => () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerUp);
  }, [handlePointerMove, handlePointerUp]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    keyboardNavRef.current = false;
    if (phaseRef.current !== "browse") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: motion.current.position,
      moved: false,
      samples: [{ x: event.clientX, t: event.timeStamp }],
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  // Reflexo e inclinação seguem o mouse sobre a carta do centro (só onde há hover de verdade).
  function handleHover(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (modeRef.current !== "full" || event.pointerType !== "mouse" || dragRef.current?.moved || index !== activeRef.current || phaseRef.current !== "browse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    motion.current.tiltTargetY = x * 14;
    motion.current.tiltTargetX = -y * 10;
    kick();
  }

  function resetHover() {
    motion.current.tiltTargetX = 0;
    motion.current.tiltTargetY = 0;
    kick();
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (phaseRef.current !== "browse") return;
    const wheel = wheelRef.current;
    wheel.accumulated += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    window.clearTimeout(wheel.timer);
    wheel.timer = window.setTimeout(() => { wheel.accumulated = 0; }, 180);
    if (Math.abs(wheel.accumulated) >= 60) {
      step(Math.sign(wheel.accumulated));
      wheel.accumulated = 0;
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (phaseRef.current !== "browse") return;
    const moves: Record<string, () => void> = {
      ArrowRight: () => step(1),
      ArrowLeft: () => step(-1),
      Home: () => goTo(0),
      End: () => goTo(countRef.current - 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    keyboardNavRef.current = event.target instanceof HTMLElement && event.target.classList.contains("deck-card-button");
    move();
  }

  const activePlayer = players[active];
  const activeIdentity = identities[active];

  return (
    <section
      className={`deck deck-mode-${mode}${phase === "focus" ? " deck-focused" : ""}`}
      data-mode={mode}
      aria-roledescription="carrossel"
      aria-label="Cartas dos jogadores"
    >
      <div className="deck-scene" ref={sceneRef}>
        <canvas ref={canvasRef} className="deck-light" aria-hidden="true" />
        <div className="deck-floor" aria-hidden="true" />
        <div
          className="deck-viewport"
          onPointerDown={handlePointerDown}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
        >
          <div className="deck-ring" ref={ringRef}>
            {players.map((player, index) => {
              const identity = identities[index];
              const isActive = index === active;
              return (
                <div
                  key={player.id}
                  ref={(element) => { slotRefs.current[index] = element; }}
                  className={`deck-slot${isActive ? " deck-slot-active" : ""}${phase === "focus" && isActive ? " deck-slot-chosen" : ""}`}
                  style={{ visibility: "hidden" } as CSSProperties}
                >
                  <span className="deck-rail" aria-hidden="true" />
                  <span className="deck-clip" aria-hidden="true" />
                  <button
                    ref={(element) => { buttonRefs.current[index] = element; }}
                    type="button"
                    className="deck-card-button"
                    tabIndex={isActive && phase === "browse" ? 0 : -1}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`${player.name} — carta ${identity.rank} de ${identity.suitName}${isActive ? ". Toque para escolher" : ""}`}
                    onClick={() => handleCardClick(index)}
                    onPointerMove={(event) => handleHover(event, index)}
                    onPointerLeave={resetHover}
                  >
                    <div className="deck-card" ref={(element) => { cardRefs.current[index] = element; }}>
                      <TrucoPlayerCard name={player.name} identity={identity} className="deck-card-front" />
                      <div className="deck-card-back" aria-hidden="true">
                        <span className="deck-card-back-emblem">
                          <b>♠ ♥</b>
                          <strong>Truco do Novo</strong>
                          <b>♦ ♣</b>
                        </span>
                      </div>
                    </div>
                  </button>
                  <span className="deck-shadow" aria-hidden="true" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {phase === "browse" ? (
        <div className="deck-panel">
          <div className="deck-nav">
            <button type="button" className="deck-arrow" aria-label="Carta anterior" onClick={() => step(-1)} disabled={active === 0}>
              <span aria-hidden="true">‹</span>
            </button>
            <div className="deck-info" aria-live="polite">
              <strong className="deck-info-name">{activePlayer?.name}</strong>
              <span className="deck-info-meta">
                {activeIdentity && (
                  <span className={`deck-info-suit${activeIdentity.isRed ? " deck-info-suit-red" : ""}`}>
                    {activeIdentity.rank}{activeIdentity.suit}
                  </span>
                )}
                {activeIdentity?.manilha && <span className="deck-info-manilha">{activeIdentity.manilha}</span>}
                <span>Carta {active + 1} de {players.length}</span>
              </span>
            </div>
            <button type="button" className="deck-arrow" aria-label="Próxima carta" onClick={() => step(1)} disabled={active === players.length - 1}>
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <Button variant="secondary" className="deck-pick" onClick={() => choose(activeRef.current)}>
            Esta é a minha carta
          </Button>
          <p className="deck-hint">
            <span className="deck-hint-touch">Deslize para o lado e toque na sua carta</span>
            <span className="deck-hint-pointer">Arraste, use as setas ou clique na carta do centro</span>
          </p>
        </div>
      ) : (
        <div className="deck-panel deck-panel-focus">
          <span className="deck-kicker">Carta escolhida</span>
          <h2 className="deck-chosen-name">{activePlayer?.name}</h2>
          <div className="deck-focus-actions">
            <Button ref={confirmRef} className="deck-confirm" onClick={() => activePlayer && onConfirm(activePlayer)}>
              Entrar como {activePlayer?.name}
            </Button>
            <button type="button" className="deck-switch" onClick={backToBrowse}>
              Escolher outra carta
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
