"use client";

import type { ReactNode } from "react";

type PlaceholderWorkspaceProps = {
  title: string;
  description: string;
  bullets: string[];
  aside?: ReactNode;
};

export function PlaceholderWorkspace({ title, description, bullets, aside }: Readonly<PlaceholderWorkspaceProps>) {
  return (
    <>
      <section className="hero-card">
        <div className="eyebrow">ANEXSYS</div>
        <h1 className="title">{title}</h1>
        <p>{description}</p>
      </section>

      <section className="card-grid">
        <article className="mini-card">
          <h3>O que esta tela cobre</h3>
          <ul className="placeholder-list">
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </article>
        <article className="mini-card">
          <h3>Observação</h3>
          <p>
            Esta tela ainda é um espaço reservado. O menu, o contexto ativo, o login e a navegação por acesso já estão prontos
            para validar a estrutura antes do restante do trabalho.
          </p>
        </article>
        {aside ? <article className="mini-card">{aside}</article> : null}
      </section>
    </>
  );
}
