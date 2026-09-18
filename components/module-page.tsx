import Link from "next/link";

type ModulePageProps = {
  kicker: string;
  title: string;
  description: string;
  primaryAction: string;
  cards: { label: string; value: string; hint: string }[];
  sections: { title: string; text: string; action?: string }[];
};

export function ModulePage({ kicker, title, description, primaryAction, cards, sections }: ModulePageProps) {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">{kicker}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button className="primary-button">{primaryAction}</button>
      </section>

      <section className="stat-grid">
        {cards.map((card) => (
          <article className="stat-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.hint}</small>
          </article>
        ))}
      </section>

      <section className="panel-grid">
        {sections.map((section) => (
          <article className="panel" key={section.title}>
            <div className="panel-head">
              <h2>{section.title}</h2>
              <span className="status-dot" />
            </div>
            <p>{section.text}</p>
            {section.action && <Link className="text-link" href="#">{section.action} →</Link>}
          </article>
        ))}
      </section>
    </div>
  );
}
