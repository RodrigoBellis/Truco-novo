import { useState } from "react";
import type { SimulationReport } from "@truco/shared";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Loading } from "../../components/ui/Loading";
import { EmptyState } from "../../components/ui/EmptyState";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { AnimatedBorderCard } from "../../components/ui/AnimatedBorderCard";
import { useFetchData } from "../../hooks/useFetchData";
import { useToast } from "../../hooks/useToast";
import { getSimulationAvailability, runSimulation, resetSimulation } from "../../services/simulationService";
import { ApiError } from "../../services/api";
import { IS_DEV_BUILD } from "../../utils/navigation";
import "./AdminSimulationPage.css";

type PendingAction = "run" | "reset";

export function AdminSimulationPage() {
  const { data: availability, isLoading } = useFetchData(getSimulationAvailability);
  const { showToast } = useToast();

  const [report, setReport] = useState<SimulationReport | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleRun() {
    setIsBusy(true);
    try {
      const result = await runSimulation();
      setReport(result);
      showToast(result.status === "SIMULAÇÃO APROVADA" ? "success" : "error", result.status);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível executar a simulação.");
    } finally {
      setIsBusy(false);
      setPendingAction(null);
    }
  }

  async function handleReset() {
    setIsBusy(true);
    try {
      await resetSimulation();
      setReport(null);
      showToast("success", "Simulação reiniciada. Projeto de volta ao estado inicial.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Não foi possível reiniciar a simulação.");
    } finally {
      setIsBusy(false);
      setPendingAction(null);
    }
  }

  if (isLoading) return <Loading fullHeight label="Verificando ambiente..." />;

  if (!IS_DEV_BUILD || !availability?.enabled) {
    return (
      <div>
        <PageHeader title="Simulação" />
        <EmptyState
          icon="🔒"
          title="Modo de simulação indisponível"
          description="Este modo existe apenas no ambiente local de desenvolvimento."
        />
      </div>
    );
  }

  const approved = report?.status === "SIMULAÇÃO APROVADA";

  return (
    <div>
      <PageHeader
        title="Simular Campeonato Completo"
        subtitle={`Modo de teste local · ambiente "${availability.environment}" · seed ${availability.defaultSeed}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPendingAction("reset")} disabled={isBusy}>
              Reiniciar Simulação
            </Button>
            <Button onClick={() => setPendingAction("run")} isLoading={isBusy && pendingAction === "run"}>
              Simular Campeonato Completo
            </Button>
          </>
        }
      />

      <Card className="simulation-intro">
        <p className="text-muted">
          Executa todo o fluxo do campeonato com dados determinísticos: sorteio, fase de grupos, classificação, mata-mata,
          semifinais, final, campeão, ranking e histórico — validando cada regra ao final. Nenhum dado é persistido fora da
          memória local.
        </p>
      </Card>

      {!report ? (
        <EmptyState
          icon="🧪"
          title="Nenhuma simulação executada"
          description="Clique em “Simular Campeonato Completo” para executar e validar o fluxo inteiro."
        />
      ) : (
        <div className="simulation-report">
          {approved ? (
            <AnimatedBorderCard duration={4}>
              <Card accent="gold" className="simulation-status simulation-status-ok">
                <span className="simulation-status-label">Status final</span>
                <strong>{report.status}</strong>
                <span className="text-muted">
                  {report.checks.length} validações executadas · {report.errors.length} erros · {report.warnings.length} avisos
                </span>
              </Card>
            </AnimatedBorderCard>
          ) : (
            <Card className="simulation-status simulation-status-fail">
              <span className="simulation-status-label">Status final</span>
              <strong>{report.status}</strong>
              <span className="text-muted">
                {report.errors.length} erro(s) encontrado(s) em {report.checks.length} validações.
              </span>
            </Card>
          )}

          <div className="simulation-metrics">
            <Card className="simulation-metric">
              <span className="text-faint">Jogadores</span>
              <strong>{report.totalPlayers}</strong>
            </Card>
            <Card className="simulation-metric">
              <span className="text-faint">Duplas</span>
              <strong>
                {report.approvedTeams}
                <small className="text-faint"> / {report.totalTeams}</small>
              </strong>
            </Card>
            <Card className="simulation-metric">
              <span className="text-faint">Partidas — grupos</span>
              <strong>{report.groupMatches}</strong>
            </Card>
            <Card className="simulation-metric">
              <span className="text-faint">Partidas — eliminatórias</span>
              <strong>{report.knockoutMatches}</strong>
            </Card>
            <Card className="simulation-metric">
              <span className="text-faint">Total de partidas</span>
              <strong>{report.totalMatches}</strong>
            </Card>
            <Card className="simulation-metric">
              <span className="text-faint">Seed</span>
              <strong>{report.seed}</strong>
            </Card>
          </div>

          <div className="simulation-columns">
            <Card>
              <h3>Campeão e vice</h3>
              <dl className="simulation-final">
                <div>
                  <dt>Campeão</dt>
                  <dd className="text-gold">{report.final.championTeamName ?? "—"}</dd>
                </div>
                <div>
                  <dt>Vice-campeão</dt>
                  <dd>{report.final.runnerUpTeamName ?? "—"}</dd>
                </div>
                <div>
                  <dt>Resultado da final</dt>
                  <dd>{report.final.finalScore ?? "—"}</dd>
                </div>
              </dl>
            </Card>

            {report.groups.map((group) => (
              <Card key={group.id}>
                <h3>{group.name}</h3>
                <ol className="simulation-group-list">
                  {group.teamNames.map((name, index) => (
                    <li key={name}>
                      <span className="simulation-group-position">{index + 1}º</span>
                      <span>{name}</span>
                      {index === 0 && <Badge tone="gold">Semifinal</Badge>}
                      {index > 0 && index < 5 && <Badge tone="green">Mata-mata</Badge>}
                      {index === 5 && <Badge tone="danger">Eliminado</Badge>}
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
          </div>

          <Card>
            <h3>Validações automáticas</h3>
            <ul className="simulation-checks">
              {report.checks.map((check) => (
                <li key={check.id} className={check.passed ? "simulation-check-ok" : `simulation-check-${check.severity}`}>
                  <span className="simulation-check-mark">{check.passed ? "✓" : check.severity === "aviso" ? "!" : "×"}</span>
                  <div>
                    <strong>{check.label}</strong>
                    <p className="text-muted">{check.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div className="simulation-columns">
            <Card>
              <h3>Erros encontrados</h3>
              {report.errors.length === 0 ? (
                <p className="text-muted">Nenhum erro encontrado.</p>
              ) : (
                <ul className="simulation-issue-list simulation-issue-error">
                  {report.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h3>Avisos encontrados</h3>
              {report.warnings.length === 0 ? (
                <p className="text-muted">Nenhum aviso encontrado.</p>
              ) : (
                <ul className="simulation-issue-list simulation-issue-warning">
                  {report.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingAction !== null}
        title={pendingAction === "reset" ? "Reiniciar simulação?" : "Simular campeonato completo?"}
        description={
          pendingAction === "reset"
            ? "O projeto volta ao estado inicial: sem grupos sorteados, sem resultados e sem campeão. Jogadores, duplas e dados-base são preservados."
            : "Todos os dados atuais de sorteio e resultados serão substituídos pela simulação determinística."
        }
        tone={pendingAction === "reset" ? "danger" : "default"}
        confirmLabel={pendingAction === "reset" ? "Reiniciar" : "Simular"}
        isConfirming={isBusy}
        onConfirm={pendingAction === "reset" ? handleReset : handleRun}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
