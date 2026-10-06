import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";

export function NotFoundPage() {
  return (
    <div className="container page-enter" style={{ paddingTop: "10vh" }}>
      <EmptyState
        icon="🂠"
        title="Página não encontrada"
        description="A página que você procura não existe ou foi movida."
        action={
          <Link to="/">
            <Button variant="secondary">Voltar ao início</Button>
          </Link>
        }
      />
    </div>
  );
}
