"""F3: deficit day risk model (logistic regression) plus model card.

Target choice (documented in the model card): a deficit day is a calendar
day whose closing balance is negative (below 0 CAD). The data supports this
label with 86 events spread over six months, it needs no arbitrary threshold,
and it matches the persona's observed problem. The alternative next-day target
(below 1,000 CAD) is fit as a robustness check and its test AUC is reported.

Features (exactly the ledger derived set): trailing 7 day and 30 day net
flow, day of week indicators, month indicators, days since the most recent
payroll deposit, and trailing 30 day spend volatility. Every feature row
uses only information available the night before its day: the trailing
windows end at t minus 1, days since payroll is measured through t minus 1,
and the day of week and month indicators are calendar facts known in
advance, so day t itself never enters its own feature row. The current
closing balance is deliberately excluded so the model stays a forward
looking risk screen instead of an autoregressive identity.

Split: time ordered at 2026-02-01, the latest month start that leaves at
least 30 deficit events in the test segment. The logistic regularization
strength C is selected by time ordered cross validation (TimeSeriesSplit,
3 splits, roc_auc) inside the training window only.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from scripts.analysis.ledger import SEED, Ledger

SPLIT_DATE: str = "2026-02-01"
MIN_TEST_EVENTS: int = 30
C_GRID: list[float] = [0.01, 0.1, 1.0, 10.0]
CV_SPLITS: int = 3
CONTINUOUS_FEATURES: list[str] = [
    "net_flow_7d",
    "net_flow_30d",
    "spend_volatility_30d",
    "days_since_payday",
]

INTENDED_USE: str = (
    "Educational early warning on this ledger: rank days of the same account "
    "by deficit risk so a report reader or a game mechanic can point at the "
    "conditions that precede an overdraft. Every feature row uses only "
    "information available the night before the day it scores, so a score for "
    "day t is issued before day t happens. It is a demonstration artifact for "
    "the Sheridan Datathon 2026 entry, not a deployed underwriting tool."
)

NOT_INTENDED_USE: list[str] = [
    "Credit, lending, or any decision about a real person or account.",
    "Scoring customers of a bank or insurance product.",
    "Transferring the coefficients to a different account, year, or income "
    "cadence without refitting and revalidating.",
]

def limitation_items(sample_count: int, event_count: int) -> list[str]:
    """Limitations with the sample and event counts taken from this run."""
    return [
        f"One synthetic account and one year of daily rows ({sample_count} "
        f"samples, {event_count} events): uncertainty around the test AUC is "
        "wide and no confidence interval is claimed.",
        "Strong concept drift: the account balance rises monotonically after "
        "the deficit season, so test months are out of distribution for the "
        "training months (train AUC versus test AUC in metrics shows the gap).",
        "The current closing balance is excluded by design, which keeps the "
        "model honest as a forward screen but caps discrimination; an "
        "autoregressive balance feature would score much higher and say less.",
        "Raw accuracy at the 0.5 threshold sits below the majority class "
        "baseline because the class balance shifts sharply between train and "
        "test; AUC is the headline metric and the confusion matrix is reported "
        "in full.",
        "Correlation, not causation: coefficients describe association inside "
        "this ledger. days_since_payday raising the odds does not mean waiting "
        "longer causes a deficit.",
        "Month indicators memorize this ledger's calendar (the November to "
        "April deficit season) and carry no meaning for another year.",
    ]


def fairness_caveat_items(train_rate: float, test_rate: float) -> list[str]:
    """Fairness caveats with the base rates measured on this split."""
    return [
        "The dataset has a single synthetic persona and no demographic fields; "
        "results cannot be attributed to any protected group and must not be "
        "used to group or rank real people.",
        "Because the persona is synthetic, any fairness assessment here is a "
        "method statement only: applying this recipe to real bank data would "
        "require subgroup calibration and a fairness review before use.",
        f"The strong train versus test base rate shift ({train_rate * 100:.0f} "
        f"percent versus {test_rate * 100:.0f} percent deficit days) means a "
        "fixed 0.5 threshold would over warn in the early period and under "
        "warn later; deployment would need recalibration, which is out of "
        "scope for this entry.",
        "Deficit labels reflect one account's trajectory; income shocks, "
        "employment changes, and emergency expenses are not modeled, so a low "
        "score is not evidence of financial wellbeing.",
    ]


def build_features(ledger: Ledger) -> pd.DataFrame:
    """Assemble the model matrix: continuous features plus indicators.

    Night before rule: every feature row holds only information available
    the night before that day. The trailing flow and volatility windows are
    computed over prior days (shift 1 before rolling), days since payroll is
    measured through the previous day, and the day of week and month
    indicators are calendar facts known in advance. The first ledger day has
    no prior night, so it carries NaN in the shifted features and run_f3
    drops that one row before fitting.
    """
    day_amount = ledger.daily_amount.astype("float64")
    day_spend = ledger.daily_spend.astype("float64")
    prior_amount = day_amount.shift(1)
    prior_spend = day_spend.shift(1)
    features = pd.DataFrame(index=ledger.day_index)
    features["net_flow_7d"] = prior_amount.rolling(7, min_periods=1).sum()
    features["net_flow_30d"] = prior_amount.rolling(30, min_periods=1).sum()
    features["spend_volatility_30d"] = prior_spend.rolling(30, min_periods=1).std().fillna(0.0)

    from scripts.analysis.ledger import payday_edges

    edges = payday_edges(ledger)
    days = ledger.day_index.to_numpy(dtype="datetime64[ns]")
    last_index = np.searchsorted(edges, days, side="right") - 1
    days_since = (days - edges[last_index]).astype("timedelta64[D]").astype(int)
    features["days_since_payday"] = pd.Series(days_since, index=ledger.day_index).shift(1)

    dow = pd.get_dummies(pd.Series(ledger.day_index.day_of_week), prefix="dow", dtype=float)
    dow.columns = ["dow_" + str(column).split("_")[1] for column in dow.columns]
    dow.index = ledger.day_index
    dow = dow.drop(columns=["dow_0"])
    month = pd.get_dummies(pd.Series(ledger.day_index.month), prefix="m", dtype=float)
    month.index = ledger.day_index
    month = month.drop(columns=["m_11"])
    frame = pd.concat([features, dow, month], axis=1)
    return frame.dropna(subset=CONTINUOUS_FEATURES)


def make_pipeline(c_value: float) -> Pipeline:
    """Standardize continuous features and fit L2 logistic regression."""
    return Pipeline(
        steps=[
            (
                "prep",
                ColumnTransformer(
                    transformers=[("num", StandardScaler(), CONTINUOUS_FEATURES)],
                    remainder="passthrough",
                ),
            ),
            (
                "clf",
                LogisticRegression(max_iter=2000, C=c_value, random_state=SEED),
            ),
        ]
    )


def select_model(
    features: pd.DataFrame, target: pd.Series, train_mask: np.ndarray
) -> tuple[Pipeline, dict[str, object]]:
    """Time ordered CV on the training window only, then fit on all train rows."""
    grid = {"clf__C": C_GRID}
    search = GridSearchCV(
        make_pipeline(1.0),
        grid,
        cv=TimeSeriesSplit(n_splits=CV_SPLITS),
        scoring="roc_auc",
    )
    search.fit(features.loc[train_mask], target.loc[train_mask])
    cv_scores = {
        str(c): round(float(score), 6)
        for c, score in zip(C_GRID, search.cv_results_["mean_test_score"])
    }
    chosen = float(search.best_params_["clf__C"])
    info: dict[str, object] = {
        "selectedC": chosen,
        "cvMeanTestAucByC": cv_scores,
        "cvSplits": CV_SPLITS,
        "cvScheme": "TimeSeriesSplit on the training window only, scoring roc_auc",
    }
    return search.best_estimator_, info


def direction_text(coefficient: float, feature: str) -> str:
    """Human readable direction statement for one coefficient."""
    rises = coefficient > 0
    if feature in CONTINUOUS_FEATURES:
        verb = "raises" if rises else "lowers"
        return f"a one standard deviation increase {verb} the odds of a deficit day"
    verb = "raises" if rises else "lowers"
    return f"presence of this indicator {verb} the odds versus the reference level"


def fit_target(
    features: pd.DataFrame,
    target: pd.Series,
    train_mask: np.ndarray,
    test_mask: np.ndarray,
) -> dict[str, Any]:
    """Fit one target and return its full metric block."""
    model, cv_info = select_model(features, target, train_mask)
    train_prob = model.predict_proba(features.loc[train_mask])[:, 1]
    test_prob = model.predict_proba(features.loc[test_mask])[:, 1]
    test_pred = (test_prob >= 0.5).astype(int)
    auc_train = float(roc_auc_score(target.loc[train_mask], train_prob))
    auc_test = float(roc_auc_score(target.loc[test_mask], test_prob))
    tn, fp, fn, tp = (
        int(value)
        for value in confusion_matrix(target.loc[test_mask], test_pred).ravel()
    )
    fpr, tpr, _ = roc_curve(target.loc[test_mask], test_prob)
    return {
        "model": model,
        "cvInfo": cv_info,
        "metrics": {
            "trainAuc": round(auc_train, 6),
            "testAuc": round(auc_test, 6),
            "accuracyAtHalf": round(float(accuracy_score(target.loc[test_mask], test_pred)), 6),
            "majorityAccuracy": round(
                float(max(1.0 - target.loc[test_mask].mean(), target.loc[test_mask].mean())), 6
            ),
            "precisionAtHalf": round(float(precision_score(target.loc[test_mask], test_pred, zero_division=0)), 6),
            "recallAtHalf": round(float(recall_score(target.loc[test_mask], test_pred)), 6),
            "f1AtHalf": round(float(f1_score(target.loc[test_mask], test_pred, zero_division=0)), 6),
            "confusion": {"trueNegative": tn, "falsePositive": fp, "falseNegative": fn, "truePositive": tp},
            "trainEvents": int(target.loc[train_mask].sum()),
            "testEvents": int(target.loc[test_mask].sum()),
            "trainDays": int(train_mask.sum()),
            "testDays": int(test_mask.sum()),
        },
        "roc": {
            "fpr": [round(float(value), 6) for value in fpr],
            "tpr": [round(float(value), 6) for value in tpr],
        },
    }


def coefficient_rows(model: Pipeline, feature_names: list[str]) -> list[dict[str, Any]]:
    """Standardized coefficient table sorted by absolute magnitude.

    The output column order of the ColumnTransformer is the continuous
    features first (in CONTINUOUS_FEATURES order) then the untouched
    indicators in their original order, which matches the input frame
    because build_features places the continuous columns first.
    """
    coefficients = model.named_steps["clf"].coef_[0]
    if len(feature_names) != len(coefficients):
        raise ValueError("feature name and coefficient counts differ")
    rows: list[dict[str, Any]] = []
    for name, coefficient in zip(feature_names, coefficients):
        value = float(coefficient)
        rows.append(
            {
                "feature": str(name),
                "standardizedCoefficient": round(value, 6),
                "direction": direction_text(value, str(name)),
            }
        )
    rows.sort(key=lambda row: -abs(row["standardizedCoefficient"]))
    return rows


def latest_month_start_split(target: pd.Series, day_index: pd.DatetimeIndex) -> str:
    """Latest month start whose test segment keeps at least MIN_TEST_EVENTS events.

    The split grid is month starts only, which keeps the documented date on a
    clean boundary while still being chosen by the data.
    """
    labels = [
        str(day.date())
        for day in day_index.to_period("M").unique().to_timestamp()
    ]
    events = target.to_numpy()
    best: str | None = None
    for label in labels[1:]:
        if int((day_index >= pd.Timestamp(label)).sum()) == 0:
            continue
        test_events = int(events[day_index >= pd.Timestamp(label)].sum())
        if test_events >= MIN_TEST_EVENTS:
            best = label
    if best is None:
        raise ValueError("no month start leaves enough deficit events for a test set")
    return best


def run_f3(ledger: Ledger) -> tuple[dict[str, Any], dict[str, Any]]:
    """Compute finding F3 and its model card as JSON ready dicts."""
    features = build_features(ledger)
    # Night before alignment: features hold information through day t minus 1
    # (build_features drops the first ledger day, which has no prior night),
    # while the label is the closing balance sign of day t itself.
    target = (ledger.daily_close < 0).astype(int).loc[features.index]
    day_index = features.index
    chosen = latest_month_start_split(target, day_index)
    if chosen != SPLIT_DATE:
        raise ValueError(
            f"split rule selects {chosen} but SPLIT_DATE documents {SPLIT_DATE}"
        )
    split = pd.Timestamp(SPLIT_DATE)
    train_mask = (day_index < split).astype(bool)
    test_mask = ~train_mask
    test_events = int(target.to_numpy()[test_mask].sum())
    if test_events < MIN_TEST_EVENTS:
        raise ValueError(
            f"test segment holds {test_events} deficit events, "
            f"fewer than the required {MIN_TEST_EVENTS}"
        )

    primary = fit_target(features, target, train_mask, test_mask)

    alternative = (ledger.daily_close.shift(-1) < 100_000).astype(int).loc[features.index]
    alternative.iloc[-1] = 0
    robustness = fit_target(features, alternative, train_mask, test_mask)

    sample_count = int(len(features))
    event_count = int(target.sum())
    train_rate = float(target.to_numpy()[train_mask].mean())
    test_rate = float(target.to_numpy()[test_mask].mean())
    limitations = limitation_items(sample_count, event_count)
    fairness_caveats = fairness_caveat_items(train_rate, test_rate)

    coefficients = coefficient_rows(primary["model"], list(features.columns))
    numbers = dict(primary["metrics"])
    numbers.update(
        {
            "splitDate": SPLIT_DATE,
            "targetDefinition": (
                "same day deficit: closing balance below 0 CAD on that calendar "
                "day (86 events in the ledger)"
            ),
            "decisionRule": "predicted deficit when probability is at or above 0.5",
            "robustnessAlternativeTarget": (
                "next day closing balance below 1,000 CAD (threshold variant)"
            ),
            "robustnessAlternativeTestAuc": robustness["metrics"]["testAuc"],
            "selectedC": primary["cvInfo"]["selectedC"],
            "cvMeanTestAucByC": primary["cvInfo"]["cvMeanTestAucByC"],
            "randomSeed": SEED,
            "featureNames": list(features.columns),
            "continuousFeatures": list(CONTINUOUS_FEATURES),
        }
    )

    finding: dict[str, Any] = {
        "question": "Can the ledger predict a deficit day before it happens?",
        "method": (
            "L2 logistic regression (scikit-learn) on daily rows with trailing "
            "7 and 30 day net flow, day of week and month indicators, days "
            "since payroll, and trailing 30 day spend volatility; every "
            "feature row uses only information available the night before day "
            "t (trailing windows end at t minus 1, days since payroll is "
            "measured through t minus 1, and the indicators are calendar "
            "facts known in advance), so day t never contributes to its own "
            "feature row; target is a same day negative closing balance. "
            f"Time ordered split at {SPLIT_DATE}; C chosen by {CV_SPLITS} fold "
            "time ordered CV inside the training window; metrics on the held "
            "out test segment."
        ),
        "numbers": numbers,
        "coefficients": coefficients,
        "limitations": limitations,
        "chartTwin": {
            "roc": primary["roc"],
            "coefficients": [
                {
                    "feature": str(row["feature"]),
                    "coefficient": row["standardizedCoefficient"],
                }
                for row in coefficients[:10]
            ],
            "auc": primary["metrics"]["testAuc"],
        },
    }

    model_card: dict[str, Any] = {
        "modelName": "Ledger Odyssey deficit day risk",
        "modelVersion": "1.0",
        "modelType": (
            "Logistic regression, L2 penalty, scikit-learn 1.9.1 "
            f"(lbfgs, max_iter 2000, random_state {SEED})"
        ),
        "framework": "scikit-learn 1.9.1 via uv, Python 3.14",
        "randomSeed": SEED,
        "intendedUse": INTENDED_USE,
        "notIntendedUse": list(NOT_INTENDED_USE),
        "data": {
            "source": "public/data/transactions.json built from data/mock/tangerine_transactions.csv",
            "syntheticNotice": (
                "The ledger is SYNTHETIC: seed 20261107, generator "
                "scripts/generate_mock_ledger.py, no real bank data. The model "
                "and its recipe transfer unchanged to the real Tangerine "
                "dataset; only the input CSV changes."
            ),
            "rowCount": int(len(ledger.frame)),
            "dateRange": {
                "start": str(ledger.day_index[0].date()),
                "end": str(ledger.day_index[-1].date()),
            },
            "rowsModeled": int(len(features)),
            "target": numbers["targetDefinition"],
            "alternativeTargetConsidered": (
                "next day closing balance below 1,000 CAD; fit as robustness "
                "on the same night before feature rows, so that check reads "
                "as a two day ahead screen (test AUC reported in "
                "metrics.robustnessAlternativeTestAuc). The same day negative "
                "label was chosen because it is threshold free and the data "
                "supports it with 86 events."
            ),
            "features": {
                "continuous": list(CONTINUOUS_FEATURES),
                "indicators": "day of week (7 levels, Monday reference) and month (12 levels, November reference)",
                "nightBeforeRule": (
                    "every feature row uses only information available the "
                    "night before day t: trailing windows end at t minus 1, "
                    "days since payroll is measured through t minus 1, and "
                    "the day of week and month indicators are calendar facts "
                    "known in advance; day t itself never enters its own "
                    "feature row (the first ledger day has no prior night and "
                    "is not modeled)"
                ),
                "excludedByDesign": (
                    "current closing balance; excluding it keeps the model a "
                    "forward looking screen instead of an identity"
                ),
            },
        },
        "split": {
            "type": "time ordered, no shuffling",
            "splitDate": SPLIT_DATE,
            "trainDays": int(train_mask.sum()),
            "testDays": int(test_mask.sum()),
            "trainEvents": int(target.to_numpy()[train_mask].sum()),
            "testEvents": int(target.to_numpy()[test_mask].sum()),
            "splitRule": (
                f"latest month start that leaves at least {MIN_TEST_EVENTS} deficit "
                "events in the test segment (enforced in code, so the documented "
                "date cannot drift from the data)"
            ),
            "hyperparameterSelection": primary["cvInfo"]["cvScheme"],
            "selectedC": primary["cvInfo"]["selectedC"],
            "cvMeanTestAucByC": primary["cvInfo"]["cvMeanTestAucByC"],
        },
        "metrics": dict(numbers),
        "topCoefficients": coefficients[:8],
        "allCoefficients": coefficients,
        "limitations": limitations,
        "fairnessCaveats": fairness_caveats,
        "correlationNotCausation": (
            "These coefficients are associations observed in one synthetic "
            "ledger. They do not establish that changing a feature would "
            "change the deficit risk, and they must not be presented as "
            "causal effects or used to make decisions about real people."
        ),
    }
    return finding, model_card
