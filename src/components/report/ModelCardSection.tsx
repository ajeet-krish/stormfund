import type { ModelCard } from '../../data/findings'

/**
 * Model card section: public/data/model_card.json rendered as the trust
 * artifact for F3 (intended use, declared non uses, fairness caveats, and
 * the night before feature rule) with the metric grid judges read first.
 */

interface ModelCardSectionProps {
  modelCard: ModelCard
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export default function ModelCardSection({ modelCard }: ModelCardSectionProps) {
  const { data, split, metrics } = modelCard
  const cells: { label: string; value: string }[] = [
    { label: 'Model', value: modelCard.modelName },
    { label: 'Version', value: `${modelCard.modelVersion} / ${modelCard.framework}` },
    { label: 'Type', value: modelCard.modelType },
    { label: 'Random seed', value: String(modelCard.randomSeed) },
    { label: 'Rows modeled', value: `${data.rowsModeled} of ${data.rowCount}` },
    { label: 'Target', value: data.target },
    { label: 'Split', value: `${split.type}, ${split.splitDate}` },
    {
      label: 'Train / test',
      value: `${split.trainDays} / ${split.testDays} days, ${split.trainEvents} / ${split.testEvents} events`,
    },
    { label: 'Selected C', value: String(split.selectedC) },
    { label: 'Test AUC', value: metrics.testAuc.toFixed(3) },
    { label: 'Train AUC', value: metrics.trainAuc.toFixed(3) },
    { label: 'Accuracy at 0.5', value: pct(metrics.accuracyAtHalf) },
    { label: 'Majority baseline', value: pct(metrics.majorityAccuracy) },
    {
      label: 'Precision / recall',
      value: `${pct(metrics.precisionAtHalf)} / ${pct(metrics.recallAtHalf)}`,
    },
    { label: 'F1 at 0.5', value: metrics.f1AtHalf.toFixed(3) },
    {
      label: 'Alt target AUC',
      value: `${metrics.robustnessAlternativeTestAuc.toFixed(3)} (robustness target)`,
    },
  ]

  return (
    <section
      id="model-card"
      className="rp-finding"
      aria-labelledby="model-card-title"
    >
      <div className="rp-finding__rail">
        <p className="rp-finding__id" aria-hidden="true">
          MC
        </p>
        <p className="rp-finding__topic">deficit day model</p>
        <div className="rp-metric">
          <p className="rp-metric__value">{metrics.testAuc.toFixed(3)}</p>
          <p className="rp-metric__label">test AUC of the shipped model card</p>
          <p className="rp-metric__note">
            train {metrics.trainAuc.toFixed(3)}, split {split.splitDate}, seed{' '}
            {modelCard.randomSeed}
          </p>
        </div>
      </div>

      <div className="rp-finding__body">
        <p className="rp-eyebrow">Model card, emitted with F3</p>
        <h3 className="rp-question" id="model-card-title">
          {modelCard.modelName}
        </h3>

        <div className="rp-callout rp-callout-teal">
          <span className="rp-kicker">Intended use</span>
          <p>{modelCard.intendedUse}</p>
        </div>

        <dl className="rp-model__grid">
          {cells.map((cell) => (
            <div className="rp-model__cell" key={cell.label}>
              <dt>{cell.label}</dt>
              <dd>{cell.value}</dd>
            </div>
          ))}
        </dl>

        <div className="rp-callout">
          <span className="rp-kicker">Not intended for</span>
          <ul className="rp-limits">
            {modelCard.notIntendedUse.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>

        <div className="rp-callout">
          <span className="rp-kicker">Correlation, not causation</span>
          <p>{modelCard.correlationNotCausation}</p>
        </div>

        <details className="rp-details rp-details-method">
          <summary>How the features stay night before</summary>
          <div className="rp-details__body">
            <p>{data.nightBeforeRule}</p>
            <p>
              <strong>Excluded by design:</strong> {data.excludedByDesign}
            </p>
            <p>
              <strong>Continuous features:</strong> {data.continuousFeatures.join(', ')}
            </p>
          </div>
        </details>

        <details className="rp-details rp-details-limits">
          <summary>{`${modelCard.limitations.length} model limitations`}</summary>
          <div className="rp-details__body">
            <ul>
              {modelCard.limitations.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>
        </details>

        <details className="rp-details rp-details-limits">
          <summary>{`${modelCard.fairnessCaveats.length} fairness caveats`}</summary>
          <div className="rp-details__body">
            <ul>
              {modelCard.fairnessCaveats.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>
        </details>
      </div>
    </section>
  )
}
