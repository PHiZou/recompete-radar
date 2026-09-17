-- ============================================================================
--  LEARN SQL WITH SUNLIGHT  —  a hands-on tour of your own federal-contracts DB
-- ============================================================================
--
--  HOW TO RUN THESE
--  ----------------
--  Easiest (no install): Neon web console → your project → "SQL Editor".
--    Paste a query, hit Run. https://console.neon.tech
--  Or a Mac app: TablePlus / Postico / DBeaver, connected with your DATABASE_URL.
--  Or the terminal:  psql "$DATABASE_URL"   (then paste a query, end with ; )
--
--  THE THREE SCHEMAS (think of a schema as a folder of tables)
--  -----------------
--    raw.*         — the untouched download from USASpending (award_transactions)
--    dev_staging.* — cleaned/typed version of raw
--    dev_marts.*   — the finished, analysis-ready tables the website reads:
--                      mart_awards               (1 row per contract)
--                      mart_vendors              (1 row per company)
--                      mart_recompete_candidates (scored opportunities)
--                      mart_agency_summary       (rollups per agency)
--
--  Run the lessons top to bottom. Change numbers/names and re-run — that's how
--  you learn. You can't hurt anything by SELECTing.
-- ============================================================================


-- ── Lesson 1 · SELECT + LIMIT ───────────────────────────────────────────────
-- "Show me 10 rows so I can see what a contract looks like."
-- SELECT = what columns,  FROM = which table,  LIMIT = how many rows.
SELECT *
FROM dev_marts.mart_awards
LIMIT 10;


-- ── Lesson 2 · Pick specific columns ────────────────────────────────────────
-- * means "all columns". Usually you want just a few.
SELECT recipient_name, awarding_agency_name, total_obligated, pop_current_end_date
FROM dev_marts.mart_awards
LIMIT 10;


-- ── Lesson 3 · WHERE (filter rows) ──────────────────────────────────────────
-- "Only contracts at Homeland Security."   (= means exactly equal)
SELECT recipient_name, total_obligated, pop_current_end_date
FROM dev_marts.mart_awards
WHERE awarding_agency_name = 'Department of Homeland Security'
LIMIT 20;


-- ── Lesson 4 · ORDER BY (sort) ──────────────────────────────────────────────
-- "The 10 biggest contracts by dollars."  DESC = high→low, ASC = low→high.
SELECT recipient_name, awarding_agency_name, total_obligated
FROM dev_marts.mart_awards
ORDER BY total_obligated DESC
LIMIT 10;


-- ── Lesson 5 · COUNT (how many?) ────────────────────────────────────────────
-- COUNT(*) counts rows. Here: how many contracts do we have total?
SELECT COUNT(*) AS total_contracts
FROM dev_marts.mart_awards;


-- ── Lesson 6 · GROUP BY + SUM (the big one) ─────────────────────────────────
-- "Total obligated dollars, broken down by agency."
-- GROUP BY collapses rows into groups; SUM/COUNT/AVG summarize each group.
SELECT
    awarding_agency_name,
    COUNT(*)                              AS num_contracts,
    ROUND(SUM(total_obligated) / 1e6, 1)  AS total_millions
FROM dev_marts.mart_awards
GROUP BY awarding_agency_name
ORDER BY total_millions DESC;


-- ── Lesson 7 · HAVING (filter the groups) ───────────────────────────────────
-- WHERE filters rows BEFORE grouping; HAVING filters groups AFTER.
-- "Which companies have won more than $50M total?"
SELECT
    recipient_name,
    ROUND(SUM(total_obligated) / 1e6, 1) AS total_millions
FROM dev_marts.mart_awards
GROUP BY recipient_name
HAVING SUM(total_obligated) > 50000000
ORDER BY total_millions DESC;


-- ── Lesson 8 · JOIN (combine two tables) ────────────────────────────────────
-- A recompete candidate has a recipient_uei; the vendors table has richer
-- company info keyed by vendor_uei. JOIN stitches them on that shared key.
-- "Top scored opportunities, with the incumbent's lifetime footprint."
SELECT
    c.naics_description                         AS contract_type,
    c.awarding_sub_agency_name                  AS sub_agency,
    v.vendor_name                               AS incumbent,
    c.recompete_score,
    c.incumbent_strength,
    ROUND(v.lifetime_obligated / 1e6, 1)        AS incumbent_lifetime_millions
FROM dev_marts.mart_recompete_candidates c
JOIN dev_marts.mart_vendors v
  ON c.recipient_uei = v.vendor_uei
ORDER BY c.recompete_score DESC, c.total_obligated DESC
LIMIT 25;


-- ── Lesson 9 · Read the scoring (this is what the website shows) ─────────────
-- Each score is a probability from a small logistic model. Every input is a
-- named bucket (f_*), and each bucket carries a weight in log-odds (*_w; 0 =
-- the baseline bucket). Add the weights to the intercept, then squash:
--     p = 1 / (1 + exp(-(intercept + sum of weights)))
-- The weights live in dev_reference.score_weights. Change the WHERE to inspect
-- any single opportunity.
SELECT
    recipient_name,
    awarding_sub_agency_name,
    months_to_pop_end,
    recompete_score,                          -- 100 * followon_prob * (1 - retention_prob)
    incumbent_strength,                       -- 100 * retention_prob
    f_vehicle, f_rivals, ret_rivals_w,        -- why the incumbent is (not) strong
    f_share, ret_share_w,
    f_sole, ret_sole_source_w,
    f_dur_fo, fo_duration_w                   -- why it's likely to come back to market
FROM dev_marts.mart_recompete_candidates
ORDER BY recompete_score DESC
LIMIT 15;

-- And the weights themselves:
SELECT model, feature, level, weight, ROUND(EXP(weight), 2) AS odds_multiplier
FROM dev_reference.score_weights
ORDER BY model, feature, weight DESC;


-- ── Challenge · put it together ─────────────────────────────────────────────
-- "For each sub-agency, how many high-value recompete opportunities (score >= 50)
--  are coming up in the next 12 months, and what's the total dollar exposure?"
-- Try to write it yourself first, then compare:
SELECT
    awarding_sub_agency_name,
    COUNT(*)                               AS hot_opportunities,
    ROUND(SUM(total_obligated) / 1e6, 1)   AS exposure_millions
FROM dev_marts.mart_recompete_candidates
WHERE recompete_score >= 50
  AND months_to_pop_end <= 12
GROUP BY awarding_sub_agency_name
HAVING COUNT(*) >= 2
ORDER BY exposure_millions DESC;
